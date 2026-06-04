import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const BASE = 'D:/DIFARYX_Synthetic_Data/SampleLibrary';
const techniques = ['XRD', 'FTIR', 'XPS', 'Raman'];

console.log('=== DIFARYX Sample Library Verification ===\n');

let totalFiles = 0;
let totalSize = 0;

for (const tech of techniques) {
  const dir = join(BASE, tech, 'txt');
  const files = readdirSync(dir).filter(f => f.endsWith('.txt'));
  let techSize = 0;
  for (const f of files) {
    techSize += statSync(join(dir, f)).size;
  }
  const sizeMB = (techSize / 1024 / 1024).toFixed(1);
  console.log(`${tech}: ${files.length.toLocaleString()} files | ${sizeMB} MB`);
  totalFiles += files.length;
  totalSize += techSize;
}

const totalGB = (totalSize / 1024 / 1024 / 1024).toFixed(2);
console.log(`\nTotal: ${totalFiles.toLocaleString()} files | ${totalGB} GB`);

// Show first XRD file header
console.log('\n=== Sample XRD File (first 20 lines) ===');
const firstXrd = readdirSync(join(BASE, 'XRD', 'txt')).filter(f => f.endsWith('.txt'))[0];
const content = readFileSync(join(BASE, 'XRD', 'txt', firstXrd), 'utf-8');
const lines = content.split('\n');
for (let i = 0; i < Math.min(20, lines.length); i++) {
  console.log(lines[i]);
}

// Show first FTIR file header
console.log('\n=== Sample FTIR File (first 20 lines) ===');
const firstFtir = readdirSync(join(BASE, 'FTIR', 'txt')).filter(f => f.endsWith('.txt'))[0];
const ftirContent = readFileSync(join(BASE, 'FTIR', 'txt', firstFtir), 'utf-8');
const ftirLines = ftirContent.split('\n');
for (let i = 0; i < Math.min(20, ftirLines.length); i++) {
  console.log(ftirLines[i]);
}

// Count unique analysis modes and industries (sample evenly across all files)
console.log('\n=== Distribution Check ===');
for (const tech of techniques) {
  const dir = join(BASE, tech, 'txt');
  const allFiles = readdirSync(dir).filter(f => f.endsWith('.txt'));
  const modes = new Set();
  const industries = new Set();
  // Sample 500 files evenly spaced across the full range
  const step = Math.max(1, Math.floor(allFiles.length / 500));
  for (let i = 0; i < allFiles.length; i += step) {
    const c = readFileSync(join(dir, allFiles[i]), 'utf-8');
    const modeMatch = c.match(/# Analysis Mode:\s+(.+)/);
    const indMatch = c.match(/# Industry:\s+(.+)/);
    if (modeMatch) modes.add(modeMatch[1]);
    if (indMatch) industries.add(indMatch[1]);
  }
  console.log(`${tech}: ${modes.size} modes, ${industries.size} industries (sampled ${Math.ceil(allFiles.length / step)} files)`);
  console.log(`  Modes: ${[...modes].join(', ')}`);
  console.log(`  Industries: ${[...industries].join(', ')}`);
}
