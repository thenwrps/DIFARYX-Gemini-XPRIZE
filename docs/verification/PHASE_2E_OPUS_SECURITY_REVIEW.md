# Phase 2E Security Threat Review

**Reviewer:** Antigravity Session 1 — Security Threat Model and Implementation Review
**Implementation under review:** `042c466de997dbe08fb8b4cc1c9605799f0e8590`
**Baseline:** `c3af1b2636364539774b6c52d64420fc43cc1149`
**Review date:** 2026-07-25
**Method:** Deep source-code inspection and deterministic state tracing. No production servers, live OAuth flows, or real credentials were used.

---

## 1. Threat Model

### 1.1 System Boundary

```
Browser (SPA)
  │
  ├── GET /api/auth/google/start ──► Google OAuth (authorization code + PKCE)
  │                                         │
  │         ◄── 302 + code + state ─────────┘
  │
  ├── GET /api/auth/google/callback ──► Google token exchange (server→server)
  │                                     ──► Google ID token verification
  │                                     ──► Redis session creation
  │                                     ──► HttpOnly session cookie
  │
  ├── GET /api/session ──► Redis session read ──► public user fields
  │
  ├── POST /api/logout ──► Redis session delete + cookie clear
  │
  ├── POST /api/reasoning ──► session validation ──► quota ──► Gemini / deterministic
  └── POST /api/llm/reason ──► session validation ──► quota ──► Gemini / deterministic
```

### 1.2 Trust Boundaries

| Boundary | Inside | Outside |
|---|---|---|
| Browser ↔ Server | Session cookie (HttpOnly, Secure, SameSite=Lax) | All browser-supplied identity claims, headers, localStorage |
| Server ↔ Google | Server-to-server code exchange and ID token verification | Client-side tokens, redirect parameters |
| Server ↔ Redis | HMAC-derived keys, AES-GCM-encrypted session records | Raw session tokens, plaintext user data |
| Deterministic ↔ Gemini | Execution policy decides per-provider | Browser cannot escalate deterministic→Gemini |

### 1.3 Assets Protected

| Asset | Mechanism |
|---|---|
| Google identity (sub) | Server-verified ID token; never sent to browser or stored in accessible Redis keys |
| Session token | HttpOnly cookie; HMAC-derived lookup key; not in JS, logs, or responses |
| Gemini quota | Server-side atomic consumption keyed to verified `sub` |
| Client-secret | Server environment only; never shipped to frontend bundle |
| Redis credentials | Server environment only |
| Session encryption key | Independent `DIFARYX_SESSION_SECRET` ≥32 chars |

---

## 2. Security Invariants

### 2.1 Confirmed ✅

