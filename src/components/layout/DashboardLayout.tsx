import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Bot,
  BookOpen,
  FileText,
  FlaskConical,
  History,
  LayoutDashboard,
  Settings,
  Search,
  User,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  LogOut,
} from 'lucide-react';
import { cn } from '../ui/Button';
import { DEFAULT_PROJECT_ID } from '../../data/demoProjects';
import { useAuth } from '../../contexts/AuthContext';
import {
  clearWorkspaceMode,
  getEffectiveWorkspaceMode,
  getStoredWorkspaceMode,
  type WorkspaceMode,
} from '../../utils/workspaceMode';
import {
  buildEvidenceRouteSearch,
  getEvidenceRouteContext,
} from '../../utils/evidenceRouteContext';

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  match: string[];
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user, signOut } = useAuth();
  const [storedMode, setStoredModeState] = React.useState<WorkspaceMode | null>(() => getStoredWorkspaceMode());
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);
  const [isProfileOpen, setIsProfileOpen] = React.useState(false);

  React.useEffect(() => {
    const handleWorkspaceModeChange = () => {
      setStoredModeState(getStoredWorkspaceMode());
    };

    window.addEventListener('workspace-mode-changed', handleWorkspaceModeChange);
    window.addEventListener('storage', handleWorkspaceModeChange);
    return () => {
      window.removeEventListener('workspace-mode-changed', handleWorkspaceModeChange);
      window.removeEventListener('storage', handleWorkspaceModeChange);
    };
  }, []);

  const effectiveWorkspaceMode = getEffectiveWorkspaceMode({
    authUser: user,
    searchParams: new URLSearchParams(location.search),
    storedMode,
  });
  const routeContext = getEvidenceRouteContext({
    authUser: user,
    searchParams: new URLSearchParams(location.search),
    storedMode,
  });
  const uploadedEvidenceSearch = routeContext.isUploadedContext ? buildEvidenceRouteSearch(routeContext) : '';
  const uploadedTechnique = routeContext.technique ?? 'xrd';
  const useUserWorkspaceNav = effectiveWorkspaceMode === 'user';
  const demoModeSuffix = effectiveWorkspaceMode === 'demo_explicit' ? '&mode=demo' : '';
  const demoModeOnlySuffix = effectiveWorkspaceMode === 'demo_explicit' ? '?mode=demo' : '';
  const demoProjectQuery = `?project=${DEFAULT_PROJECT_ID}${demoModeSuffix}`;

  const mainNavItems: NavItem[] = uploadedEvidenceSearch ? [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', match: ['/', '/dashboard'] },
    {
      label: 'Workspace',
      icon: FlaskConical,
      path: `/workspace?${uploadedEvidenceSearch}`,
      match: ['/workspace', '/analysis'],
    },
    { label: 'Agent Workspace', icon: Bot, path: `/demo/agent?${uploadedEvidenceSearch}`, match: ['/demo/agent'] },
    { label: 'Notebook Lab', icon: BookOpen, path: `/notebook?${uploadedEvidenceSearch}&template=research`, match: ['/notebook'] },
    { label: 'Reports', icon: FileText, path: `/report?${uploadedEvidenceSearch}&template=xrd-summary`, match: ['/reports', '/report'] },
    { label: 'History', icon: History, path: `/history?${uploadedEvidenceSearch}`, match: ['/history'] },
    { label: 'Settings', icon: Settings, path: '/settings', match: ['/settings'] },
  ] : [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', match: ['/', '/dashboard'] },
    {
      label: 'Workspace',
      icon: FlaskConical,
      path: useUserWorkspaceNav ? '/workspace' : `/workspace${demoProjectQuery}`,
      match: ['/workspace', '/analysis'],
    },
    { label: 'Agent Workspace', icon: Bot, path: useUserWorkspaceNav ? '/demo/agent' : `/demo/agent${demoProjectQuery}`, match: ['/demo/agent'] },
    { label: 'Notebook Lab', icon: BookOpen, path: useUserWorkspaceNav ? '/notebook' : `/notebook${demoProjectQuery}`, match: ['/notebook'] },
    { label: 'Reports', icon: FileText, path: useUserWorkspaceNav ? '/reports' : `/reports${demoProjectQuery}`, match: ['/reports'] },
    { label: 'History', icon: History, path: useUserWorkspaceNav ? '/history' : `/history${demoModeOnlySuffix}`, match: ['/history'] },
    { label: 'Settings', icon: Settings, path: '/settings', match: ['/settings'] },
  ];

  const isActiveItem = (item: NavItem) => {
    const pathname = location.pathname;
    return item.match.some((prefix) => {
      if (prefix === '/') return pathname === '/';
      return pathname === prefix || pathname.startsWith(`${prefix}/`);
    });
  };

  const renderNavItems = (
    items: NavItem[],
  ) => (
    <div className="space-y-1">
      {items.map((item, i) => {
        const active = isActiveItem(item);
        return (
          <Link
            key={`${item.label}-${i}`}
            to={item.path}
            title={isSidebarCollapsed ? item.label : undefined}
            className={cn(
              "flex h-[38px] items-center rounded-[5px] text-[13px] font-semibold transition-colors",
              isSidebarCollapsed ? "justify-center px-0" : "justify-start gap-2.5 px-2.5",
              active
                ? "bg-[#2f66e9] text-white"
                : "text-[#475467] hover:bg-[#f1f5f9] hover:text-[#101828]"
            )}
          >
            <item.icon size={isSidebarCollapsed ? 20 : 18} />
            <span className={cn(isSidebarCollapsed ? "sr-only" : "inline")}>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );

  const handleSignOut = () => {
    signOut();
    clearWorkspaceMode();
    setIsProfileOpen(false);
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden text-text-main">
      {/* Sidebar */}
      <aside
        className={cn(
          "workspace-app-sidebar flex shrink-0 flex-col border-r border-[#dbe3ef] bg-white text-[#101828] transition-[width] duration-200",
          isSidebarCollapsed ? "w-14" : "w-[210px] max-[1100px]:w-14"
        )}
      >
        <div
          className={cn(
            "flex h-12 shrink-0 items-center border-b border-[#dbe3ef] px-2",
            isSidebarCollapsed ? "justify-center" : "justify-between"
          )}
        >
          <Link
            to="/"
            className={cn(
              "flex items-center rounded-md transition-colors hover:bg-slate-50",
              isSidebarCollapsed ? "h-9 w-9 justify-center" : "min-w-0 gap-2 px-1.5 py-1"
            )}
            title={isSidebarCollapsed ? "DIFARYX" : undefined}
          >
            <img
              src="/favicon.ico"
              alt=""
              className="h-[25px] w-[25px] shrink-0 rounded-[5px] object-cover"
            />
            {!isSidebarCollapsed && <span className="truncate text-[15px] font-extrabold tracking-[-0.035em] text-[#101828] max-[1100px]:hidden">DIFARYX</span>}
          </Link>
          {!isSidebarCollapsed && (
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(true)}
              className="tip inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-950 max-[1100px]:hidden"
              aria-label="Collapse sidebar"
              data-tip="Collapse sidebar"
            >
              <PanelLeftClose size={17} />
            </button>
          )}
        </div>
        <nav className={cn("flex-1 overflow-y-auto py-2.5", isSidebarCollapsed ? "px-2" : "px-2.5")}>
          {renderNavItems(mainNavItems)}
        </nav>
        {isSidebarCollapsed && (
          <div className="border-t border-[#dbe3ef] p-2">
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(false)}
              className="tip flex h-9 w-full items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              aria-label="Expand sidebar"
              data-tip="Expand sidebar"
            >
              <PanelLeftOpen size={18} />
            </button>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="z-40 flex h-12 shrink-0 items-center justify-between border-b border-[#dbe3ef] bg-white px-3 md:px-4">
          <div className="hidden min-w-0 flex-[0_1_420px] sm:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#667085]" size={15} />
              <input
                type="text" 
                placeholder="Search projects, patterns, or tags..." 
                className="h-8 w-full rounded-[5px] border border-[#d6e0ed] bg-[#f2f6fb] pl-8 pr-3 text-[12px] font-medium text-[#101828] outline-none transition-colors placeholder:text-[#98a2b3] focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
            </div>
          </div>
          <div className="relative flex items-center gap-3 ml-3">
            {!isAuthenticated ? (
              <Link
                to="/signin"
                state={{ from: location }}
                className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-bold text-text-main transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
              >
                Sign in with Google
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsProfileOpen((open) => !open)}
                  className="tip flex h-8 items-center gap-1.5 rounded-[18px] border border-[#8fb3ff] bg-[#eef5ff] px-1.5 pr-2 text-[#2f66e9] transition-colors hover:bg-[#e3efff]"
                  aria-label="Open profile menu"
                  aria-expanded={isProfileOpen}
                  data-tip="Account menu"
                >
                  {user?.picture ? (
                    <img src={user.picture} alt={user.name ?? user.email ?? 'Account'} className="h-6 w-6 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20">
                      <User size={14} />
                    </span>
                  )}
                  <ChevronDown size={13} />
                </button>
                {isProfileOpen && (
                  <div className="absolute right-0 top-10 z-50 w-64 rounded-lg border border-border bg-white p-2 shadow-xl shadow-slate-900/10">
                    <div className="rounded-md border border-border bg-background px-3 py-2">
                      <p className="text-sm font-bold text-text-main">{user?.name ?? 'Researcher'}</p>
                      <p className="mt-0.5 truncate text-xs text-text-muted">{user?.email ?? ''}</p>
                      {user?.organization && (
                        <p className="mt-1 text-[11px] font-semibold text-primary">{user.organization}</p>
                      )}
                    </div>
                    <div className="mt-2 space-y-1">
                      <Link
                        to="/settings"
                        onClick={() => setIsProfileOpen(false)}
                        className="flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-text-main hover:bg-surface-hover"
                      >
                        <Settings size={15} /> Profile settings
                      </Link>
                      <Link
                        to="/signin"
                        onClick={() => setIsProfileOpen(false)}
                        className="flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-text-main hover:bg-surface-hover"
                      >
                        <User size={15} /> Switch account
                      </Link>
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium text-red-600 hover:bg-red-50"
                      >
                        <LogOut size={15} /> Sign out
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
