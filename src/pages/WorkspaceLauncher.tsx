import React from 'react';
import { resolveRuntimeConfig } from '../config/runtimeConfig';
import { DemoWorkspaceLauncher } from '../components/workspace/DemoWorkspaceLauncher';
import { ServerWorkspaceLauncher } from '../components/workspace/ServerWorkspaceLauncher';
import { ConfigurationErrorScreen } from '../components/ui/ConfigurationErrorScreen';

export default function WorkspaceLauncher() {
  const { config, error } = resolveRuntimeConfig();

  if (error || !config) {
    return <ConfigurationErrorScreen error={error || 'Configuration resolution failed'} />;
  }

  if (config.mode === 'server') {
    return <ServerWorkspaceLauncher />;
  }

  return <DemoWorkspaceLauncher />;
}
