import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import WebSocket from 'ws';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9340;
const baseUrl = 'http://127.0.0.1:4174';
const distRoot = join(process.cwd(), 'dist');
const contentTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer((request, response) => {
  const pathname = decodeURIComponent((request.url ?? '/').split('?')[0]);
  const candidate = join(distRoot, pathname === '/' ? 'index.html' : pathname.replace(/^\//, ''));
  const filePath = existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(distRoot, 'index.html');
  response.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream' });
  response.end(readFileSync(filePath));
});
await new Promise((resolve) => server.listen(4174, '127.0.0.1', resolve));
const profile = join(tmpdir(), `difaryx-agent-intake-${Date.now()}`);
const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--window-size=1440,800',
  '--disable-gpu',
  '--remote-allow-origins=*',
  '--no-first-run',
  '--no-default-browser-check',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let target;
for (let attempt = 0; attempt < 40; attempt += 1) {
  try {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
    target = targets.find((item) => item.type === 'page');
    if (target) break;
  } catch {}
  await sleep(250);
}
assert.ok(target, 'Chrome DevTools target did not start.');

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.once('open', resolve);
  socket.once('error', reject);
});

let commandId = 0;
const pending = new Map();
const runtimeErrors = [];
socket.on('message', (raw) => {
  const message = JSON.parse(String(raw));
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails.text);
});
socket.on('close', () => {
  pending.forEach(({ reject }) => reject(new Error('Chrome DevTools socket closed.')));
  pending.clear();
});
socket.on('error', (error) => {
  pending.forEach(({ reject }) => reject(error));
  pending.clear();
});

function cdp(method, params = {}) {
  commandId += 1;
  const id = commandId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }), (error) => {
      if (!error) return;
      pending.delete(id);
      reject(error);
    });
  });
}

async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function navigate(path) {
  await cdp('Page.navigate', { url: `${baseUrl}${path}` });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const ready = await evaluate('document.readyState === "complete" && document.body.innerText.trim().length > 0');
    if (ready) break;
    await sleep(250);
  }
  await sleep(1200);
}

async function clickText(text) {
  const clicked = await evaluate(`(() => { const target = [...document.querySelectorAll('button,a')].find((element) => element.textContent.trim().includes(${JSON.stringify(text)})); if (!target) return false; target.click(); return true; })()`);
  assert.equal(clicked, true, `Could not click ${text}.`);
  await sleep(500);
}

async function setField(label, value) {
  const changed = await evaluate(`(() => { const fieldLabel = [...document.querySelectorAll('label')].find((element) => element.textContent.includes(${JSON.stringify(label)})); const input = fieldLabel?.querySelector('input,textarea'); if (!input) return false; const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set; setter.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  assert.equal(changed, true, `Could not fill ${label}.`);
  await sleep(350);
}

async function setDrawerFiles(paths) {
  const documentNode = await cdp('DOM.getDocument', { depth: -1, pierce: true });
  const selected = await cdp('DOM.querySelector', { nodeId: documentNode.root.nodeId, selector: 'aside[role="dialog"] input[type="file"]' });
  assert.ok(selected.nodeId, 'Evidence drawer file input was not found.');
  await cdp('DOM.setFileInputFiles', { nodeId: selected.nodeId, files: paths });
}

async function waitForText(text, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`)) return;
    await sleep(300);
  }
  const body = await evaluate('document.body.innerText');
  throw new Error(`Timed out waiting for text: ${text}\n${body}`);
}

function signalFile(name, xStart, xEnd, peaks) {
  const path = join(tmpdir(), name);
  const rows = ['Position,Intensity'];
  for (let index = 0; index <= 500; index += 1) {
    const x = xStart + (xEnd - xStart) * index / 500;
    const y = 5 + peaks.reduce((sum, peak) => sum + peak.height * Math.exp(-Math.pow(x - peak.x, 2) / (2 * peak.width * peak.width)), 0);
    rows.push(`${x.toFixed(4)},${y.toFixed(4)}`);
  }
  writeFileSync(path, rows.join('\n'));
  return path;
}

await cdp('Page.enable');
await cdp('Runtime.enable');

const xrdFile = signalFile('standalone_xrd.xy', 10, 80, [{ x: 30, height: 100, width: 0.35 }, { x: 57, height: 70, width: 0.5 }]);
const ramanFile = signalFile('standalone_raman.txt', 100, 900, [{ x: 460, height: 100, width: 5 }, { x: 690, height: 75, width: 7 }]);
const ftirFile = signalFile('standalone_ftir.dat', 400, 4000, [{ x: 580, height: 95, width: 15 }, { x: 1100, height: 60, width: 20 }]);
const unsupportedFile = join(tmpdir(), 'unsupported-evidence.pdf');
writeFileSync(unsupportedFile, 'not a supported signal format');

await navigate('/demo/agent');
let body = await evaluate('document.body.innerText');
if (body.includes('AUTHENTICATION')) {
  await clickText('Continue as Guest / Researcher');
  await sleep(800);
  await navigate('/demo/agent');
  body = await evaluate('document.body.innerText');
}
assert.match(body, /Start a scientific review/);
assert.match(body, /Use prepared sample/);
assert.match(body, /Research objective/);
assert.match(body, /Material system/);
assert.match(body, /Decision required/);
assert.equal(await evaluate(`([...document.querySelectorAll('button')].find((button) => button.textContent.includes('Run Scientific Review'))?.disabled)`), true);

await setField('Research objective', 'Evaluate whether the uploaded evidence supports a spinel structure');
assert.equal(await evaluate(`([...document.querySelectorAll('button')].find((button) => button.textContent.includes('Run Scientific Review'))?.disabled)`), true);
await clickText('Add files');
await setDrawerFiles([xrdFile, ramanFile, unsupportedFile]);
await waitForText('unsupported');
await waitForText('2 ready', 45000);
body = await evaluate('document.body.innerText');
assert.match(body, /Unsupported format/);
assert.match(body, /standalone_xrd.xy/);
assert.match(body, /standalone_raman.txt/);
await clickText('Add ready evidence');
await waitForText('Evidence sources');
body = await evaluate('document.body.innerText');
assert.match(body, /XRD/);
assert.match(body, /Raman/);
assert.equal(await evaluate(`([...document.querySelectorAll('button')].find((button) => button.textContent.includes('Run Scientific Review'))?.disabled)`), false);

await clickText('Add evidence');
await setDrawerFiles([ftirFile]);
await waitForText('1 ready', 30000);
await clickText('Add ready evidence');
await waitForText('standalone_ftir.dat');
body = await evaluate('document.body.innerText');
assert.match(body, /XRD/);
assert.match(body, /Raman/);
assert.match(body, /FTIR/);

const screenshot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
writeFileSync('C:\\DIFARYX-demo\\agent-intake-verification.png', Buffer.from(screenshot.data, 'base64'));

await navigate('/demo/agent');
await clickText('Use prepared sample');
await sleep(800);
assert.match(await evaluate('location.href'), /project=cu-fe2o4-spinel/);
body = await evaluate('document.body.innerText');
assert.match(body, /Prepared evidence bundle/);

assert.deepEqual(runtimeErrors, []);
console.log('PASS standalone empty state and Run gating');
console.log('PASS multi-tech upload and unsupported rejection');
console.log('PASS additive evidence bundle update');
console.log('PASS explicit prepared sample selection');
console.log('PASS 1440x800 render with no runtime exceptions');

socket.close();
chrome.kill();
server.close();