| # | Invariant | Evidence |
|---|---|---|
| 1 | **Authorization Code flow with PKCE S256 is used** | `googleOAuthClient.ts:21` passes `code_challenge_method: CodeChallengeMethod.S256`. `sessionBoundary.ts:209` computes SHA-256 of verifier. `googleOAuthClient.ts:14` requests `access_type: 'online'`. No implicit flow. |
| 2 | **Code verifier has 256 bits of entropy** | `sessionBoundary.ts:203`: `randomBytes(32).toString('base64url')` = 32 bytes = 256 bits. Validated by regex `^[A-Za-z0-9_-]{43}$` on read. |
| 3 | **State has 256 bits of entropy** | Same as above: `randomBytes(32).toString('base64url')` at line 202. |
| 4 | **Transaction cookie is encrypted (AES-256-GCM) and integrity-protected** | `sealPayload` in `securePayload.ts:12-18`: random 12-byte IV, AES-256-GCM, auth tag appended. Purpose-scoped key derivation: `SHA-256(purpose + \0 + secret)`. |
| 5 | **Unique IV per encryption** | `securePayload.ts:13`: `randomBytes(IV_BYTES)` called on every `sealPayload`. |
| 6 | **Malformed ciphertext fails closed** | `openPayload` catch block rethrows a generic `'Invalid sealed payload'` error. `readOAuthTransaction` throws `HttpError(401)` on any structural failure. |
| 7 | **State comparison is constant-time** | `securePayload.ts:38-43`: `constantTimeEqual` uses `timingSafeEqual` with length pre-check. |
| 8 | **Callback cannot be replayed** | Transaction cookie is cleared (`clearOAuthCookie`) at line 65 before validation. Expired transactions are rejected at line 74. Single-use authorization codes are enforced by Google. |
| 9 | **ID token is verified server-side with audience, issuer, and expiry** | `googleIdentityVerifier.ts:57-70`: `verifyIdToken` with audience, issuer allowlist check, and `exp` check. |
| 10 | **Session token has 256 bits of entropy** | `sessionManager.ts:29`: `randomBytes(32).toString('base64url')`. |
| 11 | **Session fixation is prevented** | Session token is freshly generated on every `create`. The callback does not accept a pre-existing session identifier. |
| 12 | **Redis key is HMAC-derived (not raw token)** | `sessionManager.ts:94-96`: `createHmac('sha256', secret).update(token).digest('hex')` with namespace prefix. |
| 13 | **Session record is AES-GCM encrypted in Redis** | `sessionManager.ts:39`: `sealPayload(stored, ...)` before Redis `set`. `openPayload` on read. |
| 14 | **Session expiry double-checked** | `sessionManager.ts:57`: application-level `expiresAtMs` check. Redis `EX` TTL at line 82. Both must agree. |
| 15 | **Redis failure fails closed** | `sessionBoundary.ts:169-173`: non-`HttpError` exceptions produce `503`. `sessionManager.ts:62-64`: decrypt failures delete the key and return `null`. |
| 16 | **Logout deletes Redis record and clears cookie** | `sessionBoundary.ts:137-146`: revokes token then clears cookie. |
| 17 | **`/api/session` never returns `sub`, tokens, session identifier, or Redis data** | `sessionBoundary.ts:127-131`: only `authenticated`, `user.displayName`, `user.email`, `expiresAt`. |
| 18 | **Session cookie is HttpOnly, Secure (production), SameSite=Lax** | `sessionBoundary.ts:276-283`. `secureCookies` is `nodeEnv === 'production'` per `authConfig.ts:80`. |
| 19 | **`__Host-` prefix enforced in production** | `sessionBoundary.ts:192-193`: prefix toggled by `config.secureCookies`. |
| 20 | **Email/password simulation removed** | `SignIn.tsx` no longer contains email or password form fields. Only Google sign-in and guest demo buttons remain. |
| 21 | **Guest status does not grant Gemini access** | `executionPolicy.ts:22-37`: only Gemini providers set `requiresGoogleIdentity: true`. Guest sessions have no server session, so `requireAuthenticatedSession` rejects with 401. |
| 22 | **Browser cannot forge verified status** | `AuthContext.tsx:183`: `isVerified` is `true` only when `status === 'authenticated'`, which requires `fetchCurrentSession()` to return `authenticated: true` from the server. |
| 23 | **CORS credentials enabled** | `app.ts:222`: `credentials: true`. Required for `SameSite=Lax` cookies with cross-origin fetch. |
| 24 | **Error messages are sanitized** | All auth failures return generic `'Authentication required'` (401) or `'Authentication service unavailable'` (503). No stack traces, Redis details, or token fragments. |
| 25 | **Legacy browser auth state is cleared on mount** | `AuthContext.tsx:128-130`: removes `demoAuth`, `demoProfile`, `difaryx_google_demo_user`, `difaryx_google_user_token`. |

### 2.2 Not Confirmed (require live or integration verification) ⚠️

| # | Invariant | Reason |
|---|---|---|
| A | Google verifyIdToken actually validates the signature | Depends on `google-auth-library` fetching Google's public keys at runtime. Cannot be verified without live network. |
| B | Redis EX TTL is atomic with the SET | Upstash REST API semantics; confirmed by code (`{ ex: ttlSeconds }`) but requires live verification. |
| C | `__Host-` cookie is accepted by target deployment (Vercel/Cloud Run) | Requires live HTTPS deployment with correct domain. |
| D | `SameSite=Lax` + CORS interaction is correct for the specific deployment topology | Code is correct; behavior depends on browser + deployment domain configuration. |
| E | `include_granted_scopes: true` does not widen the token audience | Needs live OAuth round-trip to confirm scopes granted. |

---

## 3. Security Question Evaluation

