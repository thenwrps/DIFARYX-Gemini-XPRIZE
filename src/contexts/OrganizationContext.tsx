import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { getOrganizations } from '../services/api/organizations';
import type { OrganizationResponse, ApiError } from '../services/api/types';
import { useAuth } from './AuthContext';
import { tokenProvider } from '../services/api/tokenProvider';

export interface OrganizationContextType {
  organizations: OrganizationResponse[];
  activeOrganizationId: string | null;
  status: 'idle' | 'loading' | 'selection_required' | 'ready' | 'error';
  error: ApiError | null;
  setActiveOrganizationId: (id: string | null) => void;
  refresh: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

const ORG_STORAGE_KEY = 'difaryx-active-organization-id:v1';

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, status: authStatus } = useAuth();
  const [organizations, setOrganizations] = useState<OrganizationResponse[]>([]);
  const [activeOrganizationId, setActiveOrgState] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'selection_required' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<ApiError | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef<number>(0);

  const loadOrganizations = useCallback(async () => {
    const mode = import.meta.env.VITE_WORKSPACE_DATA_MODE;
    if (mode !== 'server') {
      setStatus('idle');
      return;
    }

    if (!isAuthenticated) {
      setStatus('idle');
      setOrganizations([]);
      setActiveOrgState(null);
      return;
    }

    setStatus('loading');
    setError(null);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const currentGen = ++generationRef.current;

    try {
      const list = await getOrganizations(controller.signal);

      if (currentGen !== generationRef.current) return;

      setOrganizations(list);

      if (list.length === 0) {
        setStatus('selection_required');
        setActiveOrgState(null);
        localStorage.removeItem(ORG_STORAGE_KEY);
        return;
      }

      const savedId = localStorage.getItem(ORG_STORAGE_KEY);
      const isSavedValid = savedId ? list.some((o) => o.id === savedId) : false;

      if (list.length === 1) {
        const autoId = list[0].id;
        setActiveOrgState(autoId);
        localStorage.setItem(ORG_STORAGE_KEY, autoId);
        setStatus('ready');
      } else if (isSavedValid && savedId) {
        setActiveOrgState(savedId);
        setStatus('ready');
      } else {
        setActiveOrgState(null);
        localStorage.removeItem(ORG_STORAGE_KEY);
        setStatus('selection_required');
      }
    } catch (err: any) {
      if (currentGen !== generationRef.current) return;
      if (err.name === 'AbortError') return;

      setError(err);
      setStatus('error');
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (authStatus === 'authenticated' || authStatus === 'guest') {
      loadOrganizations();
    } else if (authStatus === 'unauthenticated') {
      setOrganizations([]);
      setActiveOrgState(null);
      setStatus('idle');
      setError(null);
      localStorage.removeItem(ORG_STORAGE_KEY);
    }
  }, [authStatus, loadOrganizations]);

  useEffect(() => {
    if (tokenProvider.subscribe) {
      const unsubscribe = tokenProvider.subscribe(() => {
        loadOrganizations();
      });
      return unsubscribe;
    }
  }, [loadOrganizations]);

  const setActiveOrganizationId = useCallback((id: string | null) => {
    if (id) {
      setActiveOrgState(id);
      localStorage.setItem(ORG_STORAGE_KEY, id);
      setStatus('ready');
    } else {
      setActiveOrgState(null);
      localStorage.removeItem(ORG_STORAGE_KEY);
      setStatus('selection_required');
    }
  }, []);

  const value = React.useMemo(() => ({
    organizations,
    activeOrganizationId,
    status,
    error,
    setActiveOrganizationId,
    refresh: loadOrganizations,
  }), [organizations, activeOrganizationId, status, error, setActiveOrganizationId, loadOrganizations]);

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}
