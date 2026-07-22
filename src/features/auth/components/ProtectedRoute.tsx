import { ReactNode, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { status, isAuthenticated, error } = useAuth();
  const location = useLocation();
  const decision =
    status === 'initializing'
      ? 'wait'
      : isAuthenticated
        ? 'allow'
        : 'redirect';

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.info(`[route] ProtectedRoute decision: ${decision}`, {
        path: `${location.pathname}${location.search}`,
        authStatus: status,
      });
    }
  }, [decision, location.pathname, location.search, status]);

  if (status === 'initializing') {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent" />
          <p className="mt-4 text-sm text-slate-500">Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <Navigate
        to="/signin"
        state={{
          from: location,
          authError: error ?? 'Authentication failed. Redirecting to sign in...',
        }}
        replace
      />
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/signin" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
