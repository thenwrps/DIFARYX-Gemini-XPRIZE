import { useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { ScientificAnalysisWorkspace } from '../../workspaces/components/ScientificAnalysisWorkspace';
import AgentDemo from './ClassicAgentDemo';

export default function AgentWorkspace() {
  const [searchParams] = useSearchParams();

  if (searchParams.get('classic') === '1') {
    return <AgentDemo />;
  }

  const requestedTechnique = searchParams.get('technique');
  const initialTechnique = requestedTechnique === 'xps' || requestedTechnique === 'ftir' || requestedTechnique === 'raman'
    ? requestedTechnique
    : 'xrd';

  return (
    <DashboardLayout>
      <ScientificAnalysisWorkspace
        initialTechnique={initialTechnique}
        fileName={searchParams.get('file') ?? undefined}
        projectId={searchParams.get('project') ?? 'agent-workspace'}
        sessionId={searchParams.get('sessionId') ?? undefined}
        surface="agent"
      />
    </DashboardLayout>
  );
}
