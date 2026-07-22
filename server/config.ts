export interface ServerConfig {
  nodeEnv: string;
  port: number;
  host: string;
  jsonLimit: string;
  serviceName: string;
  serviceVersion: string;
  allowedOrigins: string[];
  googleCloudProject?: string;
  googleCloudLocation: string;
  googleGenAIUseVertexAI: boolean;
  geminiModel: string;
  geminiRequestTimeoutMs: number;
}

const LOCAL_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

export function loadServerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const nodeEnv = environment.NODE_ENV ?? 'development';
  const configuredOrigins = splitList(environment.ALLOWED_ORIGINS);
  const allowedOrigins = nodeEnv === 'production'
    ? configuredOrigins
    : [...new Set([...LOCAL_ORIGINS, ...configuredOrigins])];

  return {
    nodeEnv,
    port: boundedInteger(environment.PORT, 3001, 1, 65535),
    host: '0.0.0.0',
    jsonLimit: environment.JSON_BODY_LIMIT?.trim() || '8mb',
    serviceName: 'difaryx-gemini-backend',
    serviceVersion: environment.npm_package_version?.trim() || '0.0.0',
    allowedOrigins,
    googleCloudProject: environment.GOOGLE_CLOUD_PROJECT?.trim() || undefined,
    googleCloudLocation: environment.GOOGLE_CLOUD_LOCATION?.trim() || 'us-central1',
    googleGenAIUseVertexAI: environment.GOOGLE_GENAI_USE_VERTEXAI?.trim().toLowerCase() === 'true',
    geminiModel: boundedString(environment.GEMINI_MODEL, 'gemini-2.5-flash', 128),
    geminiRequestTimeoutMs: boundedInteger(
      environment.GEMINI_REQUEST_TIMEOUT_MS,
      30_000,
      1_000,
      120_000,
    ),
  };
}

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

function boundedString(value: string | undefined, fallback: string, maximumLength: number): string {
  const normalized = value?.trim();
  return normalized && normalized.length <= maximumLength ? normalized : fallback;
}