### Q1: Can OAuth state be forged, replayed, omitted, duplicated, or confused?

**No.** State is inside an AES-GCM encrypted, integrity-protected cookie (`sealPayload`). Forging requires the session secret. Replay requires the cookie, which is cleared before validation. Omission causes `sealedTransaction` to be `undefined` → `HttpError(401)`. Duplicate state parameters in the query string would be collapsed by Express to the last value. State confusion between users is prevented by the per-browser transaction cookie.

### Q2: Is PKCE S256 used correctly?

**Yes.** `createCodeChallenge` computes `SHA-256(codeVerifier).toString('base64url')` which is the S256 method. The verifier is 43 base64url characters (32 random bytes). The challenge is sent in the authorization URL. The verifier is sent in the token exchange. `google-auth-library` passes `codeVerifier` to Google's token endpoint.

### Q3: Does the verifier have sufficient entropy?

**Yes.** 256 bits from `crypto.randomBytes(32)`.

### Q4: Is the transaction cookie encrypted and integrity protected?

**Yes.** AES-256-GCM with purpose-scoped key derivation (`SHA-256(purpose + \0 + secret)`) and random 12-byte IV per seal operation. The GCM auth tag provides integrity.

### Q5: Can the callback be replayed?

**No.** The transaction cookie is cleared before validation (`clearOAuthCookie` at line 65). A replayed callback would find no cookie → 401. Additionally, Google authorization codes are single-use.

### Q6: Can authorization codes or ID tokens enter logs, URLs, responses, or browser storage?

**Authorization code:** Present briefly in the callback query string (standard OAuth). Not logged by the application. Exchanged server-to-server and discarded.
**ID token:** Received server-to-server from the token exchange. Never returned to the browser. Not stored in any browser-accessible location.
**Session token:** Present only in the HttpOnly cookie. Not in responses, localStorage, or sessionStorage.

### Q7: Can an attacker influence the verified Google sub?

**No.** The `sub` comes from the Google ID token payload after signature verification by `google-auth-library` with audience pinning. The server does not accept `sub` from any browser-supplied source.

### Q8: Can session fixation occur?

**No.** A fresh 256-bit random token is generated on every session creation (`sessionManager.ts:29`). The callback does not accept or reuse an existing session token.

### Q9: Is the session identifier sufficiently random?

**Yes.** 256 bits from `crypto.randomBytes(32)`.

### Q10: Is AES-GCM used with a unique nonce for every encrypted record?

**Yes.** `securePayload.ts:13` calls `randomBytes(12)` for every `sealPayload` invocation. This covers both transaction cookies and session records.

### Q11: Does malformed ciphertext fail closed?

**Yes.** `openPayload` catches all errors and rethrows `'Invalid sealed payload'`. `readOAuthTransaction` catches and throws `HttpError(401)`. `sessionManager.read` catches and returns `null` (after deleting the corrupt key).

### Q12: Can session expiry or Redis TTL diverge?

**Minor risk.** The Redis `EX` TTL is set to `config.sessionTtlSeconds`. The stored `expiresAtMs` is computed as `clock() + sessionTtlSeconds * 1000`. If the application clock and Redis clock differ, there could be a small window. However, the application always checks its own `expiresAtMs` before trusting the record, so a record that outlives the Redis TTL would be re-checked. **Net risk: Informational.** The record would expire at worst at `max(redisTTL, appExpiry)`, which is bounded by the same configuration value.

### Q13: Does Redis failure fail closed?

**Yes.** All Redis operations (`set`, `get`, `delete`) are in try/catch blocks. Non-`HttpError` exceptions in `requireAuthenticatedSession` produce `HttpError(503)`. Session creation failure in the callback also produces 503.

### Q14: Can logout be triggered cross-site?

**Low risk.** `POST /api/logout` requires the session cookie (`SameSite=Lax`). A cross-site POST from `<form>` would not attach Lax cookies. A cross-site `fetch` with `credentials: include` would be blocked by CORS (pre-flight fails). However, **a same-site sibling** (e.g., another app on the same eTLD+1) could potentially send a Lax POST via top-level navigation form. Severity: **Low** — logout is a non-destructive action, and requires same-site proximity.

