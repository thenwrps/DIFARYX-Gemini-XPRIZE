const LOCAL_AGENT_API_ORIGIN = 'http://localhost:3001';

export function resolveAgentApiBaseUrl(
  configuredBaseUrl: string | undefined,
  isDevelopment: boolean,
): string {
  const normalized = configuredBaseUrl?.trim().replace(/\/+$/, '');
  if (normalized) {
    return normalized.endsWith('/api') ? normalized.slice(0, -4) : normalized;
  }
  return isDevelopment ? LOCAL_AGENT_API_ORIGIN : '';
}

export function getAgentApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const baseUrl = resolveAgentApiBaseUrl(
    import.meta.env.VITE_AGENT_API_URL,
    import.meta.env.DEV,
  );
  return `${baseUrl}${normalizedPath}`;
}
