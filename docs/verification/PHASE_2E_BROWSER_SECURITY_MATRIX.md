# Phase 2E Browser Security Verification Matrix

## Overview
This matrix documents the verification of the DIFARYX Phase 2D-D baseline browser security posture. Verification was performed entirely through code inspection and deterministic state tracing to avoid altering production files or external systems.

## Findings Summary
1. **Authentication Authority**: The frontend currently relies on a client-side `AuthContext` which treats `guest` state as fully authenticated.
2. **Local Storage**: `AuthContext` attempts to clear legacy storage (`demoAuth`, `demoProfile`), but guest state creation circumvents genuine verification. In `test` provider mode, `tokenProvider.ts` relies on `demoProfile`.
3. **Session Storage**: `auth_redirect_to` is used and cleared upon initialization.
4. **Cookies**: No secure `HttpOnly` cookies are used for authentication.
5. **OAuth URLs**: Implicit flow tokens do not appear in URLs because Google Identity Services popup/OneTap flow is used.
6. **Network & Console**: API requests include `Active-Organization` populated by client state. `ProtectedRoute.tsx` logs route and auth status to console in DEV mode.
7. **Guest/Email Forms**: Fake email/password login creates an authenticated session locally without network validation.
8. **Protected Routes**: Exclusively enforced on the client side via `AuthContext` status (`isAuthenticated = status === 'authenticated' || status === 'guest'`).
9. **Reasoning Routes**: The `/api/reasoning` endpoint correctly enforces Google identity, but only for Gemini providers. `deterministic` or `scientific-baseline` bypass authentication. Error responses (401, 429, 503) in `reasoningClient.ts` do not trigger infinite retry loops, but they also preempt the deterministic fallback, which is an integration flaw.
10. **Reproducible Defects**: 6 Medium to Critical defects identified below.

## Test Matrix

### [AUTH-001] Guest State Authorization
* **Test Category**: Authentication
* **Preconditions**: User navigates to `/signin`.
* **Exact Browser Steps**: Click "Continue as Guest / Researcher".
* **Expected Secure Result**: The user is granted restricted guest access, and protected routes requiring verified identity reject access.
* **Observed Baseline Result**: `AuthContext.tsx` sets `status: 'guest'`, and `ProtectedRoute.tsx` defines `isAuthenticated` as true for guests, allowing full frontend access.
* **Pass or Fail**: FAIL
* **Severity**: High (Frontend bypass)
* **Reproducibility**: 100%
* **Evidence Artifact**: `src/features/auth/components/ProtectedRoute.tsx` Line 15.
* **Automation Status**: Manual / To be automated.
* **Recommended Regression Test**: `expect(page.goto('/dashboard')).toBeRedirectedTo('/signin')` for guest sessions.
* **Codex Phase 2E Action**: MUST ADDRESS. Do not treat `guest` as `isAuthenticated` for protected routes.

### [AUTH-002] Fake Email Authentication
* **Test Category**: Authentication
* **Preconditions**: User navigates to `/signin`.
* **Exact Browser Steps**: Select "Continue with Email", enter any email/password, and submit.
* **Expected Secure Result**: The request is validated against a backend authority, and invalid credentials reject login.
* **Observed Baseline Result**: `SignIn.tsx` calls `enterDemo()` and immediately grants `isAuthenticated` status locally without backend verification.
* **Pass or Fail**: FAIL
* **Severity**: High (Frontend bypass)
* **Reproducibility**: 100%
* **Evidence Artifact**: `src/features/auth/pages/SignIn.tsx` Line 95-109.
* **Automation Status**: Manual / To be automated.
* **Recommended Regression Test**: Email login attempts should trigger a backend validation request and fail for unregistered credentials.
* **Codex Phase 2E Action**: MUST ADDRESS. Ensure email authentication delegates to a real provider.

