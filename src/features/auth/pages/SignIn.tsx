import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Mail, UserRound } from "lucide-react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { Card, CardContent } from "../../../shared/ui/Card";
import { useAuth, type AuthUser } from "../../../contexts/AuthContext";
import {
  getGoogleOAuthClientId,
} from "../../../utils/googleOAuthConfig";
import { loadGoogleIdentityServices } from "../../../services/google/googleIdentityServices";

const GOOGLE_CLIENT_ID = getGoogleOAuthClientId();

export default function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, signInWithGoogleCredential } = useAuth();
  const googleConfigured = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const [emailMode, setEmailMode] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");

  const routeState = location.state as
    | { from?: Location; authError?: string }
    | null
    | undefined;
  const fromLocation = routeState?.from;
  const from = fromLocation
    ? `${fromLocation.pathname}${fromLocation.search ?? ""}${fromLocation.hash ?? ""}`
    : "/dashboard";

  useEffect(() => {
    if (routeState?.authError) {
      setEmailError(routeState.authError);
    }
  }, [routeState?.authError]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleButtonRef.current) return;
    let active = true;

    loadGoogleIdentityServices()
      .then((accounts) => {
        if (!active || !googleButtonRef.current) return;
        accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          auto_select: false,
          callback(response) {
            if (!active) return;
            if (signInWithGoogleCredential(response.credential)) {
              navigate(from, { replace: true });
              return;
            }
            setEmailError("Google sign-in could not establish a valid identity session.");
          },
        });
        googleButtonRef.current.replaceChildren();
        accounts.id.renderButton(googleButtonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width: 382,
        });
      })
      .catch(() => {
        if (active) {
          setEmailError("Google sign-in is temporarily unavailable.");
        }
      });

    return () => {
      active = false;
    };
  }, [from, navigate, signInWithGoogleCredential]);

  const enterDemo = (
    profile: AuthUser = {
      name: "Researcher",
      email: "user@difaryx.local",
      organization: "DIFARYX Lab",
      provider: "guest" as const,
    }
  ) => {
    signIn(profile);
    navigate(from, { replace: true });
  };

  const handleEmailSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim() || !password.trim()) {
      setEmailError("Enter an email and password to continue.");
      return;
    }

    enterDemo({
      name: email.split("@")[0] || "Researcher",
      email: email.trim(),
      organization: "DIFARYX Lab",
      provider: "email",
    });
  };

  const handleCreateSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!name.trim() || !email.trim() || !password.trim()) {
      setEmailError("Enter a name, email, and password to create an account.");
      return;
    }

    enterDemo({
      name: name.trim(),
      email: email.trim(),
      organization: organization.trim() || "DIFARYX Lab",
      provider: "email",
    });
  };

  return (
    <div className="min-h-screen overflow-y-auto bg-white text-slate-900">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.08),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]" />

      <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 pb-8 pt-6 sm:pb-10 sm:pt-8">
        <Link
          to="/"
          className="inline-flex w-fit items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2 shadow-sm hover:border-blue-200"
        >
          <img
            src="/logo/difaryx.png"
            alt="DIFARYX"
            className="h-10 object-contain"
          />
        </Link>

        <div className="flex flex-1 items-start justify-center py-8 sm:items-center sm:py-10">
          <div className="w-full max-w-md">
            <div className="mb-7 text-center">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-600">
                DIFARYX
              </p>
              <span className="mb-3 inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700">
                Authentication
              </span>
              <h1 className="text-4xl font-extrabold tracking-tight text-slate-950">
                Enter DIFARYX
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Access scientific workflows, notebooks, and autonomous agent
                reasoning.
              </p>
            </div>

            <Card className="border-slate-200 bg-white shadow-2xl shadow-slate-200/70">
              <CardContent className="p-6">
                {!emailMode && !createMode ? (
                  <div className="space-y-3">
                    <div
                      ref={googleButtonRef}
                      className="flex min-h-12 w-full items-center justify-center"
                      aria-label="Continue with Google"
                    />
                    {!googleConfigured && (
                      <p className="text-center text-[10px] font-semibold text-amber-600 bg-amber-50 rounded border border-amber-200/50 py-1.5 px-2">
                        Google authentication is not configured in this demo build.
                      </p>
                    )}

                    <Button
                      variant="outline"
                      className="h-12 w-full justify-between border-slate-200 bg-white px-4 text-base font-semibold text-slate-800 hover:border-blue-300 hover:bg-blue-50/60"
                      onClick={() => {
                        setEmailMode(true);
                        setCreateMode(false);
                        setEmailError("");
                      }}
                    >
                      <span className="flex items-center gap-3">
                        <Mail size={18} />
                        Continue with Email
                      </span>
                      <ArrowRight size={18} className="text-slate-400" />
                    </Button>

                    <Button
                      variant="outline"
                      className="h-12 w-full justify-between border-slate-200 bg-white px-4 text-base font-semibold text-slate-800 hover:border-blue-300 hover:bg-blue-50/60"
                      onClick={() => {
                        setCreateMode(true);
                        setEmailMode(false);
                        setEmailError("");
                      }}
                    >
                      <span className="flex items-center gap-3">
                        <UserRound size={18} />
                        Create account
                      </span>
                      <ArrowRight size={18} className="text-slate-400" />
                    </Button>

                    <Button
                      className="h-12 w-full justify-between bg-gradient-to-r from-blue-600 to-indigo-600 px-4 text-base font-bold text-white shadow-lg shadow-blue-600/20 hover:shadow-xl hover:shadow-indigo-600/25"
                      onClick={() => enterDemo()}
                    >
                      <span className="flex items-center gap-3">
                        <UserRound size={18} />
                        Continue as Guest / Researcher
                      </span>
                      <ArrowRight size={18} />
                    </Button>

                    {emailError && (
                      <p className="text-center text-xs font-medium text-amber-600">
                        {emailError}
                      </p>
                    )}
                  </div>
                ) : createMode ? (
                  <form className="space-y-4" onSubmit={handleCreateSubmit}>
                    <button
                      type="button"
                      onClick={() => {
                        setCreateMode(false);
                        setEmailError("");
                      }}
                      className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-blue-600"
                    >
                      <ArrowLeft size={14} />
                      Back to login options
                    </button>

                    <label className="block text-sm font-semibold text-slate-700">
                      Name
                      <input
                        type="text"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Researcher"
                        className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>

                    <label className="block text-sm font-semibold text-slate-700">
                      Email
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="researcher@example.com"
                        className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>

                    <label className="block text-sm font-semibold text-slate-700">
                      Password
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Create password"
                        className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>

                    <label className="block text-sm font-semibold text-slate-700">
                      Organization
                      <input
                        type="text"
                        value={organization}
                        onChange={(event) =>
                          setOrganization(event.target.value)
                        }
                        placeholder="Optional"
                        className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>

                    {emailError && (
                      <p className="text-xs font-medium text-amber-600">
                        {emailError}
                      </p>
                    )}

                    <Button
                      type="submit"
                      className="h-12 w-full justify-between bg-gradient-to-r from-blue-600 to-indigo-600 px-4 text-base font-bold text-white shadow-lg shadow-blue-600/20 hover:shadow-xl hover:shadow-indigo-600/25"
                    >
                      Create account and enter
                      <ArrowRight size={18} />
                    </Button>
                  </form>
                ) : (
                  <form className="space-y-4" onSubmit={handleEmailSubmit}>
                    <button
                      type="button"
                      onClick={() => {
                        setEmailMode(false);
                        setEmailError("");
                      }}
                      className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-blue-600"
                    >
                      <ArrowLeft size={14} />
                      Back to login options
                    </button>

                    <label className="block text-sm font-semibold text-slate-700">
                      Email
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="researcher@example.com"
                        className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>

                    <label className="block text-sm font-semibold text-slate-700">
                      Password
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Password"
                        className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>

                    {emailError && (
                      <p className="text-xs font-medium text-amber-600">
                        {emailError}
                      </p>
                    )}

                    <Button
                      type="submit"
                      className="h-12 w-full justify-between bg-gradient-to-r from-blue-600 to-indigo-600 px-4 text-base font-bold text-white shadow-lg shadow-blue-600/20 hover:shadow-xl hover:shadow-indigo-600/25"
                    >
                      Continue / Sign in
                      <ArrowRight size={18} />
                    </Button>
                  </form>
                )}

                <p className="pt-2 text-center text-xs text-slate-500">
                  Uses bundled scientific datasets.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
