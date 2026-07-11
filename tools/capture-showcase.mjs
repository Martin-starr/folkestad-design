// capture-showcase.mjs — regenerates /images/showcase/ from the /eksempel demo sites.
//
// Usage:  NODE_PATH=<global node_modules> node tools/capture-showcase.mjs
//         (needs playwright + a Chromium; set CHROMIUM_PATH if autodetect fails)
//
// For each demo site it captures a full-page screenshot at desktop (1440px,
// DPR 1.5) and mobile (420px, DPR 2), hides the concept banner, freezes
// animations, and compresses to WebP via Chromium's own canvas encoder.
// Swap a mockup in index.html by pointing a chapter's <img> at any image
// this script writes (or your own upload) and updating width/height/alt.

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
  try { ({ chromium } = require(p)); break; } catch {}
}
if (!chromium) { console.error('playwright not found — set NODE_PATH'); process.exit(1); }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'images', 'showcase');
const PORT = 8931;
const MAX_DEVICE_H = 15000; // device px — stays under Safari's 16384 texture limit
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const SITES = [
  { id: 'solhuset',   url: '/eksempel/onepager/' },
  { id: 'vindfanget', url: '/eksempel/bistro/' },
  { id: 'saltkroken', url: '/eksempel/frisor/' },
  { id: 'soregga',    url: '/eksempel/bilverksted/' },
  { id: 'strandhus',  url: '/eksempel/femsider/' },
];
const PROFILES = [
  { tag: '1440', viewport: { width: 1440, height: 900 }, dpr: 1.5, budget: 350 * 1024 },
  { tag: '420',  viewport: { width: 420,  height: 860 }, dpr: 2,   budget: 200 * 1024 },
];

const server = spawn('npx', ['--no-install', 'http-server', ROOT, '-p', String(PORT), '--silent'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
mkdirSync(OUT, { recursive: true });

async function toWebp(page, png, budget) {
  const dataUrl = 'data:image/png;base64,' + png.toString('base64');
  for (let q = 0.8; q >= 0.3; q -= 0.08) {
    const out = await page.evaluate(async ([src, quality]) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      return [c.toDataURL('image/webp', quality), img.width, img.height];
    }, [dataUrl, q]);
    const buf = Buffer.from(out[0].split(',')[1], 'base64');
    if (buf.length <= budget || q - 0.08 < 0.3) return { buf, w: out[1], h: out[2], q };
  }
}

const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });
const manifest = [];
try {
  const enc = await browser.newPage(); // reused for canvas encoding
  for (const prof of PROFILES) {
    for (const site of SITES) {
      // Pre-measure page height at DPR 1, then pick the largest DPR (≤ prof.dpr)
      // that keeps the capture under the texture-height cap — whole page always wins.
      const probe = await browser.newPage({ viewport: prof.viewport });
      await probe.goto(`http://localhost:${PORT}${site.url}`, { waitUntil: 'networkidle', timeout: 45000 });
      const fullH = await probe.evaluate(() => document.documentElement.scrollHeight);
      await probe.close();
      const dpr = Math.min(prof.dpr, Math.max(1, Math.floor((MAX_DEVICE_H / fullH) * 20) / 20));
      const page = await browser.newPage({ viewport: prof.viewport, deviceScaleFactor: dpr });
      await page.goto(`http://localhost:${PORT}${site.url}`, { waitUntil: 'networkidle', timeout: 45000 });
      await page.evaluate(() => document.fonts.ready);
      const fontsOk = await page.evaluate(() =>
        [...document.fonts].length === 0 || [...document.fonts].some(f => f.status === 'loaded'));
      if (!fontsOk) throw new Error(`${site.id}: webfonts failed to load — aborting (check network/proxy)`);
      await page.addStyleTag({ content:
        '.concept-banner{display:none!important}*{animation:none!important;transition:none!important}html{scroll-behavior:auto!important}' });
      await page.waitForTimeout(400);
      const png = await page.screenshot({ fullPage: true, type: 'png' });
      await page.close();
      const { buf, w, h, q } = await toWebp(enc, png, prof.budget);
      const file = `${site.id}-${prof.tag}.webp`;
      writeFileSync(path.join(OUT, file), buf);
      manifest.push({ file, w, h, kb: Math.round(buf.length / 1024), q: q.toFixed(2) });
      console.log(`${file}  ${w}x${h}  ${Math.round(buf.length / 1024)}KB  q=${q.toFixed(2)}`);
    }
  }
  // Verminord logo PNGs → WebP (originals untouched)
  for (const [src, out] of [['logo-dark.png', 'verminord-dark.webp'], ['logo-white.png', 'verminord-white.webp']]) {
    const png = readFileSync(path.join(ROOT, 'images', 'verminord', src));
    const { buf, w, h, q } = await toWebp(enc, png, 60 * 1024);
    writeFileSync(path.join(OUT, out), buf);
    manifest.push({ file: out, w, h, kb: Math.round(buf.length / 1024), q: q.toFixed(2) });
    console.log(`${out}  ${w}x${h}  ${Math.round(buf.length / 1024)}KB  q=${q.toFixed(2)}`);
  }
  // og:image — 1200x630 social card rendered with the site's own fonts
  {
    const og = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await og.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle', timeout: 45000 });
    await og.evaluate(() => document.fonts.ready);
    await og.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend',
        '<div style="position:fixed;inset:0;z-index:99999;background:#F5F3EE;display:flex;flex-direction:column;justify-content:center;padding:0 90px;box-sizing:border-box;font-family:\'Schibsted Grotesk\',sans-serif;color:#14171A">' +
        '<div style="width:56px;height:4px;background:#1F4E43;margin-bottom:36px"></div>' +
        '<div style="font-weight:900;font-size:92px;letter-spacing:-.05em;line-height:.95">Design levert på<br>halve tiden, <em style="font-family:\'Instrument Serif\',serif;font-weight:400;color:#1F4E43">halve prisen.</em></div>' +
        '<div style="margin-top:40px;font-size:24px;color:rgba(20,23,26,.62)">Folkestad<b style="color:#1F4E43">.</b>&ensp;·&ensp;Nettside, merkevare og trykk — Jæren</div></div>');
    });
    await og.waitForTimeout(600);
    const jpg = await og.screenshot({ type: 'jpeg', quality: 88 });
    writeFileSync(path.join(ROOT, 'images', 'og.jpg'), jpg);
    console.log(`og.jpg  1200x630  ${Math.round(jpg.length / 1024)}KB`);
    await og.close();
  }
  writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('\nDone →', OUT);
} finally {
  await browser.close();
  server.kill();
}
