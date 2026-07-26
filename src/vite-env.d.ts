/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_API_CLIENT_ID?: string;
  readonly VITE_XRD_BACKEND_URL?: string;
  readonly VITE_XRD_API_URL?: string;
  readonly VITE_AGENT_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const process: {
  env: Record<string, string | undefined>;
};
