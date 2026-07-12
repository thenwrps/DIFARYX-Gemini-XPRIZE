import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveRuntimeConfig } from '../../config/runtimeConfig';
import { makeRequest } from '../api/client';
import { tokenProvider } from '../api/tokenProvider';
import { getCurrentProfile } from '../api/currentUser';
import { getOrganizations } from '../api/organizations';
import { listProjects, updateProject } from '../api/projects';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage globally for Node/Vitest env
const storage: Record<string, string> = {};
global.localStorage = {
  getItem: (key: string) => storage[key] || null,
  setItem: (key: string, value: string) => { storage[key] = value; },
  removeItem: (key: string) => { delete storage[key]; },
  clear: () => { for (const k in storage) delete storage[k]; },
  length: 0,
  key: (index: number) => null,
};

describe('Runtime Mode Resolution & Env Validation', () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    vi.stubEnv('VITE_WORKSPACE_DATA_MODE', 'server');
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000');
    vi.stubEnv('VITE_AUTH_PROVIDER', 'test');
    originalNodeEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('resolves valid server mode configuration', () => {
    const { config, error } = resolveRuntimeConfig();
    expect(error).toBeNull();
    expect(config?.mode).toBe('server');
    expect(config?.apiBaseUrl).toBe('http://localhost:8000');
  });

  it('rejects VITE_AUTH_PROVIDER=test in production mode', () => {
    process.env.NODE_ENV = 'production';
    const { error } = resolveRuntimeConfig();
    expect(error).toContain('Production/staging builds must not use VITE_AUTH_PROVIDER=test');
  });

  it('rejects invalid mode configurations', () => {
    vi.stubEnv('VITE_WORKSPACE_DATA_MODE', 'INVALID_MODE');
    const { error } = resolveRuntimeConfig();
    expect(error).toContain('Unsupported workspace data mode');
  });

  it('rejects API base URL containing credentials', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://user:password@localhost:8000');
    const { error } = resolveRuntimeConfig();
    expect(error).toContain('API base URL must not contain credentials');
  });
});

describe('API Client Request Boundaries & Headers', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_WORKSPACE_DATA_MODE', 'server');
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000');
    vi.stubEnv('VITE_AUTH_PROVIDER', 'test');
    mockFetch.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    localStorage.clear();
  });

  it('injects mock token based on logged-in user profile', async () => {
    localStorage.setItem('demoProfile', JSON.stringify({ email: 'a1@test.com', name: 'User A1' }));
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ id: '123', title: 'Test Project' })
    });

    const token = await tokenProvider.getAccessToken();
    expect(token).toBe('mock:firebase|sub-a1|a1@test.com');

    await makeRequest('/api/v1/projects/123');
    
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/projects/123',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer mock:firebase|sub-a1|a1@test.com'
        })
      })
    );
  });

  it('attaches Active-Organization header for tenant-scoped calls only', async () => {
    localStorage.setItem('demoProfile', JSON.stringify({ email: 'a1@test.com' }));
    
    // 1. Bootstrap request (/me)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ user: { displayName: 'a1', externalProvider: 'firebase' }, memberships: [], requestId: 'req1' })
    });

    await getCurrentProfile();
    expect(mockFetch).toHaveBeenLastCalledWith(
      'http://localhost:8000/api/v1/me',
      expect.objectContaining({
        headers: expect.not.objectContaining({
          'Active-Organization': expect.any(String)
        })
      })
    );

    // 2. Tenant request (/projects)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ projects: [], requestId: 'req2' })
    });

    await listProjects('org-uuid');
    expect(mockFetch).toHaveBeenLastCalledWith(
      'http://localhost:8000/api/v1/projects?limit=50',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Active-Organization': 'org-uuid'
        })
      })
    );
  });

  it('handles and parses structured JSON API errors correctly', async () => {
    localStorage.setItem('demoProfile', JSON.stringify({ email: 'a1@test.com' }));
    
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      headers: new Headers({ 'Content-Type': 'application/json', 'X-Request-ID': 'req-conflict-123' }),
      json: async () => ({
        detail: {
          errorCode: 'PROJECT_VERSION_CONFLICT',
          message: 'Project state changed on server'
        }
      })
    });

    try {
      await updateProject('org-id', 'proj-id', { title: 'New', expectedUpdatedAt: '2026-07-12' });
      expect.fail('Should have thrown an error');
    } catch (err: any) {
      expect(err.errorCode).toBe('PROJECT_VERSION_CONFLICT');
      expect(err.message).toBe('Project state changed on server');
      expect(err.requestId).toBe('req-conflict-123');
    }
  });
});
