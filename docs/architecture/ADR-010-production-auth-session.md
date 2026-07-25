# ADR-010: Production authentication and session boundary

## Status

Accepted for Phase 2E code readiness. External OAuth and deployment
configuration remain manual release gates.

## Decision

DIFARYX uses a server-owned Google Authorization Code flow with PKCE. The
server creates a short-lived encrypted OAuth transaction cookie containing the
state, code verifier, safe return path, and expiry. The callback exchanges the
code server-to-server, verifies the returned ID token with the configured Web
client audience, Google issuer, expiry, and signature, and retains only the
verified stable `sub` as external identity authority.

The callback creates an opaque random DIFARYX session token. Only that token is
placed in a Secure, HttpOnly, SameSite=Lax cookie. Its HMAC-derived lookup key
maps to an AES-GCM-encrypted, TTL-bound session record in shared Redis. Raw
Google `sub` is therefore absent from Redis keys and values visible to Redis
operators without the independent session secret. Logout deletes the record;
expiry and corrupt records fail closed.

`GET /api/session` returns only `authenticated`, a bounded display name,
optional verified email, provider label, and expiry. It never returns Google
`sub`, OAuth tokens, the DIFARYX token, Redis data, or quota identifiers.

Both `POST /api/reasoning` and `POST /api/llm/reason` apply one order:

```text
runtime request schema
-> execution policy
-> DIFARYX session validation
-> quota configuration validation
-> atomic quota consumption
-> Gemini
```

Missing, expired, malformed, or revoked sessions return a sanitized 401.
Authentication infrastructure failure and quota infrastructure failure return
sanitized 503 categories. Quota exhaustion returns 429. None of these paths
invoke Gemini. A permitted provider attempt consumes quota exactly once before
invocation, including when a provider error produces the existing deterministic
fallback. Deterministic reasoning, health, and OPTIONS consume no quota.

## Deployment constraints

Production requires `APP_BASE_URL`, `GOOGLE_OAUTH_CLIENT_ID`,
`GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`,
`DIFARYX_SESSION_SECRET`, Upstash REST settings, the independent quota HMAC
secret, explicit global quota, and allowed browser origins. The callback URI
must exactly match the Google OAuth console. The session secret must be at
least 32 characters and independent from provider, OAuth, Redis, and quota
credentials.

SameSite=Lax intentionally assumes the SPA and reasoning endpoint are same-site
(normally same-origin `/api` through Vercel). A cross-site Cloud Run origin is
not a supported production cookie topology unless it is placed behind a
same-site gateway or custom domain and revalidated. This phase does not create
OAuth clients, Redis resources, DNS, billing, or production variables.

The separate Google Drive/Gmail authorization remains memory-only and is not a
DIFARYX identity source. The Python tenant API has its own authentication
boundary and does not become session-compatible merely by this TypeScript
change; production routing must not treat the Phase 2E cookie as Python API
authorization without an explicit server-side integration.
