# Vercel Gemini backend adapter

Phase 2D-D keeps the local Vercel Node.js Function adapter for the existing
Express application and adds the durable Gemini quota boundary. It does not
deploy a preview or production environment or provision an external resource.
The function entrypoint is `api/index.ts`, which exports the application
created by `server/app.ts`. `server/index.ts` remains the local and container
startup entrypoint. This follows Vercel's documented
[Express default-export pattern](https://vercel.com/docs/frameworks/backend/express).

## Routing and API contracts

`vercel.json` routes requests in this order:

1. `/api/:path*` to the Express function.
2. `/health` to the same Express function.
3. All remaining paths to `/index.html` for the Vite SPA.

The adapter preserves:

- `POST /api/reasoning`
- `POST /api/llm/reason`
- `GET /api/health`
- `GET /health`

The browser uses same-origin API paths in production and keeps
`http://localhost:3001` as the local development default. No Google SDK or
Gemini credential is imported by browser code.

## Current exposure classification

The exposure scale used for this audit is:

- **A:** verified server-side application identity plus durable quota controls.
- **B:** verified server-side application identity without durable quota controls.
- **C:** no verified server-side application identity and no durable quota controls.

The Phase 2D-D code boundary can satisfy **Classification A** only after the
matching Google Web client ID and complete private quota configuration are
configured and validated in a controlled deployment.

- Gemini-capable Express requests require a Google ID token.
- The server verifies signature, Google issuer, configured audience, expiry,
  and the stable `sub` claim using `google-auth-library`.
- Browser profile data is display-only and cannot override verified identity.
- Verified `sub` is pseudonymized with HMAC-SHA256 before quota keys are built.
- One atomic Upstash Redis Lua operation checks and conditionally increments
  user burst, user UTC-day, and global UTC-day counters together.
- CORS restricts participating browsers but does not prevent direct requests
  from scripts, bots, `curl`, or other servers.
- No in-memory rate limiter is added because serverless instances do not share
  memory and may be replaced or scaled independently.

Code readiness does not establish production readiness. Production exposure
remains blocked until the external Redis resource and private variables are
configured and a controlled synthetic smoke test validates the deployed
identity, quota, and provider path.

## Durable Gemini quota boundary

The beta policy is:

- 5 Gemini executions per verified user per UTC day.
- 2 Gemini executions per verified user per fixed server-side minute window.
- A mandatory deployment-chosen global UTC-day limit with no production
  default.

This is a fixed-window algorithm, not a sliding-window limiter. A single Redis
Lua script reads all three counters, rejects without incrementing any counter
when one dimension is exhausted, or increments all three exactly once when
allowed. New burst keys expire after their fixed window plus a cleanup margin;
new daily keys expire after the next UTC-day boundary plus a cleanup margin.

Quota is consumed after Google identity verification and before provider
invocation. A Gemini attempt therefore consumes one unit even when the provider
later errors and the existing deterministic fallback is returned. Deterministic
execution, health routes, and CORS preflight do not consume quota.

Redis or quota-configuration failure returns a sanitized 503 and fails closed.
An exhausted limit returns 429 with `Retry-After`, a safe quota dimension, and
reset timing before Gemini is invoked. The browser does not retry 401, 429, or
quota-related 503 responses automatically.

Redis keys use the versioned `difaryx:quota:v1` namespace. The user component is
the full hexadecimal HMAC-SHA256 digest of the verified Google `sub`, produced
with `QUOTA_ID_HASH_SECRET`. Raw `sub`, email, tokens, and profile data are not
stored in Redis. The digest and Redis keys are not returned to the browser.
`QUOTA_ID_HASH_SECRET` must be independent from Gemini and OAuth credentials.
Rotating it changes effective user quota identities and therefore resets their
application-visible user counters.

## Dual-token boundary

Google Identity Services supplies two intentionally separate credentials:

- The Sign in with Google `credential` is an ID token. DIFARYX keeps it only in
  browser memory, attaches it only to Gemini-capable DIFARYX requests, and
  requires a fresh GIS sign-in after reload or expiry.
- `google.accounts.oauth2.initTokenClient()` supplies a Google API access token.
  DIFARYX keeps it only in browser memory and uses it only for explicitly
  authorized Google APIs. Current live scopes cover Gmail read/send, Drive file
  access, user profile, and the legacy direct Vertex action. The existing
  Sheets integration remains a deterministic local demo and requests no live
  Sheets scope.

Basic DIFARYX sign-in does not request Drive, Sheets, Gmail, or Cloud access.
The Settings connection action requests Google API authorization separately.
Explicit disconnect may revoke that access token; normal DIFARYX sign-out
clears both in-memory sessions without revoking permanent Google consent.

## Vercel server environment

Configure only these backend variables in Vercel project settings:

```text
GEMINI_PROVIDER_MODE=developer
GEMINI_API_KEY=<configure as a sensitive server-only value>
GEMINI_MODEL=gemini-2.5-flash
GOOGLE_OAUTH_CLIENT_ID=<same Google Web client ID used by the browser>
UPSTASH_REDIS_REST_URL=<private Upstash REST URL>
UPSTASH_REDIS_REST_TOKEN=<private Upstash REST token>
QUOTA_ID_HASH_SECRET=<independent private HMAC secret>
GEMINI_USER_DAILY_LIMIT=5
GEMINI_USER_BURST_LIMIT=2
GEMINI_USER_BURST_WINDOW_SECONDS=60
GEMINI_GLOBAL_DAILY_LIMIT=<explicit deployment policy>
ALLOWED_ORIGINS=https://difaryx.dfryxlab.xyz
GEMINI_REQUEST_TIMEOUT_MS=30000
JSON_BODY_LIMIT=4mb
```

Configure the same non-secret Web client ID in the frontend build:

```text
VITE_GOOGLE_CLIENT_ID=<same Google Web client ID used by the server>
```

Do not put `GEMINI_API_KEY` in a `VITE_*` variable, source file, build argument,
log, screenshot, or chat. Apply the same rule to the Redis token and quota HMAC
secret. Upstash database creation and configuration remain external manual
steps; this repository does not establish that a database currently exists.
The recommended `JSON_BODY_LIMIT` remains below
Vercel's documented
[4.5 MB function payload limit](https://vercel.com/docs/functions/limitations#request-body-size).

## Google AI Studio free-tier boundary

The current mode uses the Gemini Developer API through the root-owned
`@google/genai` package. `gemini-2.5-flash` remains a stable model ID and its
standard text input and output are listed as free of charge on the Gemini
Developer API free tier in Google's
[model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash)
and [pricing table](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash).
Vertex mode remains optional and inactive; Cloud billing is not required or
enabled for this adapter work.

Google states that free-tier content may be used to improve its products.
Therefore, free-tier validation is restricted to synthetic, public, and
non-confidential data. Do not send unpublished research, proprietary evidence,
personal data, credentials, or regulated information.

## Historical HTTP 400 audit

The only available sanitized metadata is a historical count of two
`400 BadRequest` responses and three recent requests. The repository contains
no corresponding timestamps, request IDs, model IDs, SDK error categories, or
safe response summaries, so the historical cause cannot be attributed without
guessing. No prompt, evidence packet, API key, or full provider response was
inspected.

After the key is configured privately, perform at most one manual smoke test
with the smallest synthetic packet. Record only the timestamp, request ID,
HTTP status, selected provider/model, fallback flag, duration, and sanitized
error category. Do not automatically retry or consume additional free-tier
quota.

## Serverless compatibility

- The Express application is stateless for reasoning requests.
- Warm-instance Gemini client caching is an optimization and is not required
  for correctness.
- Deterministic fallback does not depend on instance persistence.
- Durable quota correctness depends on the configured Upstash Redis service,
  not warm-instance memory.
- Request IDs and structured logs contain no prompts, evidence packets, keys,
  or full model output.
- The TypeScript backend keeps no durable authentication session and stores
  only pseudonymous quota counters in Redis.
- The Python backend, local databases, and filesystem workflows are not
  imported by the Vercel function.

## Readiness gate

Local build, typecheck, route, adapter, deterministic, and fake-store tests may
establish code readiness only. Production readiness still requires manually
creating and configuring an Upstash Redis database, setting private Vercel
variables, choosing an explicit global daily limit, configuring the Google Web
OAuth client ID, and completing one controlled synthetic live smoke test.

No Vercel deployment, Google Cloud deployment, billing change, DNS change, or
production environment update occurred in Phase 2D-A, Phase 2D-C, or Phase
2D-D.
