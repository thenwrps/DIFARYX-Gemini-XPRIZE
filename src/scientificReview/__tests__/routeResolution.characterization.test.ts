import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import AgentDemo from '../../features/agent/pages/ClassicAgentDemo';

describe('AgentDemo route characterization', () => {
  it('loads the actual AgentDemo component module at runtime', () => {
    expect(AgentDemo).toBeTypeOf('function');
  });

  it('keeps both existing route entries pointed at the same page module', async () => {
    const source = await readFile(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    expect(source).toContain('path="/agent"');
    expect(source).toContain('path="/demo/agent"');
    expect((source.match(/<AgentDemo \/>/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
