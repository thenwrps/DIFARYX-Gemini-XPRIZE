import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";

type GoogleUserInfo = {
  email: string;
  name: string;
  picture?: string;
};

export default function AuthCallback() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [status, setStatus] = useState("Checking Google authentication...");

  useEffect(() => {
    const run = async () => {
      try {
        console.log("[AuthCallback] Starting OAuth callback processing");
        console.log("[AuthCallback] Full URL:", window.location.href);
        console.log("[AuthCallback] Hash:", window.location.hash);
        
        // Parse hash parameters
        const hash = window.location.hash.substring(1); // Remove the # character
        const params = new URLSearchParams(hash);
        const accessToken = params.get("access_token");
        const error = params.get("error");

        console.log("[AuthCallback] Access token found:", !!accessToken);
        console.log("[AuthCallback] Error param:", error);

        if (error) {
          setStatus("Google sign-in failed. Redirecting to sign in...");
          throw new Error(`Google OAuth error: ${error}`);
        }

        if (!accessToken) {
          console.warn("[AuthCallback] No Google access token in URL hash");
          setStatus("No Google sign-in response found. Redirecting to sign in...");
          setTimeout(() => {
            navigate("/signin", { replace: true });
          }, 2000);
          return;
        }

        // Store captured OAuth access token for useX7UniversalHook
        localStorage.setItem("difaryx_google_user_token", accessToken);

        console.log("[AuthCallback] Fetching user profile from Google");
        
        const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        console.log("[AuthCallback] Google API response status:", res.status);

        if (!res.ok) {
          const errorText = await res.text();
          console.error("[AuthCallback] Google API error:", errorText);
          throw new Error(`Failed to fetch Google user profile: ${res.status}`);
        }

        const user = (await res.json()) as GoogleUserInfo;
        
        console.log("[AuthCallback] User profile received:", {
          email: user.email,
          name: user.name,
          hasPicture: !!user.picture
        });

        // Use AuthContext signIn method with proper profile structure
        signIn({
          name: user.name || user.email.split("@")[0],
          email: user.email,
          organization: "DIFARYX Lab",
          picture: user.picture,
          provider: "google",
        });

        console.log("[AuthCallback] User signed in successfully");
        
        // Redirect seamlessly to /settings as requested
        const redirectTo = "/settings";
        sessionStorage.removeItem("auth_redirect_to");
        
        console.log("[AuthCallback] Redirecting to:", redirectTo);
        
        setStatus("Success! Redirecting...");
        
        // Small delay to show success message
        setTimeout(() => {
          navigate(redirectTo, { replace: true });
        }, 500);
      } catch (error) {
        console.error("[AuthCallback] Error:", error);
        console.error("[AuthCallback] Error details:", {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        
        setStatus((current) =>
          current.includes("Redirecting")
            ? current
            : "Google authentication failed. Redirecting to sign in..."
        );
        setTimeout(() => {
          navigate("/signin", { replace: true });
        }, 2000);
      }
    };

    run();
  }, [navigate, signIn]);

  return (
    <main className="min-h-screen bg-white text-slate-900 flex items-center justify-center">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xl px-8 py-6 text-center">
        <div className="mb-4">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent" />
        </div>
        <p className="text-sm text-slate-600">{status}</p>
      </div>
    </main>
  );
}
