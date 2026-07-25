import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { resolveRuntimeConfig } from '../config/runtimeConfig';
import {
  createGoogleSignInUrl,
  fetchCurrentSession,
  notifySessionInvalidated,
  revokeCurrentSession,
  subscribeSessionInvalidation,
} from '../services/auth/serverSession';
import { clearGoogleApiAccessSession } from '../services/google/googleApiAuthorization';

const LEGACY_AUTH_STORAGE_KEYS = [
  'demoAuth',
  'demoProfile',
  'difaryx_google_demo_user',
  'difaryx_google_user_token',
] as const;

export interface AuthUser {
  name: string;
  email: string;
  organization?: string;
  picture?: string;
  provider: 'google' | 'guest';
}

export type AuthStatus =
  | 'initializing'
  | 'authenticated'
  | 'guest'
  | 'unauthenticated'
  | 'error';

interface AuthContextType {
  status: AuthStatus;
  isAuthenticated: boolean;
  isVerified: boolean;
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
  signIn: (user: AuthUser) => void;
  beginGoogleSignIn: (returnTo: string) => void;
  invalidateIdentity: () => void;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  error: string | null;
}

const INITIAL_AUTH_STATE: AuthState = {
  status: 'initializing',
  user: null,
  error: null,
};

function normalizeGuestUser(user: AuthUser): AuthUser {
  if (!user.email.trim() || !user.name.trim()) {
    throw new Error('Demo profile is missing required fields');
  }
  if (user.provider !== 'guest') {
    throw new Error('Verified identity can only be established by the server');
  }
  return {
    name: user.name.trim(),
    email: user.email.trim(),
    organization: user.organization,
    picture: user.picture,
    provider: 'guest',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>(INITIAL_AUTH_STATE);
  const authGeneration = useRef(0);

  const refreshSession = useCallback(async () => {
    const generation = ++authGeneration.current;
    const { config } = resolveRuntimeConfig();
    if (config?.mode !== 'server') {
      if (generation === authGeneration.current) {
        setAuthState({ status: 'unauthenticated', user: null, error: null });
      }
      return;
    }
    try {
      const session = await fetchCurrentSession();
      if (generation !== authGeneration.current) return;
      if (!session.authenticated) {
        setAuthState({ status: 'unauthenticated', user: null, error: null });
        return;
      }
      setAuthState({
        status: 'authenticated',
        user: {
          name: session.user.displayName,
          email: session.user.email ?? '',
          organization: 'DIFARYX Lab',
          provider: 'google',
        },
        error: null,
      });
    } catch {
      if (generation !== authGeneration.current) return;
      setAuthState({
        status: 'error',
        user: null,
        error: 'Authentication service is temporarily unavailable.',
      });
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      for (const key of LEGACY_AUTH_STORAGE_KEYS) window.localStorage.removeItem(key);
    }
    clearGoogleApiAccessSession();
    void refreshSession();
    return () => {
      authGeneration.current += 1;
    };
  }, [refreshSession]);

  useEffect(() => subscribeSessionInvalidation((reason) => {
    setAuthState((current) => (
      reason === 'logout' || current.status === 'authenticated'
        ? { status: 'unauthenticated', user: null, error: null }
        : current
    ));
  }), []);

  const signIn = useCallback((newUser: AuthUser) => {
    try {
      authGeneration.current += 1;
      const user = normalizeGuestUser(newUser);
      setAuthState({ status: 'guest', user, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to enter demo mode';
      setAuthState({ status: 'error', user: null, error: message });
    }
  }, []);

  const beginGoogleSignIn = useCallback((returnTo: string) => {
    window.location.assign(createGoogleSignInUrl(returnTo));
  }, []);

  const invalidateIdentity = useCallback(() => {
    authGeneration.current += 1;
    notifySessionInvalidated();
  }, []);

  const signOut = useCallback(async () => {
    try {
      await revokeCurrentSession();
      authGeneration.current += 1;
      clearGoogleApiAccessSession();
    } catch {
      setAuthState((current) => ({
        ...current,
        error: 'Sign out could not be completed. Please try again.',
      }));
      throw new Error('Sign out could not be completed');
    }
  }, []);

  const value = useMemo<AuthContextType>(() => ({
    status: authState.status,
    isAuthenticated: authState.status === 'authenticated' || authState.status === 'guest',
    isVerified: authState.status === 'authenticated',
    user: authState.user,
    isLoading: authState.status === 'initializing',
    error: authState.error,
    signIn,
    beginGoogleSignIn,
    invalidateIdentity,
    refreshSession,
    signOut,
  }), [authState, beginGoogleSignIn, invalidateIdentity, refreshSession, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
