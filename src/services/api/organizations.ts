import { api, validateOrganizationListResponse } from './client';
import type { OrganizationResponse } from './types';

export async function getOrganizations(signal?: AbortSignal): Promise<OrganizationResponse[]> {
  const data = await api.bootstrapRequest('/api/v1/organizations', signal);
  try {
    return validateOrganizationListResponse(data);
  } catch (e: any) {
    throw { errorCode: 'INVALID_SERVER_RESPONSE', message: e.message };
  }
}