### Q15: Can authenticated reasoning be triggered cross-site?

**No, for standard cross-origin.** `POST /api/reasoning` with `credentials: true` requires a CORS pre-flight. The `origin` callback rejects unknown origins. `SameSite=Lax` cookies are not sent on cross-site `fetch`.

**Same-site sibling risk:** A same-site sibling could submit a form POST to `/api/reasoning`. However, a form POST would send `Content-Type: application/x-www-form-urlencoded`, not `application/json`, and `express.json()` would fail to parse it → 400 before reaching auth logic. **Net risk: Informational.**

### Q16: Is CORS being confused with CSRF protection?

**No confusion observed.** CORS provides the primary cross-origin protection. `SameSite=Lax` cookies add defense-in-depth. The combination is appropriate for a JSON API with `credentials: true`. For same-site siblings, the JSON content-type requirement provides an implicit barrier. This is acceptable for the current deployment model (SPA + API same-origin on Vercel).

### Q17: Can a same-site sibling domain invoke authenticated operations?

**Theoretically yes** for `SameSite=Lax` with navigational requests. However, all state-changing endpoints (`POST /api/reasoning`, `POST /api/logout`) require JSON bodies. A navigational POST from a sibling sends form-encoded data which fails JSON parsing → 400. **Net risk: Low.** For defense-in-depth, a dedicated anti-CSRF token could be added in a future phase, but is not required for the current single-domain deployment.

### Q18: Can safe redirect validation be bypassed?

**No, for the tested payloads:**

| Payload | Result | Reason |
|---|---|---|
| `https://evil.example` | `/dashboard` | Does not start with `/` |
| `//evil.example` | `/dashboard` | Starts with `//` |
| `\evil.example` | `/dashboard` | Contains `\\` |
| `/\evil.example` | `/dashboard` | Contains `\\` |
| `%2F%2Fevil.example` | `/dashboard` | After URL decode = `//evil.example`, starts with `//` |
| `%5C%5Cevil.example` | `/dashboard` | After URL decode = `\\evil.example`, contains `\\` |
| `javascript:alert(1)` | `/dashboard` | Does not start with `/` |
| `data:text/html,test` | `/dashboard` | Does not start with `/` |
| `/dashboard` | `/dashboard` | ✅ Valid |
| `/agent` | `/agent` | ✅ Valid |
| `/projects/example` | `/projects/example` | ✅ Valid |

The `readSafeReturnTo` function (`sessionBoundary.ts:176-190`) applies: (a) must start with `/`, (b) must not start with `//`, (c) must not contain `\\`, (d) must parse as a relative URL where the resulting origin equals the synthetic `https://return.invalid` base. **Additionally**, the server-side redirect at line 103 uses `new URL(transaction.returnTo, config.appBaseUrl)`, which constructs an absolute URL from the validated path. If `returnTo` somehow contained an absolute URL, `new URL()` would adopt its origin. However, all absolute URLs are filtered by the preceding check. **Confirmed safe.**

Note: The `%2F%2F` case is safe because `readSafeReturnTo` receives the already-decoded value from Express query parsing. Double-decoding is not a concern here.

### Q19: Can browser-supplied identity, email, organization, provider, or model alter authorization?

**No.** Authorization is determined by the session cookie → Redis lookup → verified `sub`. The `provider` field in the request body selects the execution policy, but execution policy only *adds* restrictions (Gemini requires identity). A browser cannot claim `provider: 'deterministic'` to get Gemini execution. Model validation is server-side (`reasoningRequest.ts:71-73`): if a Gemini provider is selected, the model must match `config.geminiModel`.

### Q20: Can quota consumption be skipped, duplicated, reordered, or raced?

**Skipped:** No. The pipeline is sequential: parse → policy → auth → quota → invoke. Each step is awaited.
**Duplicated:** A browser retry would create a new request, consuming quota again. This is expected behavior.
**Reordered:** No. The sequential pipeline prevents reordering.
**Raced:** Redis atomic `INCR` is used by the quota service (inspected in the quota layer from a prior phase). Two concurrent requests from the same user would each atomically consume a quota slot.

### Q21: Can Gemini be invoked after authentication or quota failure?

