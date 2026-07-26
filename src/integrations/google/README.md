# DIFARYX Google Integration Boundary

This folder contains an optional, clean boundary for Google integrations (Auth, Drive, Sheets).

## Current State

Production DIFARYX authentication is server-owned. The TypeScript server uses
Google Authorization Code + PKCE, verifies the Google ID token, and issues an
opaque DIFARYX session cookie. No authentication token or profile in this
folder can authorize a protected server operation.

- **Auth**: implemented in `server/auth`; deterministic guest state is explicit and demo-only.
- **Drive**: demo export metadata may remain local.
- **Sheets**: demo append data may remain local.
- **Google API access**: separately authorized, memory-only, and never used as DIFARYX identity.

Drive and Sheets integrations must remain separate from the login session and
request only the scopes needed for their explicit user action.

## Core Constraint
The core DIFARYX agent runtime must remain independent from Google. Google integration should always be treated as an optional export/auth layer, preserving the deterministic and offline-capable nature of the scientific reasoning engine.
