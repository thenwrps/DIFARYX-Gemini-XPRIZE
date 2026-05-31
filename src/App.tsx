import { lazy, Suspense, type ReactElement } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

const SignIn = lazy(() => import("./pages/SignIn"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));

import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { XrdWorkflowRuntimeProvider } from "./context/XrdWorkflowRuntimeContext";

const Landing = lazy(() => import("./pages/Landing"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail"));
const MultiTechWorkspace = lazy(() => import("./pages/MultiTechWorkspace"));
const TechniqueWorkspace = lazy(() => import("./pages/TechniqueWorkspace"));
const WorkspaceLauncher = lazy(() => import("./pages/WorkspaceLauncher"));
const NotebookLab = lazy(() => import("./pages/NotebookLab"));
const ReportBuilder = lazy(() => import("./pages/ReportBuilder"));
const AgentDemo = lazy(() => import("./pages/AgentDemo"));
const HistoryPage = lazy(() => import("./pages/History"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const XRDWorkspace = lazy(() => import("./pages/XRDWorkspace"));
const XPSWorkspace = lazy(() => import("./pages/XPSWorkspace"));
const FTIRWorkspace = lazy(() => import("./pages/FTIRWorkspace"));
const RamanWorkspace = lazy(() => import("./pages/RamanWorkspace"));
const FusionWorkspace = lazy(() => import("./pages/FusionWorkspace"));
const AnalysisWorkspaceHome = lazy(() =>
  import("./pages/AnalysisWorkspace").then((module) => ({
    default: module.AnalysisWorkspaceHome,
  }))
);
const AnalysisNew = lazy(() =>
  import("./pages/AnalysisWorkspace").then((module) => ({
    default: module.AnalysisNew,
  }))
);
const AnalysisSessionPage = lazy(() =>
  import("./pages/AnalysisWorkspace").then((module) => ({
    default: module.AnalysisSessionPage,
  }))
);
const ProjectEvidenceRegistry = lazy(() =>
  import("./pages/AnalysisWorkspace").then((module) => ({
    default: module.ProjectEvidenceRegistry,
  }))
);

function PageLoadingIndicator({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Sidebar Skeleton */}
      <aside className="hidden md:flex w-64 border-r border-slate-200 bg-white flex-col p-4 space-y-6 shrink-0">
        <div className="h-8 w-28 bg-slate-100 animate-pulse rounded" />
        <div className="space-y-3 flex-1 pt-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 bg-slate-100 animate-pulse rounded-md" />
          ))}
        </div>
      </aside>

      {/* Main Content Skeleton */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar Skeleton */}
        <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
          <div className="h-8 w-48 bg-slate-100 animate-pulse rounded" />
          <div className="h-8 w-8 bg-slate-100 animate-pulse rounded-full" />
        </header>

        {/* Workspace/Content Area Skeleton with dynamic text */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-4">
          <div className="relative flex h-14 w-14 items-center justify-center">
            {/* Spinning track */}
            <div className="absolute inset-0 rounded-full border-[3px] border-slate-200" />
            {/* Spinning arc */}
            <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-blue-600 animate-spin" />
          </div>
          <h2 className="text-sm font-bold tracking-wide text-slate-600 animate-pulse">
            {message}
          </h2>
          <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
            DIFARYX Scientific Workflow Intelligence
          </p>
        </div>
      </div>
    </main>
  );
}

function AppRouteLoading() {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";

  // 1. Public/Auth Route loader (sleek, minimal, premium branding spinner)
  if (
    path === "/" ||
    path.startsWith("/login") ||
    path.startsWith("/signin") ||
    path.startsWith("/auth")
  ) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6">
        <div className="flex flex-col items-center">
          <div className="relative flex h-12 w-12 items-center justify-center">
            {/* Spinning track */}
            <div className="absolute inset-0 rounded-full border-[3px] border-slate-100" />
            {/* Spinning arc */}
            <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-blue-600 animate-spin" />
          </div>
          <p className="mt-5 text-[11px] font-bold tracking-[0.2em] text-slate-400 uppercase">
            DIFARYX
          </p>
        </div>
      </main>
    );
  }

  // 2. Protected dashboard/workspace route loader (lightweight layout skeleton)
  return (
    <main className="flex min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Sidebar Skeleton */}
      <aside className="hidden md:flex w-64 border-r border-slate-200 bg-white flex-col p-4 space-y-6 shrink-0">
        <div className="h-8 w-28 bg-slate-100 animate-pulse rounded" />
        <div className="space-y-3 flex-1 pt-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 bg-slate-100 animate-pulse rounded-md" />
          ))}
        </div>
      </aside>

      {/* Main Content Skeleton */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar Skeleton */}
        <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
          <div className="h-8 w-48 bg-slate-100 animate-pulse rounded" />
          <div className="h-8 w-8 bg-slate-100 animate-pulse rounded-full" />
        </header>

        {/* Workspace/Content Area Skeleton */}
        <div className="flex-1 p-6 space-y-6 overflow-hidden flex flex-col">
          <div className="h-8 w-48 bg-slate-100 animate-pulse rounded shrink-0" />

          <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
            {/* Left/Center Panel (Graph Area) */}
            <div className="lg:col-span-2 border border-slate-200 bg-white rounded-lg p-5 flex flex-col space-y-4 min-h-0">
              <div className="h-6 w-36 bg-slate-100 animate-pulse rounded shrink-0" />
              <div className="flex-1 bg-slate-50 animate-pulse rounded border border-slate-100 relative overflow-hidden flex items-center justify-center">
                {/* Subtle loading indicator inside graph */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-8 w-8 rounded-full border-[2.5px] border-slate-200 border-t-blue-500 animate-spin" />
                </div>
              </div>
            </div>

            {/* Right Panel (Controls/Details) */}
            <div className="border border-slate-200 bg-white rounded-lg p-5 flex flex-col space-y-4 min-h-0">
              <div className="h-6 w-24 bg-slate-100 animate-pulse rounded shrink-0" />
              <div className="space-y-3 flex-1 overflow-hidden pt-2">
                <div className="h-12 bg-slate-50 animate-pulse rounded" />
                <div className="h-12 bg-slate-50 animate-pulse rounded" />
                <div className="h-12 bg-slate-50 animate-pulse rounded" />
                <div className="h-12 bg-slate-50 animate-pulse rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function protectedRoute(element: ReactElement) {
  return <ProtectedRoute>{element}</ProtectedRoute>;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <XrdWorkflowRuntimeProvider>
          <Suspense fallback={<AppRouteLoading />}>
            <Routes>
              <Route path="/" element={<Landing />} />

              <Route path="/login" element={<SignIn />} />
              <Route path="/signin" element={<SignIn />} />
              <Route path="/auth/callback" element={<AuthCallback />} />

              <Route path="/dashboard" element={protectedRoute(<Suspense fallback={<PageLoadingIndicator message="Loading Dashboard..." />}><Dashboard /></Suspense>)} />
              <Route path="/projects" element={protectedRoute(<Suspense fallback={<PageLoadingIndicator message="Loading Dashboard..." />}><Dashboard /></Suspense>)} />

              <Route
                path="/project/:projectId"
                element={protectedRoute(<Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><ProjectDetail /></Suspense>)}
              />

              <Route
                path="/project/:projectId/evidence"
                element={protectedRoute(<Suspense fallback={<PageLoadingIndicator message="Loading Scientific Evidence..." />}><ProjectEvidenceRegistry /></Suspense>)}
              />

              <Route
                path="/analysis"
                element={protectedRoute(<Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><AnalysisWorkspaceHome /></Suspense>)}
              />

              <Route
                path="/analysis/new"
                element={protectedRoute(<Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><AnalysisNew /></Suspense>)}
              />

              <Route
                path="/analysis/session/:analysisId"
                element={protectedRoute(<Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><AnalysisSessionPage /></Suspense>)}
              />

              <Route
                path="/analysis/session/:analysisId/save"
                element={protectedRoute(<Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><AnalysisSessionPage /></Suspense>)}
              />

              <Route
                path="/analysis/session/:analysisId/attach"
                element={protectedRoute(<Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><AnalysisSessionPage /></Suspense>)}
              />

              <Route
                path="/analysis/session/:analysisId/export"
                element={protectedRoute(<Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><AnalysisSessionPage /></Suspense>)}
              />

              <Route
                path="/analysis/session/:analysisId/versions"
                element={protectedRoute(<Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><AnalysisSessionPage /></Suspense>)}
              />

              <Route
                path="/workspace"
                element={protectedRoute(<Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><WorkspaceLauncher /></Suspense>)}
              />

              <Route
                path="/workspace/multi"
                element={protectedRoute(<Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><MultiTechWorkspace /></Suspense>)}
              />

              {/* Analysis Workspace alias - project-scoped entry that surfaces
                 technique selection and recent workspace history for the project. */}
              <Route
                path="/workspace/analysis"
                element={protectedRoute(<Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><WorkspaceLauncher /></Suspense>)}
              />

              <Route
                path="/workspace/xrd"
                element={protectedRoute(<Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><XRDWorkspace /></Suspense>)}
              />

              <Route
                path="/workspace/xps"
                element={protectedRoute(<Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><XPSWorkspace /></Suspense>)}
              />

              <Route
                path="/workspace/ftir"
                element={protectedRoute(<Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><FTIRWorkspace /></Suspense>)}
              />

              <Route
                path="/workspace/raman"
                element={protectedRoute(<Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><RamanWorkspace /></Suspense>)}
              />

              <Route
                path="/workspace/fusion"
                element={protectedRoute(<Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><FusionWorkspace /></Suspense>)}
              />

              <Route
                path="/workspace/:technique"
                element={protectedRoute(<Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><TechniqueWorkspace /></Suspense>)}
              />

              <Route
                path="/notebook"
                element={protectedRoute(<Suspense fallback={<PageLoadingIndicator message="Loading Notebook..." />}><NotebookLab /></Suspense>)}
              />

              <Route
                path="/reports"
                element={protectedRoute(<Suspense fallback={<PageLoadingIndicator message="Loading Report..." />}><ReportBuilder /></Suspense>)}
              />

              <Route
                path="/report"
                element={protectedRoute(<Suspense fallback={<PageLoadingIndicator message="Loading Report..." />}><ReportBuilder /></Suspense>)}
              />

              <Route
                path="/history"
                element={protectedRoute(<Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><HistoryPage /></Suspense>)}
              />

              <Route
                path="/settings"
                element={protectedRoute(<Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><SettingsPage /></Suspense>)}
              />

              <Route
                path="/agent"
                element={protectedRoute(<Suspense fallback={<PageLoadingIndicator message="Loading Scientific Evidence..." />}><AgentDemo /></Suspense>)}
              />

              <Route
                path="/demo/agent"
                element={protectedRoute(<Suspense fallback={<PageLoadingIndicator message="Loading Scientific Evidence..." />}><AgentDemo /></Suspense>)}
              />
            </Routes>
          </Suspense>
        </XrdWorkflowRuntimeProvider>
      </Router>
    </AuthProvider>
  );
}

export default App;
