# Legacy backend archive

These files were archived after the active deployment and import audit in Phase 2C.
They contained duplicate JavaScript Gemini, API-key, and diagnostic implementations
that were not consumed by the root TypeScript application.

Production must use `server/index.ts` through the root `npm start` command and the
root `Dockerfile`. Files under this archive are retained only for historical
reference and must not be used for production deployment.
