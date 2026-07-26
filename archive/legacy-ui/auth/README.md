# Legacy OAuth callback

`AuthCallback.tsx` is the retired browser-fragment OAuth callback that preceded
the Phase 2D-C Google Identity Services migration. The active application no
longer routes to it.

It is retained only as implementation history. It must not be restored for
authentication or Google API authorization because it persisted an OAuth access
token in browser storage and treated browser-derived profile data as identity.
