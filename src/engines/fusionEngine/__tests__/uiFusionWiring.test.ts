import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCrossTechConsistency } from '../../../pages/MultiTechWorkspace';

test('UI fusion path derives from evaluateFusionEngine rather than static strings', () => {
  const mockClaim = {
    id: 'spinel-ferrite',
    title: 'Spinel ferrite structure',
    description: 'Fe3O4 spinel ferrite',
    linkedEvidenceIds: [],
    interpretation: 'Fe3O4 spinel ferrite',
  };

  const output = generateCrossTechConsistency(mockClaim, []);
  
  // Verify that it returns dynamic evaluation output from runUniversalFusionAgent / evaluateFusionEngine
  // instead of the legacy static string 'Raman vibrational symmetry and XRD long-range order independently converge...'
  assert.notEqual(
    output,
    'Raman vibrational symmetry and XRD long-range order independently converge on cubic spinel structure. FTIR metal-oxygen band provides additional support. No contradictions observed across techniques.',
    'Must not return legacy static consistency string'
  );

  assert.ok(
    output.includes('Evaluation Tier:') || output.includes('unweighted fusion evaluation'),
    `Output must reflect evaluateFusionEngine output, got: ${output}`
  );
});
