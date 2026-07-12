import { resolveRuntimeConfig } from '../../config/runtimeConfig';
import { tokenProvider } from './tokenProvider';
import type {
  CurrentUserResponse,
  OrganizationResponse,
  ProjectResponse,
  PaginatedProjectsResponse,
  ApiError,
} from './types';

// ─── Runtime Type Guards ───────────────────────────────────────────

export function validateCurrentUserResponse(data: any): CurrentUserResponse {
  if (
    !data ||
    typeof data !== 'object' ||
    !data.user ||
    typeof data.user !== 'object' ||
    typeof data.user.externalProvider !== 'string' ||
    typeof data.user.displayName !== 'string' ||
    !Array.isArray(data.memberships) ||
    typeof data.requestId !== 'string'
  ) {
    throw new Error('INVALID_SERVER_RESPONSE');
  }
  for (const m of data.memberships) {
    if (
      typeof m.organizationId !== 'string' ||
      typeof m.organizationName !== 'string' ||
      typeof m.userId !== 'string' ||
      typeof m.role !== 'string'
    ) {
      throw new Error('INVALID_SERVER_RESPONSE');
    }
  }
  return data as CurrentUserResponse;
}

export function validateOrganizationListResponse(data: any): OrganizationResponse[] {
  if (!Array.isArray(data)) {
    throw new Error('INVALID_SERVER_RESPONSE');
  }
  for (const org of data) {
    if (
      typeof org.id !== 'string' ||
      typeof org.slug !== 'string' ||
      typeof org.displayName !== 'string' ||
      typeof org.planTier !== 'string' ||
      typeof org.isActive !== 'boolean'
    ) {
      throw new Error('INVALID_SERVER_RESPONSE');
    }
  }
  return data as OrganizationResponse[];
}

export function validateProjectResponse(data: any): ProjectResponse {
  if (
    !data ||
    typeof data !== 'object' ||
    typeof data.id !== 'string' ||
    typeof data.organizationId !== 'string' ||
    typeof data.ownerUserId !== 'string' ||
    typeof data.title !== 'string' ||
    typeof data.createdAt !== 'string' ||
    typeof data.updatedAt !== 'string'
  ) {
    throw new Error('INVALID_SERVER_RESPONSE');
  }
  return data as ProjectResponse;
}

export function validateProjectListResponse(data: any): PaginatedProjectsResponse {
  if (
    !data ||
    typeof data !== 'object' ||
    !Array.isArray(data.projects) ||
    typeof data.requestId !== 'string'
  ) {
    throw new Error('INVALID_SERVER_RESPONSE');
  }
  for (const p of data.projects) {
    validateProjectResponse(p);
  }
  return data as PaginatedProjectsResponse;
}

// ─── HTTP Request Orchestration ────────────────────────────────────

function getApiBaseUrl(): string {
  const { config, error } = resolveRuntimeConfig();
  if (error || !config || !config.apiBaseUrl) {
    return 'http://localhost:8000';
  }
  return config.apiBaseUrl;
}

export async function makeRequest(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: any;
    signal?: AbortSignal;
    organizationId?: string;
  } = {}
): Promise<any> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = await tokenProvider.getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    const mode = import.meta.env.VITE_WORKSPACE_DATA_MODE;
    if (mode === 'server') {
      const authErr: ApiError = {
        errorCode: 'AUTH_REQUIRED',
        message: 'Authentication token is required',
      };
      throw authErr;
    }
  }

  if (options.organizationId) {
    headers['Active-Organization'] = options.organizationId;
  }

  const fetchOptions: RequestInit = {
    method: options.method || 'GET',
    headers,
    signal: options.signal,
  };

  if (options.body && options.method !== 'GET') {
    fetchOptions.body = JSON.stringify(options.body);
  }

  let res: Response;
  try {
    res = await fetch(url, fetchOptions);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw err;
    }
    const networkErr: ApiError = {
      errorCode: 'DATABASE_UNAVAILABLE',
      message: `Network error: ${err.message}`,
    };
    throw networkErr;
  }

  if (res.status === 204) {
    return null;
  }

  const contentType = res.headers.get('Content-Type') || '';
  let responseData: any;

  if (contentType.includes('application/json')) {
    try {
      responseData = await res.json();
    } catch {
      const parseErr: ApiError = {
        errorCode: 'INVALID_SERVER_RESPONSE',
        message: 'Failed to parse JSON response',
      };
      throw parseErr;
    }
  } else {
    const text = await res.text();
    responseData = { message: text };
  }

  if (!res.ok) {
    let errorCode = 'INTERNAL_ERROR';
    let message = 'An unexpected server error occurred';
    let details: any = undefined;
    let requestId: string | undefined = undefined;

    if (responseData && responseData.detail) {
      const detail = responseData.detail;
      if (typeof detail === 'object') {
        errorCode = detail.errorCode || errorCode;
        message = detail.message || message;
        details = detail.details || details;
      } else {
        message = detail;
      }
    }
    requestId = res.headers.get('X-Request-ID') || responseData?.requestId || undefined;

    const apiErr: ApiError = {
      errorCode,
      message,
      requestId,
      details,
    };
    throw apiErr;
  }

  return responseData;
}

export const api = {
  async bootstrapRequest(path: string, signal?: AbortSignal): Promise<any> {
    return makeRequest(path, { method: 'GET', signal });
  },

  async tenantRequest(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'PATCH';
      body?: any;
      organizationId: string;
      signal?: AbortSignal;
    }
  ): Promise<any> {
    return makeRequest(path, {
      method: options.method,
      body: options.body,
      organizationId: options.organizationId,
      signal: options.signal,
    });
  },
};
