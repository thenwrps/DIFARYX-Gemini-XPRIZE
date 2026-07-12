import { useState, useEffect, useRef, useCallback } from 'react';
import { listProjects, createProject, updateProject, type ProjectCreatePayload, type ProjectUpdatePayload } from '../services/api/projects';
import type { ProjectResponse, ApiError } from '../services/api/types';

export function useWorkspaceProjects(activeOrganizationId: string | null) {
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [isCreatePending, setIsCreatePending] = useState<boolean>(false);
  const [isUpdatePending, setIsUpdatePending] = useState<boolean>(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef<number>(0);

  const loadProjects = useCallback(async () => {
    const mode = import.meta.env.VITE_WORKSPACE_DATA_MODE;
    if (mode !== 'server' || !activeOrganizationId) {
      setProjects([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const currentGen = ++generationRef.current;

    try {
      const res = await listProjects(activeOrganizationId, { limit: 100 }, controller.signal);
      
      if (currentGen !== generationRef.current) return;

      setProjects(res.projects);
      setIsLoading(false);
    } catch (err: any) {
      if (currentGen !== generationRef.current) return;
      if (err.name === 'AbortError') return;

      setError(err);
      setIsLoading(false);
    }
  }, [activeOrganizationId]);

  useEffect(() => {
    loadProjects();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadProjects]);

  const handleCreateProject = useCallback(async (payload: ProjectCreatePayload) => {
    if (!activeOrganizationId) {
      throw new Error('No active organization selected');
    }
    setIsCreatePending(true);
    try {
      const newProj = await createProject(activeOrganizationId, payload);
      setProjects((prev) => [newProj, ...prev]);
      setIsCreatePending(false);
      return newProj;
    } catch (err: any) {
      setIsCreatePending(false);
      throw err;
    }
  }, [activeOrganizationId]);

  const handleUpdateProject = useCallback(async (projectId: string, payload: ProjectUpdatePayload) => {
    if (!activeOrganizationId) {
      throw new Error('No active organization selected');
    }
    setIsUpdatePending(true);
    try {
      const updated = await updateProject(activeOrganizationId, projectId, payload);
      setProjects((prev) => prev.map((p) => p.id === projectId ? updated : p));
      setIsUpdatePending(false);
      return updated;
    } catch (err: any) {
      setIsUpdatePending(false);
      throw err;
    }
  }, [activeOrganizationId]);

  return {
    projects,
    isLoading,
    error,
    isCreatePending,
    isUpdatePending,
    retry: loadProjects,
    createProject: handleCreateProject,
    updateProject: handleUpdateProject,
  };
}
export default useWorkspaceProjects;