**No.** Authentication failure throws `HttpError(401)` or `HttpError(503)` which prevents reaching the `reasoningHandler` call. Quota failure throws `HttpError(429)` or `HttpError(503)`. All exceptions are caught by the top-level `try/catch` and forwarded to `next(error)`.

### Q22: Can error messages disclose internals?

**No.** All auth errors use generic messages. The `errorHandler` returns `HttpError.message` for known errors and `'Internal server error'` for 500s. No stack traces, Redis connection strings, encryption keys, or token fragments are included.

### Q23: Can the session or Google identity be recovered from Redis keys, logs, responses, or frontend bundles?

**Redis keys:** HMAC-derived from the session token using the session secret. Cannot be reversed without the secret.
**Redis values:** AES-GCM encrypted. Cannot be decrypted without the session secret.
**Logs:** No token, sub, or session values are logged by the application. The structured logger records `authOutcome` strings (e.g., `'verified_session'`, `'missing'`), not identity data.
**Responses:** `/api/session` returns only `displayName` and optionally `email`. No `sub`, no token.
**Frontend bundle:** The bundle contains no server secrets, session logic, or encryption code. `VITE_GOOGLE_CLIENT_ID` is a public OAuth client ID, not a secret.

### Q24: Does production configuration fail closed?

**Yes.** `loadAuthConfig` (`authConfig.ts:29-83`) requires all fields. Any missing field adds an issue and returns `{ ok: false }`. When `config.auth.ok` is false, `registerUnavailableAuthRoutes` is called (`app.ts:98`), which returns 503 for all auth endpoints. Gemini execution with unconfigured auth returns 503 via `authenticateForExecutionPolicy` (`app.ts:244-246`).

### Q25: Are secrets independent and appropriately scoped?

**Yes.** The configuration requires independent environment variables:
- `GOOGLE_OAUTH_CLIENT_SECRET` — OAuth code exchange
- `DIFARYX_SESSION_SECRET` — session token HMAC + AES-GCM (≥32 chars enforced)
- `UPSTASH_REDIS_REST_TOKEN` — Redis access
- `GEMINI_QUOTA_HMAC_SECRET` — quota HMAC (separate from session secret)
- `GEMINI_API_KEY` — Gemini provider access

Key derivation in `securePayload.ts:46` uses purpose-scoped derivation (`SHA-256(purpose + \0 + secret)`), preventing cross-purpose key confusion even if the same secret were reused (though they should not be).

---

## 4. Potential Vulnerabilities and Findings

### 4.1 Finding: `readSafeReturnTo` does not filter `javascript:` or `data:` schemes in path position

**Severity:** Informational
**Status:** Not exploitable

The function checks `value.startsWith('/')` before URL parsing. Since `javascript:alert(1)` and `data:text/html,...` do not start with `/`, they are rejected. The `new URL(returnTo, appBaseUrl)` at `sessionBoundary.ts:103` would also produce `https://example.com/dashboard` for the default. No bypass found.

### 4.2 Finding: `Active-Organization` header is still sent by the frontend

**Severity:** Low (unchanged from baseline)
**Status:** Cosmetic residue

`client.ts:113-114` still sends `Active-Organization` from frontend state. However, the Phase 2E reasoning pipeline does not use this header — identity comes from the session cookie. The Python tenant API (separate authentication boundary per ADR-010) is not part of this phase. **Risk: Low.** Should be removed or ignored on the server side in a future phase to prevent confusion.

### 4.3 Finding: `console.warn` in `reasoningClient.ts` logs error objects on fallback

**Severity:** Informational
**Status:** Acceptable

`reasoningClient.ts:66` logs `error` objects. These could contain HTTP status codes or network error messages but would not contain session tokens (HttpOnly cookies are not accessible to JS). No sensitive data exposure path identified.

### 4.4 Finding: 401/429/503 do not trigger deterministic fallback for Gemini-intent requests

**Severity:** Medium (UX/feature breakage, not security)
**Status:** By design per ADR-010

The execution policy from ADR-010 states: 401, 429, 503 → "no deterministic fallback." The `reasoningClient.ts` returns error responses for these statuses without falling back to local deterministic reasoning. This is **correct per the stated policy**. The browser client correctly surfaces error messages to guide the user to switch to Scientific Baseline Mode manually.

