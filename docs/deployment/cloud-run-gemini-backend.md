# Gemini backend on Cloud Run

The production backend is the root TypeScript application at `server/index.ts`.
It uses `@google/genai` in Vertex AI mode and authenticates with Application
Default Credentials, normally the Cloud Run service account. Do not provide a
Gemini Developer API key to this service or expose server configuration through
`VITE_*` variables.

## Prerequisites

Enable the Vertex AI, Cloud Run, Cloud Build, and Artifact Registry APIs. Grant
the runtime service account `roles/aiplatform.user` on the project. Keep the
service account narrowly scoped; no static credential file is needed on Cloud
Run.

Configure these service environment variables:

- `GOOGLE_CLOUD_PROJECT`: Google Cloud project ID.
- `GOOGLE_CLOUD_LOCATION`: Vertex AI region, such as `us-central1`.
- `GOOGLE_GENAI_USE_VERTEXAI=true`: required to enable the Vertex provider.
- `GEMINI_MODEL`: model ID; defaults to `gemini-2.5-flash`.
- `ALLOWED_ORIGINS`: comma-separated production frontend origins.
- `PORT`: supplied by Cloud Run; local default is `3001`.
- `GEMINI_REQUEST_TIMEOUT_MS`: request timeout from 1000 to 120000 ms.
- `JSON_BODY_LIMIT`: Express JSON body limit; defaults to the existing `8mb`.

## Build and deploy

Build locally from the repository root:

```sh
docker build -t difaryx-gemini-backend .
```

An example deployment command is shown for documentation only. Replace the
placeholders and use a prebuilt image from your controlled registry:

```sh
gcloud run deploy difaryx-gemini-backend \
  --image REGION-docker.pkg.dev/PROJECT/REPOSITORY/difaryx-gemini-backend:TAG \
  --region REGION \
  --service-account SERVICE_ACCOUNT \
  --set-env-vars GOOGLE_CLOUD_PROJECT=PROJECT,GOOGLE_CLOUD_LOCATION=REGION,GOOGLE_GENAI_USE_VERTEXAI=true,GEMINI_MODEL=gemini-2.5-flash,ALLOWED_ORIGINS=https://app.example.com
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
