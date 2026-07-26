import { useEffect, useState } from 'react';
import { ArrowRight, ShieldCheck, UserRound } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { resolveRuntimeConfig } from '../../../config/runtimeConfig';
import { useAuth } from '../../../contexts/AuthContext';
import { sanitizeRedirectTarget } from '../../../services/auth/serverSession';
import { Button } from '../../../shared/ui/Button';
import { Card, CardContent } from '../../../shared/ui/Card';

interface SignInRouteState {
  from?: {
    pathname?: string;
    search?: string;
    hash?: string;
  };
  authError?: string;
}

export default function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const { beginGoogleSignIn, signIn } = useAuth();
  const [authError, setAuthError] = useState('');
  const { config } = resolveRuntimeConfig();
  const serverMode = config?.mode === 'server';
  const routeState = location.state as SignInRouteState | null;
  const requestedTarget = routeState?.from?.pathname
    ? `${routeState.from.pathname}${routeState.from.search ?? ''}${routeState.from.hash ?? ''}`
    : new URLSearchParams(location.search).get('returnTo');
  const returnTo = sanitizeRedirectTarget(requestedTarget ?? '/dashboard');

  useEffect(() => {
    if (routeState?.authError) setAuthError(routeState.authError);
  }, [routeState?.authError]);

  const enterDemo = () => {
    signIn({
      name: 'Demo Researcher',
      email: 'demo@difaryx.local',
      organization: 'DIFARYX Demo Lab',
      provider: 'guest',
    });
    navigate(returnTo, { replace: true });
  };

  return (
    <div className="min-h-screen overflow-y-auto bg-white text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.08),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]" />

      <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 pb-8 pt-6 sm:pb-10 sm:pt-8">
        <Link
          to="/"
          className="inline-flex w-fit items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2 shadow-sm hover:border-blue-200"
        >
          <img src="/logo/difaryx.png" alt="DIFARYX" className="h-10 object-contain" />
        </Link>

        <div className="flex flex-1 items-start justify-center py-8 sm:items-center sm:py-10">
          <div className="w-full max-w-md">
            <div className="mb-7 text-center">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-600">
                DIFARYX
              </p>
              <span className="mb-3 inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700">
                {serverMode ? 'Public Beta Authentication' : 'Deterministic Demo'}
              </span>
              <h1 className="text-4xl font-extrabold tracking-tight text-slate-950">
                Enter DIFARYX
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Evidence-first scientific workflows with an explicit validation boundary.
              </p>
            </div>

            <Card className="border-slate-200 bg-white shadow-2xl shadow-slate-200/70">
              <CardContent className="space-y-3 p-6">
                {serverMode && (
                  <>
                    <Button
                      className="h-12 w-full justify-between bg-gradient-to-r from-blue-600 to-indigo-600 px-4 text-base font-bold text-white shadow-lg shadow-blue-600/20"
                      onClick={() => beginGoogleSignIn(returnTo)}
                    >
                      <span className="flex items-center gap-3">
                        <ShieldCheck size={18} />
                        Continue with Google
                      </span>
                      <ArrowRight size={18} />
                    </Button>
                    <p className="text-center text-xs leading-5 text-slate-500">
                      Google identity is verified by the DIFARYX server. Browser profile data
                      cannot authorize Gemini execution.
                    </p>
                  </>
                )}

                <Button
                  variant="outline"
                  className="h-12 w-full justify-between border-slate-200 bg-white px-4 text-base font-semibold text-slate-800 hover:border-blue-300 hover:bg-blue-50/60"
                  onClick={enterDemo}
                >
                  <span className="flex items-center gap-3">
                    <UserRound size={18} />
                    {serverMode ? 'Explore deterministic demo' : 'Continue as demo researcher'}
                  </span>
                  <ArrowRight size={18} />
                </Button>
                <p className="text-center text-xs leading-5 text-amber-700">
                  Demo access uses bundled evidence only and cannot authorize Gemini.
                </p>

                {authError && (
                  <p className="text-center text-xs font-medium text-amber-600">{authError}</p>
                )}

                <p className="pt-2 text-center text-xs text-slate-500">
                  Email/password account simulation is disabled.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