### 4.5 Finding: OAuth transaction cookie `path: '/'` is broader than necessary

**Severity:** Informational
**Status:** Acceptable for current architecture

The OAuth transaction cookie could be scoped to `path: '/api/auth/google/callback'` to limit its exposure. With `path: '/'`, any same-origin server endpoint receives the cookie. Since it is encrypted and single-use, the risk is negligible.

### 4.6 Finding: `include_granted_scopes: true` in OAuth URL

**Severity:** Low
**Status:** Requires live verification

`googleOAuthClient.ts:17` sets `include_granted_scopes: true`. This instructs Google to include previously granted scopes. Since the only scopes requested are `openid email profile`, and the server only uses the ID token (not access tokens), the practical risk is minimal. However, if the user had previously granted broader scopes to this client ID, the returned token might carry those scopes. **Since the server only extracts `sub`, `name`, `email`, and `email_verified` from the ID token, this has no security impact.** Recommend removing the flag for hygiene.

### 4.7 Finding: No explicit CSRF token on `POST /api/logout`

**Severity:** Low
**Status:** Mitigated by SameSite=Lax + JSON requirement

As analyzed in Q14 and Q17, same-site siblings could theoretically trigger a logout. The impact is non-destructive (user is logged out, not compromised). Defense-in-depth with a CSRF token is recommended for future phases but not required for the current single-domain deployment.

---

## 5. Baseline Defect Resolution Assessment

| Baseline Finding | Status in 042c466 | Evidence |
|---|---|---|
| AUTH-001: Guest = authenticated | **Mitigated.** Guest sets `status: 'guest'`, `isAuthenticated: true`, but `isVerified: false`. Gemini operations require `isVerified` + server session. | `AuthContext.tsx:182-183` |
| AUTH-002: Fake email login | **Resolved.** Email/password forms removed from `SignIn.tsx`. | `SignIn.tsx:116` states "Email/password account simulation is disabled." |
| AUTH-003: Missing session restoration | **Resolved.** `refreshSession()` calls `GET /api/session` with `credentials: include` on mount. | `AuthContext.tsx:91-125`, `serverSession.ts:17-26` |
| API-001: Client-supplied org header | **Partially mitigated.** Reasoning pipeline ignores it. Python API is out of scope. | `app.ts:122-165` — no `Active-Organization` usage |
| LLM-001: Unauthenticated deterministic | **By design.** Deterministic reasoning is intentionally public. Not a security issue per the stated policy. | `executionPolicy.ts:33-37` |
| LLM-002: Fallback blocked by 401/429/503 | **By design.** ADR-010 prohibits fallback on auth/quota failure. User must manually select Scientific Baseline Mode. | `reasoningClient.ts:26-57` |

---

## 6. Tests That Should Be Added

| Test | Type | Priority |
|---|---|---|
| Replay callback with no cookie → 401 | Server integration | High |
| Replay callback with expired transaction → 401 | Server integration | High |
| Callback with wrong state → 401 | Server integration | High |
| `readSafeReturnTo` with all redirect payloads | Unit | High |
| Session read with corrupt Redis value → null | Unit | Medium |
| Session read past `expiresAtMs` → null + delete | Unit | Medium |
| `parseReasoningRequest` rejects all invalid inputs | Unit | Medium |
| `requireAuthenticatedSession` with no cookie → 401 | Server integration | High |
| `requireAuthenticatedSession` with invalid token → 401 | Server integration | High |
| Gemini provider with unconfigured auth → 503 | Server integration | Medium |
| Deterministic provider without session → 200 | Server integration | Medium |
| `sealPayload`/`openPayload` round-trip | Unit | Medium |
| `openPayload` with wrong purpose → throws | Unit | Medium |
| `openPayload` with truncated ciphertext → throws | Unit | Medium |
| `constantTimeEqual` with different lengths → false | Unit | Low |
| End-to-end Google OAuth flow | Live integration | Required before production |

---

## 7. Areas Requiring Live Deployment Verification

