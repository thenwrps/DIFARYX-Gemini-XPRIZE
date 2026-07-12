import React, { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Plus,
  RefreshCw,
  Building,
  AlertTriangle,
  FolderOpen,
  FlaskConical,
  X,
} from 'lucide-react';
import { DashboardLayout } from '../layout/DashboardLayout';
import { Card } from '../ui/Card';
import { useAuth } from '../../contexts/AuthContext';
import { useOrganization } from '../../contexts/OrganizationContext';
import { useWorkspaceProjects } from '../../hooks/useWorkspaceProjects';
import type { ProjectResponse, ApiError } from '../../services/api/types';

export function ServerWorkspaceLauncher() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  
  // Organization Context state
  const {
    organizations,
    activeOrganizationId,
    status: orgStatus,
    error: orgError,
    setActiveOrganizationId,
    refresh: refreshOrgs,
  } = useOrganization();

  // Project state hook
  const {
    projects,
    isLoading: isProjectsLoading,
    error: projectsError,
    isCreatePending,
    retry: retryProjects,
    createProject,
  } = useWorkspaceProjects(activeOrganizationId);

  // Local UI states
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newProjectTitle, setNewProjectTitle] = useState<string>('');
  const [newProjectDesc, setNewProjectDesc] = useState<string>('');
  const [createError, setCreateError] = useState<string | null>(null);

  // Focus management refs
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Initialize selected project from search params on load
  const paramProjectId = searchParams.get('project');
  useEffect(() => {
    if (paramProjectId && projects.some(p => p.id === paramProjectId)) {
      setSelectedProjectId(paramProjectId);
    } else if (projects.length > 0 && !selectedProjectId) {
      // Default to first project if none is active
      setSelectedProjectId(projects[0].id);
      const next = new URLSearchParams(searchParams);
      next.set('project', projects[0].id);
      setSearchParams(next, { replace: true });
    }
  }, [paramProjectId, projects, setSearchParams]);

  // Handle organization switch
  const handleOrgChange = (orgId: string) => {
    setActiveOrganizationId(orgId);
    setSelectedProjectId(null);
    const next = new URLSearchParams(searchParams);
    next.delete('project');
    setSearchParams(next, { replace: true });
  };

  // Handle project select
  const handleProjectSelect = (projId: string) => {
    setSelectedProjectId(projId);
    const next = new URLSearchParams(searchParams);
    next.set('project', projId);
    setSearchParams(next, { replace: false });
  };

  // Keyboard Escape key handler to close create modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showCreateModal) {
        handleCloseModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCreateModal]);

  const handleOpenModal = () => {
    setShowCreateModal(true);
    setCreateError(null);
    setNewProjectTitle('');
    setNewProjectDesc('');
    // Focus title input on next tick
    setTimeout(() => titleInputRef.current?.focus(), 50);
  };

  const handleCloseModal = () => {
    setShowCreateModal(false);
    // Return focus to creation trigger
    createButtonRef.current?.focus();
  };

  // Create Project submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newProjectTitle.trim();
    if (!title) {
      setCreateError('Project title is required');
      return;
    }
    if (isCreatePending) return;

    try {
      setCreateError(null);
      const newProj = await createProject({
        title,
        description: newProjectDesc.trim() || undefined,
      });
      setShowCreateModal(false);
      handleProjectSelect(newProj.id);
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create project');
    }
  };

  // Resolve current active project details
  const activeProject = projects.find(p => p.id === selectedProjectId) || null;

  // Active user role in the selected organization
  const activeOrgMembership = user && activeOrganizationId
    ? organizations.find(o => o.id === activeOrganizationId)
    : null;

  // Render Org Selector presentational block
  const renderOrgSelector = () => {
    return (
      <div className="flex items-center gap-2">
        <Building size={16} className="text-text-muted" />
        <span id="org-selector-label" className="text-xs font-bold uppercase tracking-wider text-text-muted">
          Organization:
        </span>
        <select
          aria-labelledby="org-selector-label"
          value={activeOrganizationId || ''}
          onChange={(e) => handleOrgChange(e.target.value)}
          className="h-9 rounded-md border border-border bg-white px-2.5 text-xs font-semibold text-text-main shadow-sm outline-none focus:border-primary"
        >
          <option value="" disabled>Select Organization</option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.displayName} ({org.planTier})
            </option>
          ))}
        </select>
      </div>
    );
  };

  // Render Loader presentational block
  if (orgStatus === 'loading' || (orgStatus === 'ready' && isProjectsLoading && projects.length === 0)) {
    return (
      <DashboardLayout>
        <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-4 bg-slate-50">
          <div className="relative flex h-10 w-10 items-center justify-center">
            <div className="absolute inset-0 rounded-full border-2 border-slate-200" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
          </div>
          <h2 className="text-sm font-bold text-slate-600 animate-pulse">Loading Server Workspace...</h2>
        </div>
      </DashboardLayout>
    );
  }

  // Render Org Selection Required state
  if (orgStatus === 'selection_required') {
    return (
      <DashboardLayout>
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-50">
          <Card className="w-full max-w-md p-6 text-center bg-white border border-border">
            <Building size={36} className="mx-auto text-text-dim" />
            <h2 className="mt-4 text-base font-bold text-text-main">Organization Required</h2>
            <p className="mt-2 text-xs text-text-muted">
              You must be a member of an active organization to access server projects.
            </p>
            {organizations.length > 0 ? (
              <div className="mt-4 flex flex-col gap-2">
                <p className="text-[11px] font-semibold text-text-muted">Choose one organization to continue:</p>
                <select
                  onChange={(e) => handleOrgChange(e.target.value)}
                  className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                  defaultValue=""
                >
                  <option value="" disabled>Select Organization...</option>
                  {organizations.map(org => (
                    <option key={org.id} value={org.id}>{org.displayName}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="mt-4 text-xs text-red-600 font-semibold">
                No active organization memberships were found for your profile. Please contact your system administrator.
              </div>
            )}
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // Render Error states
  const activeError: ApiError | null = orgError || projectsError;
  if (activeError) {
    return (
      <DashboardLayout>
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-50">
          <Card className="w-full max-w-md p-6 bg-white border border-red-200">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-red-500 shrink-0" size={24} />
              <div>
                <h2 className="text-sm font-bold text-text-main">Workspace Connection Error</h2>
                <p className="mt-1 text-xs text-text-muted">{activeError.message || 'Unable to connect to the scientific metadata services.'}</p>
                {activeError.requestId && (
                  <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-text-dim">
                    Request ID: <span className="select-all font-mono text-slate-700">{activeError.requestId}</span>
                  </p>
                )}
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => {
                      if (orgError) refreshOrgs();
                      else retryProjects();
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-bold text-white hover:bg-primary/95"
                  >
                    <RefreshCw size={12} /> Retry Connection
                  </button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // Render Empty State within organization
  if (orgStatus === 'ready' && projects.length === 0) {
    return (
      <DashboardLayout>
        <div className="flex-1 flex flex-col bg-slate-50">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-text-main">Workspace Hub</h1>
                <p className="text-xs text-text-muted">Scientific project workspace on server persistence.</p>
              </div>
              {renderOrgSelector()}
            </div>

            <Card className="rounded-lg border-2 border-dashed bg-white p-10 text-center">
              <FolderOpen size={42} className="mx-auto text-text-dim" />
              <h2 className="mt-4 text-base font-bold text-text-main">No projects found</h2>
              <p className="mt-2 text-xs text-text-muted">No projects are available in this organization.</p>
              
              <div className="mt-6 flex justify-center">
                <button
                  ref={createButtonRef}
                  onClick={handleOpenModal}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-xs font-bold text-white hover:bg-primary/90"
                >
                  <Plus size={14} /> Create First Project
                </button>
              </div>
            </Card>
          </div>

          {/* Creation Dialog */}
          {showCreateModal && renderCreateModal()}
        </div>
      </DashboardLayout>
    );
  }

  // Render Ready state (Project Hub layout)
  return (
    <DashboardLayout>
      <div className="min-h-0 flex-1 overflow-hidden bg-soft">
        <div className="mx-auto flex h-full w-full max-w-7xl min-h-0 flex-col gap-3 p-3">
          <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-[-0.025em] text-text-main">Workspace Hub</h1>
                <span className="rounded-full bg-blue-soft px-2 py-0.5 text-[10px] font-semibold text-primary">
                  Server Mode
                </span>
              </div>
              <p className="mt-1 text-[12px] text-text-muted">Select or create a server-backed scientific R&D workspace.</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              {renderOrgSelector()}
              
              <button
                ref={createButtonRef}
                onClick={handleOpenModal}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-bold text-white hover:bg-primary/90"
              >
                <Plus size={13} /> New Project
              </button>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 gap-3 overflow-hidden xl:grid-cols-[minmax(0,1fr)_330px]">
            {/* Active Project Bench Layout */}
            <div className="min-h-0 overflow-y-auto pr-1">
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-[13px] font-bold text-text-main">Workspace scientific benches</h2>
                <span className="h-px flex-1 bg-border" />
                <span className="text-[10px] text-text-muted">benches connected to server projects</span>
              </div>

              {activeProject ? (
                <div className="space-y-3">
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
                    <h3 className="text-xs font-bold text-amber-800">Server Integration Notice</h3>
                    <p className="mt-1 text-xs leading-relaxed text-amber-950 font-medium">
                      Project workspace is connected to server persistence. Technique datasets and analysis runs are not yet migrated to server.
                    </p>
                  </div>

                  <Card className="bg-white p-5 rounded-md">
                    <h3 className="text-sm font-bold text-text-main">{activeProject.title}</h3>
                    <p className="mt-1 text-xs text-text-muted leading-relaxed">
                      {activeProject.description || 'No description provided.'}
                    </p>
                    <div className="mt-4 text-[10px] text-text-dim font-semibold uppercase tracking-wider">
                      Created: {new Date(activeProject.createdAt).toLocaleDateString()} &middot; ID: {activeProject.id}
                    </div>
                  </Card>

                  {/* Presentational placeholder cards showing available technique benches disabled */}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {['XRD', 'XPS', 'FTIR', 'Raman'].map((tech) => (
                      <div key={tech} className="rounded-md border border-border bg-slate-50/50 p-4 opacity-75">
                        <div className="flex items-center gap-2 text-text-muted">
                          <FlaskConical size={14} />
                          <span className="text-xs font-bold">{tech} Science Skill</span>
                        </div>
                        <p className="mt-2 text-[11px] text-text-dim">
                          Technique datasets are not yet migrated.
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-text-muted">Select a project to begin.</p>
              )}
            </div>

            {/* Sidebar list of projects */}
            <Card className="min-h-0 overflow-y-auto rounded-[8px] bg-white p-4 shadow-none flex flex-col">
              <h2 className="text-[13px] font-bold text-text-main pb-2 border-b border-border">Projects list</h2>
              <div className="mt-2 space-y-1 overflow-y-auto flex-1">
                {projects.map((proj) => {
                  const isActive = proj.id === selectedProjectId;
                  return (
                    <button
                      key={proj.id}
                      onClick={() => handleProjectSelect(proj.id)}
                      className={`w-full flex flex-col items-start gap-1 rounded-[5px] px-2.5 py-2 text-left text-xs transition-colors ${
                        isActive
                          ? 'bg-blue-soft text-primary'
                          : 'bg-soft text-text-main hover:bg-surface-hover'
                      }`}
                    >
                      <span className="font-bold truncate w-full">{proj.title}</span>
                      {proj.description && (
                        <span className="text-[10px] text-text-dim truncate w-full">{proj.description}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Card>
          </div>

          <p className="text-[11px] text-text-muted">
            All server mode actions are fully logged to the organization audit records.
          </p>
        </div>
      </div>

      {/* Creation Modal */}
      {showCreateModal && renderCreateModal()}
    </DashboardLayout>
  );

  // Presentational Create Modal
  function renderCreateModal() {
    return (
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-title"
      >
        <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl border border-border relative">
          <button
            onClick={handleCloseModal}
            className="absolute top-4 right-4 text-text-dim hover:text-text-main"
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>

          <h2 id="create-project-title" className="text-base font-bold text-text-main">
            Create New Project
          </h2>
          <p className="text-xs text-text-muted mt-1">
            Create an isolated scientific workflow workspace.
          </p>

          <form onSubmit={handleCreateSubmit} className="mt-4 space-y-4">
            <div>
              <label htmlFor="proj-title" className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1">
                Project Title
              </label>
              <input
                id="proj-title"
                ref={titleInputRef}
                type="text"
                required
                value={newProjectTitle}
                onChange={(e) => setNewProjectTitle(e.target.value)}
                placeholder="e.g. Copper Ferrite Spinel R&D"
                className="w-full h-9 rounded-md border border-border bg-white px-3 text-xs focus:border-primary focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="proj-desc" className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1">
                Description (Optional)
              </label>
              <textarea
                id="proj-desc"
                rows={3}
                value={newProjectDesc}
                onChange={(e) => setNewProjectDesc(e.target.value)}
                placeholder="Describe project research objective..."
                className="w-full rounded-md border border-border bg-white p-3 text-xs focus:border-primary focus:outline-none"
              />
            </div>

            {createError && (
              <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                {createError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleCloseModal}
                className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-white px-3 text-xs font-bold text-text-main hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreatePending}
                className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-4 text-xs font-bold text-white hover:bg-primary/95 disabled:opacity-50"
              >
                {isCreatePending ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }
}

export default ServerWorkspaceLauncher;
