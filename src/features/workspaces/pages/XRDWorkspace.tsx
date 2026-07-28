import { useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '../../../shared/layout/DashboardLayout';
import { TechniqueWorkspaceShell } from '../components/TechniqueWorkspaceShell';
import { PersistentXrdWorkspace } from '../components/PersistentXrdWorkspace';
import { resolveRuntimeConfig } from '../../../config/runtimeConfig';

export default function XRDWorkspace() {
  const { config } = resolveRuntimeConfig();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') === 'quick' ? 'quick' : 'project';
  const fileName = searchParams.get('file') ?? undefined;
  const sessionId = searchParams.get('sessionId') ?? undefined;

  if (config?.mode === 'server') {
    return <PersistentXrdWorkspace />;
  }

  return (
    <DashboardLayout>
      <TechniqueWorkspaceShell technique="xrd" mode={mode} fileName={fileName} sessionId={sessionId} />
    </DashboardLayout>
  );
}
