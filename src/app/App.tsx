import { lazy, Suspense, type ReactElement } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { SpeedInsights } from "@vercel/speed-insights/react";

import { AuthProvider } from "../contexts/AuthContext";
import { ProtectedRoute } from "../features/auth/components/ProtectedRoute";
import { XrdWorkflowRuntimeProvider } from "../context/XrdWorkflowRuntimeContext";

import Landing from "../features/landing/pages/Landing";
import SignIn from "../features/auth/pages/SignIn";
import AuthCallback from "../features/auth/pages/AuthCallback";

const Dashboard = lazy(() => import("../features/dashboard/pages/Dashboard"));
const ProjectDetail = lazy(() => import("../features/project/pages/ProjectDetail"));
const MultiTechWorkspace = lazy(() => import("../features/workspaces/pages/MultiTechWorkspace"));
const TechniqueWorkspace = lazy(() => import("../features/workspaces/pages/TechniqueWorkspace"));
const WorkspaceLauncher = lazy(() => import("../features/workspaces/pages/WorkspaceLauncher"));
const NotebookLab = lazy(() => import("../features/notebook/pages/NotebookLab"));
const ReportBuilder = lazy(() => import("../features/reports/pages/ReportBuilder"));
const AgentDemo = lazy(() => import("../features/agent/pages/AgentWorkspace"));
const HistoryPage = lazy(() => import("../features/history/pages/History"));
const SettingsPage = lazy(() => import("../features/settings/pages/Settings"));

const XRDWorkspace = lazy(() => import("../features/workspaces/pages/XRDWorkspace"));
const XPSWorkspace = lazy(() => import("../features/workspaces/pages/XPSWorkspace"));
const FTIRWorkspace = lazy(() => import("../features/workspaces/pages/FTIRWorkspace"));
const RamanWorkspace = lazy(() => import("../features/workspaces/pages/RamanWorkspace"));
const FusionWorkspace = lazy(() => import("../features/workspaces/pages/FusionWorkspace"));

const AnalysisWorkspaceHome = lazy(() =>
  import("../features/analysis/pages/AnalysisWorkspace").then((module) => ({
    default: module.AnalysisWorkspaceHome,
  }))
);
const AnalysisNew = lazy(() =>
  import("../features/analysis/pages/AnalysisWorkspace").then((module) => ({
    default: module.AnalysisNew,
  }))
);
const AnalysisSessionPage = lazy(() =>
  import("../features/analysis/pages/AnalysisWorkspace").then((module) => ({
    default: module.AnalysisSessionPage,
  }))
);
const ProjectEvidenceRegistry = lazy(() =>
  import("../features/analysis/pages/AnalysisWorkspace").then((module) => ({
    default: module.ProjectEvidenceRegistry,
  }))
);

function PageLoadingIndicator({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen bg-slate-50 text-slate-900 font-sans">
      <aside className="hidden md:flex w-64 border-r border-slate-200 bg-white flex-col p-4 space-y-6 shrink-0">
        <div className="h-8 w-28 bg-slate-100 animate-pulse rounded" />
        <div className="space-y-3 flex-1 pt-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 bg-slate-100 animate-pulse rounded-md" />
          ))}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0">
          <div className="h-8 w-48 bg-slate-100 animate-pulse rounded" />
          <div className="h-8 w-8 bg-slate-100 animate-pulse rounded-full" />
        </header>

        <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-4">
          <div className="relative flex h-14 w-14 items-center justify-center">
            <div className="absolute inset-0 rounded-full border-[3px] border-slate-200" />
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

import { resolveRuntimeConfig } from "../config/runtimeConfig";
import { ConfigurationErrorScreen } from "../shared/ui/ConfigurationErrorScreen";
import { OrganizationProvider } from "../contexts/OrganizationContext";