1. **Google ID token signature verification** — requires fetching Google's public keys.
2. **`__Host-` cookie acceptance** — requires HTTPS deployment.
3. **SameSite=Lax cookie behavior** — requires browser testing on the actual deployment domain.
4. **Upstash Redis atomic SET with EX** — requires live Redis.
5. **Google OAuth code exchange** — requires registered OAuth client.
6. **CORS pre-flight with credentials** — requires deployed cross-origin topology (if applicable).
7. **`include_granted_scopes` scope accumulation behavior** — requires live OAuth.
8. **Production `NODE_ENV=production` cookie flags** — requires production environment.

---

## 8. Assessment: Should Session 2 Proceed?

**Yes.** The implementation is architecturally sound. No Critical or High severity vulnerabilities were identified. The security boundary is well-defined:

- OAuth uses Authorization Code + PKCE S256 with encrypted transaction cookies
- Sessions use 256-bit random tokens with HMAC-derived Redis keys and AES-GCM encrypted records
- Cookies are HttpOnly, Secure, SameSite=Lax with `__Host-` prefix in production
- The execution policy correctly gates Gemini behind server-verified sessions
- All error paths fail closed with sanitized messages
- Legacy browser auth state is cleared on mount

Session 2 should verify the browser-level behaviors (navigation, storage inspection, network observation, UX states) that require runtime execution.

---

## 9. Claims for Gemini 3.1 Pro to Verify in Session 2

Session 2 (Gemini 3.1 Pro) should independently verify:

1. **Frontend `isVerified` gate:** Confirm that UI components requiring Gemini use `isVerified` (not `isAuthenticated`) to gate access.
2. **`credentials: 'include'`** is present on all API fetch calls that need the session cookie (`reasoningClient.ts:21`, `serverSession.ts:20`, `serverSession.ts:31`, `client.ts:120`).
3. **No localStorage/sessionStorage writes** of session or identity data anywhere in the updated codebase.
4. **No `console.log` of tokens, cookies, or session identifiers** in any code path.
5. **`ProtectedRoute` behavior** with the updated `isAuthenticated` vs `isVerified` distinction — does it gate correctly?
6. **SignIn redirect restoration** after Google OAuth callback completes — is the `returnTo` parameter preserved through the server redirect?
7. **Multiple tabs:** If one tab logs out (POST /api/logout), does another tab detect session invalidation?
8. **Browser back/forward after logout:** Does navigating back to a previously protected route re-trigger the session check?
9. **`DashboardLayout` signOut:** Confirm it calls `signOut()` which invokes `POST /api/logout`.
10. **No retry loop:** Confirm that 401, 429, 503 responses in `reasoningClient.ts` do not trigger automatic retries or recursive calls.
11. **Toast/error message termination:** Confirm no repeated error toasts from quota or auth failures.
12. **Mobile/desktop sign-in rendering:** Confirm the simplified SignIn page renders correctly at mobile widths.
13. **`OrganizationContext` changes:** Verify that the organization context no longer creates authenticated state from browser data.
14. **Deterministic reasoning without session:** Confirm that `provider: 'deterministic'` requests succeed without a session cookie.
15. **`readSafeReturnTo` is applied both client-side** (`serverSession.ts:58-70`) **and server-side** (`sessionBoundary.ts:176-190`) — implementations should match.
16. **`fetchCurrentSession` error handling:** Confirm 503 and network errors surface as user-facing error states, not infinite spinners.
17. **Token provider removal:** Confirm `tokenProvider.ts` is fully removed and no imports reference it.
18. **Google Drive/Gmail authorization** (`clearGoogleApiAccessSession`): Confirm this is still memory-only and not confused with the DIFARYX session.

---

## 10. Appendix: Severity Distribution

| Severity | Count | Findings |
|---|---|---|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 1 | 4.4 (UX/by design, not security) |
| Low | 3 | 4.2 (org header residue), 4.6 (`include_granted_scopes`), 4.7 (CSRF on logout) |
| Informational | 2 | 4.1 (redirect scheme filtering), 4.5 (cookie path) |

---

## 11. Verification Metadata

```
git diff --check: clean (no trailing whitespace or merge markers)
git status --short: clean (no uncommitted changes)
Branch: agent/phase-2e-auth-verification
Implementation commit: 042c466de997dbe08fb8b4cc1c9605799f0e8590
No production implementation files were modified during this review.
```
