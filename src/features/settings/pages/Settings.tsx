import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bot, Database, Download, Link2, User } from 'lucide-react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { Card } from '../../../components/ui/Card';
import { ConnectedAccountStatus } from '../../../components/runtime/ConnectedAccountStatus';
import { useAuth } from '../../../contexts/AuthContext';
import { useX7UniversalHook } from '../../../hooks/useX7UniversalHook';
import { useXrdWorkflowRuntime } from '../../../context/XrdWorkflowRuntimeContext';
import {
  getDefaultConnectedAccountState,
  getGoogleConnectedShellState,
} from '../../../runtime/connectedAccounts';
import { isRealBackendEnabled, setRealBackendEnabled } from '../../../utils/featureToggle';

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

function ToggleRow({
  label,
  description,
  checked = true,
  onChange,
}: {
  label: string;
  description: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <div 
      onClick={() => onChange && onChange(!checked)}
      className={`flex items-center justify-between gap-4 rounded-md border border-border bg-background/50 p-3 ${
        onChange ? 'cursor-pointer select-none hover:border-primary/30 transition-colors' : ''
      }`}
    >
      <div>
        <div className="text-sm font-medium text-text-main">{label}</div>
        <div className="text-xs text-text-muted mt-1">{description}</div>
      </div>
      <div className={`h-6 w-11 rounded-full p-0.5 transition-colors ${checked ? 'bg-primary' : 'bg-surface-hover'}`}>
        <div className={`h-5 w-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { currentSession, dispatchWorkflowEvent } = useXrdWorkflowRuntime();

  const [realBackendEnabled, setRealBackendEnabledState] = useState(() => isRealBackendEnabled());

  const handleRealBackendToggle = (enabled: boolean) => {
    setRealBackendEnabled(enabled);
    setRealBackendEnabledState(enabled);
  };

  // Connect X7E Enterprise Hook
  const {
    gmailConnected,
    connectGmail,
    disconnectGmail,
    uploadToDrive,
    scanGmail,
    connectedEmail,
    brightDataError
  } = useX7UniversalHook();

  // Local state for API status, spinners, and inline alerts
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiSuccess, setApiSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Synchronize Google Profile email dynamically via OAuth token if connected
  const isGoogleAuthenticated = user?.provider === 'google';
  const isCloudConnected = isGoogleAuthenticated || gmailConnected;

  const profileName = user?.name || currentSession?.userName || 'Scientific Researcher';
  const profileEmail = (isGoogleAuthenticated ? user?.email : null) || (gmailConnected ? connectedEmail : null) || currentSession?.userEmail || 'Not Connected';
  const profileOrg = user?.organization || currentSession?.organization || 'Independent Research / Affiliated Institution';

  // Synchronize Google Profile details dynamically to the session context if active
  useEffect(() => {
    if (currentSession) {
      if (
        currentSession.userEmail !== profileEmail ||
        currentSession.userName !== profileName ||
        currentSession.organization !== profileOrg
      ) {
        dispatchWorkflowEvent({
          type: 'UPDATE_USER_CONTEXT',
          payload: {
            userEmail: profileEmail,
            userName: profileName,
            organization: profileOrg,
          },
        });
      }
    }
  }, [profileEmail, profileName, profileOrg, currentSession, dispatchWorkflowEvent]);

  // Build real-time synchronized Google Account State
  const localAccountState = getDefaultConnectedAccountState();
  const googleAccountEmail = (isGoogleAuthenticated ? user?.email : null) || (gmailConnected ? connectedEmail : null) || 'Not Connected';

  const googleAccountShell = {
    ...getGoogleConnectedShellState(),
    status: isCloudConnected ? ('connected_active' as const) : ('approval_required' as const),
    providerLabel: isCloudConnected ? `Google Workspace (Active: ${googleAccountEmail})` : 'Google preview connection',
    capabilities: getGoogleConnectedShellState().capabilities.map(cap => ({
      ...cap,
      status: isCloudConnected ? ('connected_active' as const) : cap.status,
      description: isCloudConnected
        ? `Authorized via User OAuth 2.0. Service connection is live.`
        : cap.description
    }))
  };

  // Handler for real Drive Import testing with catch-block Hard Lock alerts
  const handlePreviewDriveImportClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setApiError(null);
    setApiSuccess(null);

    try {
      if (!isCloudConnected) {
        throw new Error('OAuth Authentication Guardrail: No active Google Workspace connection. Please click "Connect Cloud Account (OAuth)" first.');
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
          <Card className="p-5">
            <h2 className="text-sm font-semibold flex items-center gap-2"><User size={16} className="text-primary" /> Profile</h2>
            <div className="mt-5 grid gap-4">
              <Field label="Name" value={profileName} />
              <Field label="Email" value={profileEmail} />
              <Field label="Organization" value={profileOrg} />
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Database size={16} className="text-primary" /> Data Handling</h2>
            <div className="mt-5 grid gap-4">
              <ToggleRow 
                label="Real Backend Integration" 
                description="Process uploaded signals using the FastAPI server at http://localhost:8000." 
                checked={realBackendEnabled}
                onChange={handleRealBackendToggle}
              />
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
            {brightDataError && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800 leading-snug">
                🚨 {brightDataError}
              </div>
            )}
            {apiSuccess && (
              <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 leading-snug">
                ✅ {apiSuccess}
              </div>
            )}

            {!isCloudConnected ? (
              <div className="flex flex-col items-center justify-center border border-dashed border-border rounded-lg p-8 text-center bg-background/30">
                <Link2 size={32} className="text-text-muted mb-3" />
                <h3 className="text-sm font-semibold text-text-main">No Connected Cloud Accounts</h3>
                <p className="text-xs text-text-muted mt-1 mb-4 max-w-sm">
                  Connect to your cloud account to sync active sessions, export research records, and run scientific workflows.
                </p>
                <button
                  onClick={connectGmail}
                  className="inline-flex h-8 items-center rounded-md bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-700 shadow-sm transition-colors"
                >
                  Connect Cloud Account (OAuth)
                </button>
              </div>
            ) : (
              <>
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
                    <button
                      onClick={disconnectGmail}
                      className="inline-flex h-8 items-center rounded-md border border-red-200 bg-white px-3.5 text-xs font-bold text-red-600 hover:bg-red-50 shadow-sm"
                    >
                      Disconnect Account
                    </button>

                    <button
                      onClick={handlePreviewDriveImportClick}
                      disabled={isLoading}
                      className="inline-flex h-8 items-center rounded-md border border-blue-300 bg-white px-3 text-xs font-bold text-blue-700 hover:bg-blue-50 shadow-sm disabled:opacity-50"
                    >
                      {isLoading ? 'Processing...' : 'Preview Drive import'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
