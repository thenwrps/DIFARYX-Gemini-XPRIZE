# Vercel Gemini backend adapter

Phase 2D-A adds a local Vercel Node.js Function adapter for the existing
Express application. It does not deploy a preview or production environment.
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

The current backend is **Classification C**.

- The Express routes do not verify an authorization header, JWT, issuer,
  audience, expiry, organization, or user entitlement.
- Frontend route state and Google OAuth data stored in browser storage are not
  server authentication.
- CORS restricts participating browsers but does not prevent direct requests
  from scripts, bots, `curl`, or other servers.
- Existing browser-local quota state is user-controlled and is not a durable
  production quota.
- No in-memory rate limiter is added because serverless instances do not share
  memory and may be replaced or scaled independently.

Production exposure is blocked until the application has server-side identity
verification and a durable, atomic quota or rate-limit store. The design must
define user or organization keys, limits, reset windows, failure behavior, and
trusted proxy headers before implementation.

## Vercel server environment

Configure only these backend variables in Vercel project settings:

```text
GEMINI_PROVIDER_MODE=developer
GEMINI_API_KEY=<configure as a sensitive server-only value>
GEMINI_MODEL=gemini-2.5-flash
ALLOWED_ORIGINS=https://difaryx.dfryxlab.xyz
GEMINI_REQUEST_TIMEOUT_MS=30000
JSON_BODY_LIMIT=4mb
```

Do not put `GEMINI_API_KEY` in a `VITE_*` variable, source file, build argument,
log, screenshot, or chat. The recommended `JSON_BODY_LIMIT` remains below
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
- Request IDs and structured logs contain no prompts, evidence packets, keys,
  or full model output.
- No durable authentication session, quota counter, or usage ledger currently
  exists in the TypeScript backend.
- The Python backend, local databases, and filesystem workflows are not
  imported by the Vercel function.

## Readiness gate

Local build, typecheck, route, adapter, and deterministic tests may establish
code readiness only. Live validation remains blocked until the user privately
configures `GEMINI_API_KEY`. Production deployment remains blocked after that
until Classification C is resolved with application authentication and durable
quota enforcement.

No Vercel deployment, Google Cloud deployment, billing change, DNS change, or
production environment update occurred in Phase 2D-A.