### [AUTH-003] Missing Persistent Session Restoration
* **Test Category**: Authentication
* **Preconditions**: User authenticates via Google successfully.
* **Exact Browser Steps**: Reload the browser page (`F5`).
* **Expected Secure Result**: The browser seamlessly restores the session securely (e.g., via `HttpOnly` cookies) or prompts re-authentication silently.
* **Observed Baseline Result**: `AuthContext.tsx` clears local state on mount and memory variables are lost. The user is logged out immediately upon refresh.
* **Pass or Fail**: FAIL
* **Severity**: Medium (UX/Usability)
* **Reproducibility**: 100%
* **Evidence Artifact**: `src/contexts/AuthContext.tsx` Line 81-89.
* **Automation Status**: Manual.
* **Recommended Regression Test**: Verify authenticated state persists across page reloads.
* **Codex Phase 2E Action**: MUST ADDRESS. Implement a secure session restoration mechanism.

### [API-001] Client-Supplied Organization Header
* **Test Category**: Request Validation
* **Preconditions**: User interacts with a tenant-scoped API.
* **Exact Browser Steps**: Intercept the network request and modify the `Active-Organization` header.
* **Expected Secure Result**: The server ignores the client header and derives the tenant ID from the verified server-side session token.
* **Observed Baseline Result**: `client.ts` populates `Active-Organization` from frontend state, which the server may blindly trust for multi-tenant isolation.
* **Pass or Fail**: FAIL
* **Severity**: Critical (Potential cross-tenant access)
* **Reproducibility**: 100%
* **Evidence Artifact**: `src/services/api/client.ts` Line 129.
* **Automation Status**: Manual.
* **Recommended Regression Test**: API request with modified `Active-Organization` header should be rejected by server if it conflicts with token claims.
* **Codex Phase 2E Action**: MUST ADDRESS. Rely on JWT claims for tenant identification.

### [LLM-001] Reasoning Endpoint Auth Bypass
* **Test Category**: Reasoning and Quota
* **Preconditions**: User is unauthenticated.
* **Exact Browser Steps**: Send a POST request to `/api/reasoning` with `provider: 'deterministic'`.
* **Expected Secure Result**: API rejects unauthenticated requests regardless of provider.
* **Observed Baseline Result**: `requireGoogleIdentity` is conditionally skipped based on the requested provider, allowing unauthenticated usage of fallback models.
* **Pass or Fail**: FAIL
* **Severity**: Medium (Resource exposure)
* **Reproducibility**: 100%
* **Evidence Artifact**: `server/app.ts` Line 253-264 and `server/llm/executionPolicy.ts`.
* **Automation Status**: Scriptable.
* **Recommended Regression Test**: All requests to `/api/reasoning` should return 401 if unauthenticated.
* **Codex Phase 2E Action**: MUST ADDRESS. Verify identity for all reasoning endpoints.

### [LLM-002] Deterministic Fallback Blocked by Error Responses
* **Test Category**: Reasoning and Quota
* **Preconditions**: Backend is available, but user lacks Gemini quota (429) or token is invalid (401).
* **Exact Browser Steps**: Trigger a reasoning request through the UI for Gemini.
* **Expected Secure Result**: The client falls back to deterministic reasoning seamlessly without a retry loop.
* **Observed Baseline Result**: `reasoningClient.ts` captures 401, 429, 503 and returns early with an error message, completely bypassing the `catch` block that triggers `generateDeterministicReasoning()`.
* **Pass or Fail**: FAIL
* **Severity**: High (Application feature breakage)
* **Reproducibility**: 100%
* **Evidence Artifact**: `src/services/api/reasoningClient.ts` Lines 38-63.
* **Automation Status**: Scriptable.
* **Recommended Regression Test**: Simulate a 429 response from Gemini and verify the UI falls back to deterministic output rather than showing a fatal error.
* **Codex Phase 2E Action**: MUST ADDRESS. Route graceful degradation to the fallback mechanism correctly.
