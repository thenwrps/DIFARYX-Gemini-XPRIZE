# Gemini backend modes

The active backend is the root TypeScript application at `server/index.ts` and
uses the root-owned `@google/genai` SDK. Current DIFARYX development and
hackathon operation uses the Google AI Studio Gemini Developer API free tier.
`GEMINI_API_KEY` is read only by the server runtime and must never be placed in
a `VITE_*` variable, browser source, image, log, or committed environment file.

`GEMINI_PROVIDER_MODE` is the application-level selector. It accepts
`developer` or `vertex` and defaults to `developer`. Google Cloud environment
variables do not implicitly select Vertex mode. The model remains
`gemini-2.5-flash`, and provider failures retain the existing deterministic
fallback behavior.

## Current Developer API mode

Required server variables:

- `GEMINI_API_KEY`: server-runtime Developer API credential.
- `GEMINI_MODEL`: required model ID; use the tested `gemini-2.5-flash` value.
- `GEMINI_PROVIDER_MODE=developer`: explicitly selects the current mode.
- `GOOGLE_GENAI_USE_VERTEXAI=false`: retained for SDK compatibility only.
- `ALLOWED_ORIGINS`: comma-separated browser origins.
- `PORT`: local default is `3001`.
- `GEMINI_REQUEST_TIMEOUT_MS`: request timeout from 1000 to 120000 ms.
- `JSON_BODY_LIMIT`: Express JSON body limit; defaults to `8mb`.

Copy `.env.example` to the ignored `.env` file for local use. Never commit the
populated file. The API key is not a frontend variable and is not embedded in
the Vite bundle.

## Optional future Vertex AI mode

Vertex AI remains available but is not the current deployment mode. It is
selected only when `GEMINI_PROVIDER_MODE=vertex`; in that mode the backend uses
Application Default Credentials with `GOOGLE_CLOUD_PROJECT` and
`GOOGLE_CLOUD_LOCATION`, and does not use `GEMINI_API_KEY`.

## Prerequisites

Enable the Vertex AI, Cloud Run, Cloud Build, and Artifact Registry APIs. Grant
the runtime service account `roles/aiplatform.user` on the project. Keep the
service account narrowly scoped; no static credential file is needed on Cloud
Run.

Configure these Vertex-mode service environment variables:

- `GOOGLE_CLOUD_PROJECT`: Google Cloud project ID.
- `GOOGLE_CLOUD_LOCATION`: Vertex AI location, such as `global`.
- `GEMINI_PROVIDER_MODE=vertex`: required to select the Vertex provider.
- `GOOGLE_GENAI_USE_VERTEXAI=true`: retained for SDK compatibility.
- `GEMINI_MODEL`: model ID; defaults to `gemini-2.5-flash`.
- `ALLOWED_ORIGINS`: comma-separated production frontend origins.
- `PORT`: supplied by Cloud Run; local default is `3001`.
- `GEMINI_REQUEST_TIMEOUT_MS`: request timeout from 1000 to 120000 ms.
- `JSON_BODY_LIMIT`: Express JSON body limit; defaults to the existing `8mb`.

## Deferred Cloud Run packaging

Cloud Run hosting and Gemini API billing are separate concerns. Using the
Gemini Developer API free tier does not make Cloud Run free or deployable
without billing. Any future Cloud Run deployment requires an active Google
Cloud billing account. No Cloud Run or Vertex AI deployment occurred in this
phase.

Build locally from the repository root:

```sh
docker build -t difaryx-gemini-backend .
```

The following Vertex deployment example is retained for future planning only.
Do not run it while Cloud billing and the production authentication boundary
remain deferred:

```sh
gcloud run deploy difaryx-gemini-backend \
  --image REGION-docker.pkg.dev/PROJECT/REPOSITORY/difaryx-gemini-backend:TAG \
  --region REGION \
  --service-account SERVICE_ACCOUNT \
  --set-env-vars GEMINI_PROVIDER_MODE=vertex,GOOGLE_CLOUD_PROJECT=PROJECT,GOOGLE_CLOUD_LOCATION=REGION,GOOGLE_GENAI_USE_VERTEXAI=true,GEMINI_MODEL=gemini-2.5-flash,ALLOWED_ORIGINS=https://app.example.com
```

The container starts with `npm start`, binds to `0.0.0.0`, and reads the Cloud
Run `PORT`. Liveness is available at `/health`; safe readiness metadata is at
`/api/health`.

Set the frontend build variable `VITE_AGENT_API_URL` to the Cloud Run service
origin. This is a public API base URL only; never put credentials, tokens,
service-account JSON, or private keys in frontend variables, source, images, or
build arguments.

## Rollback

Keep immutable image tags. If a revision fails its health or API checks, route
traffic back to the last verified Cloud Run revision, then investigate the
failed revision without changing its image. Reapply the prior environment
configuration if configuration drift caused the failure.
