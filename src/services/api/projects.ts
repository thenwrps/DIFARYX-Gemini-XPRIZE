import { api, validateProjectResponse, validateProjectListResponse } from './client';
import type { ProjectResponse, PaginatedProjectsResponse } from './types';

export interface ProjectCreatePayload {
  title: string;
  description?: string;
}

export interface ProjectUpdatePayload {
  title: string;
  description?: string;
  expectedUpdatedAt: string;
}

export async function listProjects(
  organizationId: string,
  params: { limit?: number; cursor?: string } = {},
  signal?: AbortSignal
): Promise<PaginatedProjectsResponse> {
  let query = `?limit=${params.limit || 50}`;
  if (params.cursor) {
    query += `&cursor=${encodeURIComponent(params.cursor)}`;
  }
  const data = await api.tenantRequest(`/api/v1/projects${query}`, {
    method: 'GET',
    organizationId,
    signal,
  });
  try {
    return validateProjectListResponse(data);
  } catch (e: any) {
    throw { errorCode: 'INVALID_SERVER_RESPONSE', message: e.message };
  }
}

export async function createProject(
  organizationId: string,
  payload: ProjectCreatePayload,
  signal?: AbortSignal
): Promise<ProjectResponse> {
  const data = await api.tenantRequest('/api/v1/projects', {
    method: 'POST',
    body: payload,
    organizationId,
    signal,
  });
  try {
    return validateProjectResponse(data);
  } catch (e: any) {
    throw { errorCode: 'INVALID_SERVER_RESPONSE', message: e.message };
  }
}

export async function updateProject(
  organizationId: string,
  projectId: string,
  payload: ProjectUpdatePayload,
  signal?: AbortSignal
): Promise<ProjectResponse> {
  const data = await api.tenantRequest(`/api/v1/projects/${projectId}`, {
    method: 'PATCH',
    body: payload,
    organizationId,
    signal,
  });
  try {
    return validateProjectResponse(data);
  } catch (e: any) {
    throw { errorCode: 'INVALID_SERVER_RESPONSE', message: e.message };
  }
}
