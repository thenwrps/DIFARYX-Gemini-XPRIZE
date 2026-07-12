export type WorkspaceDataMode = 'demo' | 'server';

export interface RuntimeConfig {
  mode: WorkspaceDataMode;
  apiBaseUrl: string | null;
  authProvider: string | null;
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

function validateApiBaseUrl(urlStr: string | undefined, isProduction: boolean): string {
  if (!urlStr) {
    throw new ConfigurationError('API base URL (VITE_API_BASE_URL) is required in server mode');
  }
  if (urlStr.includes('@')) {
    throw new ConfigurationError('API base URL must not contain credentials');
  }
  if (urlStr.startsWith('/')) {
    return urlStr.replace(/\/+$/, '');
  }
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new ConfigurationError(`Unsupported API base URL protocol: ${parsed.protocol}`);
    }
    if (isProduction && parsed.protocol === 'http:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      throw new ConfigurationError('Production API base URL must use HTTPS');
    }
    return urlStr.replace(/\/+$/, '');
  } catch (e) {
    if (e instanceof ConfigurationError) throw e;
    throw new ConfigurationError(`Invalid API base URL format: ${urlStr}`);
  }
}

export function resolveRuntimeConfig(): { config: RuntimeConfig | null; error: string | null } {
  try {
    const rawMode = import.meta.env.VITE_WORKSPACE_DATA_MODE;
    const isProd = import.meta.env.PROD || (typeof process !== 'undefined' && process.env.NODE_ENV === 'production');
    const isDev = !isProd;

    let mode: WorkspaceDataMode;
    if (rawMode === undefined || rawMode === '') {
      if (isDev) {
        mode = 'demo';
      } else {
        throw new ConfigurationError('Workspace data mode (VITE_WORKSPACE_DATA_MODE) must be explicitly configured in production');
      }
    } else if (rawMode === 'demo' || rawMode === 'server') {
      mode = rawMode;
    } else {
      throw new ConfigurationError(`Unsupported workspace data mode: ${rawMode}`);
    }

    const rawApiUrl = import.meta.env.VITE_API_BASE_URL;
    let apiBaseUrl: string | null = null;
    if (mode === 'server') {
      apiBaseUrl = validateApiUrlWithBackends(rawApiUrl, isProd);
    }

    const authProvider = import.meta.env.VITE_AUTH_PROVIDER || null;
    if (isProd && authProvider === 'test') {
      throw new ConfigurationError('Production/staging builds must not use VITE_AUTH_PROVIDER=test');
    }

    return {
      config: {
        mode,
        apiBaseUrl,
        authProvider,
      },
      error: null,
    };
  } catch (e) {
    return {
      config: null,
      error: e instanceof Error ? e.message : 'Unknown configuration error',
    };
  }
}

function validateApiUrlWithBackends(urlStr: string | undefined, isProduction: boolean): string {
  const fallback = import.meta.env.VITE_XRD_API_URL || import.meta.env.VITE_XRD_BACKEND_URL;
  const targetUrl = urlStr || fallback;
  return validateApiBaseUrl(targetUrl, isProduction);
}
