import { api, validateCurrentUserResponse } from './client';
import type { CurrentUserResponse } from './types';

export async function getCurrentProfile(signal?: AbortSignal): Promise<CurrentUserResponse> {
  const data = await api.bootstrapRequest('/api/v1/me', signal);
  try {
    return validateCurrentUserResponse(data);
  } catch (e: any) {
    throw { errorCode: 'INVALID_SERVER_RESPONSE', message: e.message };
  }
}
