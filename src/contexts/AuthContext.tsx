import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  clearIdentitySession,
  establishIdentitySessionFromCredential,
  getIdentityToken as readIdentityToken,
  invalidateLegacyBrowserAuthState,
  subscribeIdentitySession,
} from '../services/auth/identitySession';
import { clearGoogleApiAccessSession } from '../services/google/googleApiAuthorization';
import type { GoogleIdentityToken } from '../services/google/tokenTypes';

export interface AuthUser {
  name: string;
  email: string;
  organization?: string;
  picture?: string;
  provider?: 'google' | 'email' | 'guest';
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
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
  getIdentityToken: () => GoogleIdentityToken | null;
  signIn: (user: AuthUser) => void;
  signInWithGoogleCredential: (credential: string) => boolean;
  invalidateIdentity: () => void;
  signOut: () => void;
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

function normalizeDemoUser(user: AuthUser): AuthUser {
  if (!user.email.trim() || !user.name.trim()) {
    throw new Error('Auth profile is missing required fields');
  }
  if (user.provider === 'google') {
    throw new Error('Google identity requires a verified credential');
  }
  return {
    name: user.name.trim(),
    email: user.email.trim(),
    organization: user.organization,
    picture: user.picture,
    provider: user.provider ?? 'guest',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>(INITIAL_AUTH_STATE);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      invalidateLegacyBrowserAuthState(window.localStorage);
      window.sessionStorage.removeItem('auth_redirect_to');
    }
    clearIdentitySession();
    clearGoogleApiAccessSession();
    setAuthState({ status: 'unauthenticated', user: null, error: null });
  }, []);

  useEffect(() => subscribeIdentitySession(() => {
    if (readIdentityToken()) return;
    setAuthState((current) => current.user?.provider === 'google'
      ? { status: 'unauthenticated', user: null, error: null }
      : current);
  }), []);

  const signIn = useCallback((newUser: AuthUser) => {
    try {
      clearIdentitySession();
      const user = normalizeDemoUser(newUser);
      setAuthState({
        status: 'guest',
        user,
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to establish demo session';
      setAuthState({ status: 'error', user: null, error: message });
    }
  }, []);

  const signInWithGoogleCredential = useCallback((credential: string) => {
    try {
      const claims = establishIdentitySessionFromCredential(credential);
      setAuthState({
        status: 'authenticated',
        user: {
          name: claims.name,
          email: claims.email,
          organization: 'DIFARYX Lab',
          picture: claims.picture,
          provider: 'google',
        },
        error: null,
      });
      return true;
    } catch (error) {
      clearIdentitySession();
      const message = error instanceof Error ? error.message : 'Google sign-in failed';
      setAuthState({ status: 'error', user: null, error: message });
      return false;
    }
  }, []);

  const invalidateIdentity = useCallback(() => {
    clearIdentitySession();
    setAuthState((current) => current.user?.provider === 'google'
      ? { status: 'unauthenticated', user: null, error: null }
      : current);
  }, []);

  const signOut = useCallback(() => {
    clearIdentitySession();
    clearGoogleApiAccessSession();
    setAuthState({ status: 'unauthenticated', user: null, error: null });
  }, []);

  const value = useMemo<AuthContextType>(() => ({
    status: authState.status,
    isAuthenticated:
      authState.status === 'authenticated' || authState.status === 'guest',
    user: authState.user,
    isLoading: authState.status === 'initializing',
    error: authState.error,
    getIdentityToken: readIdentityToken,
    signIn,
    signInWithGoogleCredential,
    invalidateIdentity,
    signOut,
  }), [authState, invalidateIdentity, signIn, signInWithGoogleCredential, signOut]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