function App() {
  const { error } = resolveRuntimeConfig();
  if (error) {
    return <ConfigurationErrorScreen error={error} />;
  }

  return (
    <AuthProvider>
      <OrganizationProvider>
        <Router>
        <XrdWorkflowRuntimeProvider>
          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<SignIn />} />
              <Route path="/signin" element={<SignIn />} />
              <Route path="/auth/callback" element={<AuthCallback />} />

              <Route
                path="/dashboard"
                element={<ProtectedRoute><Suspense fallback={<PageLoadingIndicator message="Loading Dashboard..." />}><Dashboard /></Suspense></ProtectedRoute>}
              />
              <Route
                path="/projects"
                element={<ProtectedRoute><Suspense fallback={<PageLoadingIndicator message="Loading Dashboard..." />}><Dashboard /></Suspense></ProtectedRoute>}
              />
              <Route
                path="/project/:projectId"
                element={<ProtectedRoute><Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><ProjectDetail /></Suspense></ProtectedRoute>}
              />
              <Route
                path="/project/:projectId/evidence"
                element={<ProtectedRoute><Suspense fallback={<PageLoadingIndicator message="Loading Scientific Evidence..." />}><ProjectEvidenceRegistry /></Suspense></ProtectedRoute>}
              />

              <Route
                path="/analysis"
                element={<ProtectedRoute><Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><AnalysisWorkspaceHome /></Suspense></ProtectedRoute>}
              />
              <Route
                path="/analysis/new"
                element={<ProtectedRoute><Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><AnalysisNew /></Suspense></ProtectedRoute>}
              />
              <Route
                path="/analysis/session/:analysisId"
                element={<ProtectedRoute><Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><AnalysisSessionPage /></Suspense></ProtectedRoute>}
              />
              <Route
                path="/analysis/session/:analysisId/save"
                element={<ProtectedRoute><Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><AnalysisSessionPage /></Suspense></ProtectedRoute>}
              />
              <Route
                path="/analysis/session/:analysisId/attach"
                element={<ProtectedRoute><Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><AnalysisSessionPage /></Suspense></ProtectedRoute>}
              />
              <Route
                path="/analysis/session/:analysisId/export"
                element={<ProtectedRoute><Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><AnalysisSessionPage /></Suspense></ProtectedRoute>}
              />
              <Route
                path="/analysis/session/:analysisId/versions"
                element={<ProtectedRoute><Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><AnalysisSessionPage /></Suspense></ProtectedRoute>}
              />

              <Route
                path="/workspace"
                element={<ProtectedRoute><Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><WorkspaceLauncher /></Suspense></ProtectedRoute>}
              />
              <Route
                path="/workspace/multi"
                element={<ProtectedRoute><Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><MultiTechWorkspace /></Suspense></ProtectedRoute>}
              />
              <Route
                path="/workspace/analysis"
                element={<ProtectedRoute><Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><WorkspaceLauncher /></Suspense></ProtectedRoute>}
              />
              <Route
                path="/workspace/xrd"
                element={<ProtectedRoute><Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><XRDWorkspace /></Suspense></ProtectedRoute>}
              />
              <Route
                path="/workspace/xps"
                element={<ProtectedRoute><Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><XPSWorkspace /></Suspense></ProtectedRoute>}
              />
              <Route
                path="/workspace/ftir"
                element={<ProtectedRoute><Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><FTIRWorkspace /></Suspense></ProtectedRoute>}
              />
              <Route
                path="/workspace/raman"
                element={<ProtectedRoute><Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><RamanWorkspace /></Suspense></ProtectedRoute>}
              />
              <Route
                path="/workspace/fusion"
                element={<ProtectedRoute><Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><FusionWorkspace /></Suspense></ProtectedRoute>}
              />
              <Route
                path="/workspace/:technique"
                element={<ProtectedRoute><Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><TechniqueWorkspace /></Suspense></ProtectedRoute>}
              />

              <Route
                path="/notebook"
                element={<ProtectedRoute><Suspense fallback={<PageLoadingIndicator message="Loading Notebook..." />}><NotebookLab /></Suspense></ProtectedRoute>}
              />
              <Route
                path="/reports"
                element={<ProtectedRoute><Suspense fallback={<PageLoadingIndicator message="Loading Report..." />}><ReportBuilder /></Suspense></ProtectedRoute>}
              />
              <Route
                path="/report"
                element={<ProtectedRoute><Suspense fallback={<PageLoadingIndicator message="Loading Report..." />}><ReportBuilder /></Suspense></ProtectedRoute>}
              />
              <Route
                path="/history"
                element={<ProtectedRoute><Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><HistoryPage /></Suspense></ProtectedRoute>}
              />
              <Route
                path="/settings"
                element={<ProtectedRoute><Suspense fallback={<PageLoadingIndicator message="Loading Workspace..." />}><SettingsPage /></Suspense></ProtectedRoute>}
              />

              <Route
                path="/agent"
                element={<ProtectedRoute><Suspense fallback={<PageLoadingIndicator message="Loading Scientific Evidence..." />}><AgentDemo /></Suspense></ProtectedRoute>}
              />
              <Route
                path="/demo/agent"
                element={<ProtectedRoute><Suspense fallback={<PageLoadingIndicator message="Loading Scientific Evidence..." />}><AgentDemo /></Suspense></ProtectedRoute>}
              />
            </Routes>
          </Suspense>
        </XrdWorkflowRuntimeProvider>
      </Router>
      </OrganizationProvider>
    </AuthProvider>
  );
}

export default function AppWithInsights() {
  return (
    <>
      <App />
      <SpeedInsights />
    </>
  );
}
