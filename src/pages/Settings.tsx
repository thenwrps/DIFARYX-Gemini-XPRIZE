import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bot, Database, Download, Link2, User } from 'lucide-react';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { Card } from '../components/ui/Card';
import { DEFAULT_PROJECT_ID } from '../data/demoProjects';
import { ConnectedAccountStatus } from '../components/runtime/ConnectedAccountStatus';
import { useAuth } from '../contexts/AuthContext';
import { useX7UniversalHook } from '../hooks/useX7UniversalHook';
import {
  getDefaultConnectedAccountState,
  getGoogleConnectedShellState,
} from '../runtime/connectedAccounts';
import {
  getEffectiveWorkspaceMode,
  getStoredWorkspaceMode,
  getWorkspaceModeBadgeClass,
  getWorkspaceModeLabel,
  setWorkspaceMode,
  toWorkspaceMode,
} from '../utils/workspaceMode';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">{label}</span>
      <input
        readOnly
        value={value}
        className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main focus:outline-none"
      />
    </label>
  );
}

function ToggleRow({ label, description, checked = true }: { label: string; description: string; checked?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-background/50 p-3">
      <div>
        <div className="text-sm font-medium text-text-main">{label}</div>
        <div className="text-xs text-text-muted mt-1">{description}</div>
      </div>
      <div className={`h-6 w-11 rounded-full p-0.5 ${checked ? 'bg-primary' : 'bg-surface-hover'}`}>
        <div className={`h-5 w-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  
  // Connect X7E Enterprise Hook
  const { 
    gmailConnected, 
    connectGmail, 
    disconnectGmail, 
    uploadToDrive, 
    scanGmail 
  } = useX7UniversalHook();

  // Local state for API status, spinners, and inline alerts
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiSuccess, setApiSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [googleEmail, setGoogleEmail] = useState<string>('difaryxlab@gmail.com');

  // Load Google User Info email dynamically via OAuth token if connected
  useEffect(() => {
    const token = localStorage.getItem('difaryx_google_user_token');
    if (token) {
      fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Failed to fetch profile');
      })
      .then(data => {
        if (data.email) {
          setGoogleEmail(data.email);
        }
      })
      .catch(err => {
        console.warn('Failed to load Google user info from OAuth profile:', err);
        // Fallback to the requested test identity
        setGoogleEmail('difaryxlab@gmail.com');
      });
    }
  }, [gmailConnected]);

  const effectiveWorkspaceMode = getEffectiveWorkspaceMode({
    authUser: user,
    searchParams,
    storedMode: getStoredWorkspaceMode(),
  });
  const workspaceMode = toWorkspaceMode(effectiveWorkspaceMode);
  const localAccountState = getDefaultConnectedAccountState();

  // Build real-time synchronized Google Account State
  const googleAccountShell = {
    ...getGoogleConnectedShellState(),
    status: gmailConnected ? ('connected_active' as const) : ('approval_required' as const),
    providerLabel: gmailConnected ? `Google Workspace (Active: ${googleEmail})` : 'Google preview connection',
    capabilities: getGoogleConnectedShellState().capabilities.map(cap => ({
      ...cap,
      status: gmailConnected ? ('connected_active' as const) : cap.status,
      description: gmailConnected 
        ? `Authorized via User OAuth 2.0. Service connection is live.`
        : cap.description
    }))
  };

  const isGoogleUser = user?.provider === 'google' || gmailConnected;
  const signedInEmail = gmailConnected 
    ? googleEmail 
    : (isGoogleUser ? user?.email ?? 'Google account connected' : 'Not connected');

  const mockDriveWorkspacePath = '/workspace/xrd?project=cu-fe2o4-spinel&mode=demo&source=google_drive_connected&driveFileId=drive-cufe2o4-xrd';
  const mockDriveReportPath = '/reports?project=cu-fe2o4-spinel&mode=demo&source=google_drive_connected&driveFileId=drive-cufe2o4-xrd';

  // Handler for real Drive Import testing with catch-block Hard Lock alerts
  const handlePreviewDriveImportClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setApiError(null);
    setApiSuccess(null);

    try {
      if (!gmailConnected) {
        throw new Error('OAuth Authentication Guardrail: No active Google Workspace connection. Please click "Connect Google Workspace" first.');
      }

      console.log('[Settings Page] Initiating Gmail search for lab results...');
      const emails = await scanGmail('spinel XRD');

      console.log('[Settings Page] Scan successful. Uploading data payload to Google Drive...');
      const firstEmail = emails[0];
      const payloadContent = `DIFARYX Import Summary:
Subject: ${firstEmail?.subject || 'N/A'}
Sender: ${firstEmail?.sender || 'N/A'}
Date: ${firstEmail?.receivedAt || 'N/A'}
Payload details: ${firstEmail?.body || 'No description'}`;

      const uploadResult = await uploadToDrive('difaryx_lab_import.txt', payloadContent);
      
      setApiSuccess(
        `Gmail scan completed (fetched ${emails.length} items). File successfully uploaded to Google Drive Folder (ID: ${uploadResult.id})!`
      );
    } catch (err: any) {
      console.error('[Settings Page API Error]', err);
      // Hard Lock exception is captured and rendered inline
      setApiError(err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-8 h-full overflow-y-auto">
        <div className="mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Workspace configuration</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-text-muted mt-1 text-sm">Configure workspace, connected accounts, and run real-time scientific connections.</p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card className="p-5 xl:col-span-2">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Database size={16} className="text-primary" /> Demo Dataset / Deterministic Scientific Workflow</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-muted">
              This demo uses a deterministic scientific workflow for reliability. The same structured pipeline is designed to connect with model and tool-based execution layers.
            </p>
          </Card>

          <Card className="p-5 xl:col-span-2">
            <h2 className="text-sm font-semibold flex items-center gap-2"><User size={16} className="text-primary" /> Workspace Mode</h2>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${getWorkspaceModeBadgeClass(workspaceMode)}`}>
                {getWorkspaceModeLabel(workspaceMode)}
              </span>
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${gmailConnected ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-amber-300 bg-amber-50 text-amber-700'}`}>
                {gmailConnected ? 'External writes active' : 'External writes disabled'}
              </span>
            </div>
            <p className="mt-3 text-sm text-text-muted">
              Google account: <span className="font-semibold text-text-main">{signedInEmail}</span>. Drive and Gmail are active when authorized via OAuth.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/dashboard"
                onClick={() => setWorkspaceMode('user')}
                className="inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-xs font-bold text-text-main hover:bg-surface-hover"
              >
                User Workspace
              </Link>
              <Link
                to="/dashboard?mode=demo"
                onClick={() => setWorkspaceMode('demo')}
                className="inline-flex h-8 items-center rounded-md border border-primary bg-primary/10 px-3 text-xs font-bold text-primary hover:bg-primary/20"
              >
                Demo Mode
              </Link>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold flex items-center gap-2"><User size={16} className="text-primary" /> Profile</h2>
            <div className="mt-5 grid gap-4">
              <Field label="Name" value={user?.name ?? 'Demo Researcher'} />
              <Field label="Email" value={signedInEmail} />
              <Field label="Organization" value={user?.organization ?? (gmailConnected ? 'Google Authorized' : 'DIFARYX Demo Lab')} />
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Database size={16} className="text-primary" /> Data Handling</h2>
            <div className="mt-5 grid gap-4">
              <Field label="Default project" value={DEFAULT_PROJECT_ID} />
              <ToggleRow label="Local demo mode" description="Use bundled project data without a backend connection." />
              <Field label="File retention" value="Demo files reset between production sessions" />
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Download size={16} className="text-primary" /> Export Preferences</h2>
            <div className="mt-5 grid gap-3">
              <ToggleRow label="PDF report" description="Include phase summary and evidence trace." />
              <ToggleRow label="CSV data" description="Include processed spectrum and peak table." />
              <ToggleRow label="PNG chart" description="Export publication-ready graph images." />
              <ToggleRow label="DOCX summary" description="Create editable notebook summaries." checked={false} />
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Bot size={16} className="text-primary" /> Analysis Preferences</h2>
            <div className="mt-5 grid gap-4">
              <ToggleRow label="Evidence-linked interpretations" description="Require every interpretation to cite supporting data." />
              <Field label="Review criterion" value="Structural consistency" />
              <ToggleRow label="Include limitations in reports" description="Surface uncertainty and follow-up validation notes." />
            </div>
          </Card>

          <Card className="p-5 xl:col-span-2">
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-3"><Link2 size={16} className="text-primary" /> Connected Accounts</h2>
            
            {/* Inline Alert Panel for Hard Lock API error handling */}
            {apiError && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800 leading-snug">
                🚨 {apiError}
              </div>
            )}
            {apiSuccess && (
              <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 leading-snug">
                ✅ {apiSuccess}
              </div>
            )}

            <p className="mb-4 text-sm leading-relaxed text-text-muted">
              Connect to your Google Workspace account to enable live synchronization with Gmail (Lab notifications scanning) and Google Drive (Research reports backup).
            </p>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ConnectedAccountStatus state={localAccountState} capabilities={['storage_future']} />
              <ConnectedAccountStatus state={googleAccountShell} capabilities={['drive_import', 'drive_export_future', 'gmail_draft_future']} />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-md border border-blue-200 bg-blue-50/60 p-4">
              <div>
                <span className="text-xs font-bold text-blue-900 block">Workspace Actions</span>
                <span className="text-[11px] text-blue-700">Trigger live API pipelines (Drive Upload & Gmail scan) or connect credentials.</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {!gmailConnected ? (
                  <button 
                    onClick={connectGmail}
                    className="inline-flex h-8 items-center rounded-md bg-blue-600 px-3.5 text-xs font-bold text-white hover:bg-blue-700 shadow-sm"
                  >
                    Connect Google Workspace
                  </button>
                ) : (
                  <button 
                    onClick={disconnectGmail}
                    className="inline-flex h-8 items-center rounded-md border border-red-200 bg-white px-3.5 text-xs font-bold text-red-600 hover:bg-red-50 shadow-sm"
                  >
                    Disconnect Account
                  </button>
                )}
                
                <button 
                  onClick={handlePreviewDriveImportClick}
                  disabled={isLoading}
                  className="inline-flex h-8 items-center rounded-md border border-blue-300 bg-white px-3 text-xs font-bold text-blue-700 hover:bg-blue-50 shadow-sm disabled:opacity-50"
                >
                  {isLoading ? 'Processing...' : 'Preview Drive import'}
                </button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
