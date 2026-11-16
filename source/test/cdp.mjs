// Minimal Chrome DevTools Protocol driver (no dependencies): launches GPU-accelerated Chrome and drives one page.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ width = 1280, height = 720, headless = true, port = 9333 + (process.pid % 500) } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'abyssal-'));
  const args = [`--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check',
    '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--force-device-scale-factor=1', `--window-size=${width},${height}`, '--hide-scrollbars'];
  if (headless) args.push('--headless=new');
  if (process.env.JSFLAGS) args.push('--js-flags=' + process.env.JSFLAGS, '--no-sandbox', '--enable-logging=stderr');
  args.push('about:blank');
  const proc = spawn(CHROME, args, { stdio: process.env.JSFLAGS ? ['ignore', 'inherit', 'inherit'] : 'ignore' });
  // never leave a browser behind, even when a test throws or is interrupted
  process.on('exit', () => { try { proc.kill('SIGKILL'); } catch {} });
  for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => process.exit(130));
  let target;
  for (let i = 0; i < 100 && !target; i++) {
    await sleep(100);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
  }
  if (!target) { proc.kill(); throw new Error('Chrome did not start'); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = new Map(), logs = [], handlers = {};
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.j(new Error(m.error.message)) : p.r(m.result); }
    else if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    else if (m.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    else if (handlers[m.method]) handlers[m.method](m.params);
  };
  const send = (method, params = {}) => new Promise((r, j) => { pend.set(++id, { r, j }); ws.send(JSON.stringify({ id, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  return {
    send, ev, logs, sleep, on: (m, f) => { handlers[m] = f; },
    goto: async (url) => { await send('Page.navigate', { url }); },
    waitFor: async (expr, ms = 120000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(expr)) return; } catch {} await sleep(200); } throw new Error('timeout: ' + expr + '\n' + logs.join('\n')); },
    shot: async (file, opt = {}) => { const r = await send('Page.captureScreenshot', { format: opt.jpeg ? 'jpeg' : 'png', quality: opt.jpeg ? 88 : undefined }); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, Buffer.from(r.data, 'base64')); },
    key: async (code, down = true) => { await send('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', code, key: code.replace(/^Key|^Digit/, '').toLowerCase(), windowsVirtualKeyCode: code.startsWith('Key') ? code.charCodeAt(3) : code.startsWith('Digit') ? code.charCodeAt(5) : 0 }); },
    tap: async (code) => { const k = { code, key: code.replace(/^Key|^Digit/, '').toLowerCase(), windowsVirtualKeyCode: code.startsWith('Key') ? code.charCodeAt(3) : code.startsWith('Digit') ? code.charCodeAt(5) : 0 }; await send('Input.dispatchKeyEvent', { type: 'keyDown', ...k }); await send('Input.dispatchKeyEvent', { type: 'keyUp', ...k }); },
    close: async () => { try { await send('Browser.close'); } catch {} proc.kill(); },
  };
}
