// Kjøres i GitHub Actions: skarpe skjermbilder av verminord.no til showcasen
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

mkdirSync('images/showcase', { recursive: true });
const browser = await chromium.launch();

const shots = [
  { name: 'verminord-site-2880', width: 1440, height: 900, dsf: 2, fullPage: true },
  { name: 'verminord-site-hero-2880', width: 1440, height: 900, dsf: 2, fullPage: false },
  { name: 'verminord-site-mobil-1170', width: 390, height: 844, dsf: 3, fullPage: false },
];

for (const s of shots) {
  const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: s.dsf });
  const page = await ctx.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('https://www.verminord.no/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `images/showcase/${s.name}.png`, fullPage: s.fullPage });
  console.log(s.name, 'ok');
  await ctx.close();
}

// Gjenopprett prov.html fra forrige (beskyttede) deployment: ekte nettleser
// fullfører Vercel-SSO-redirecten, response.body() gir rå kildebytes.
const SHARE = 'https://lagd-hw36nrste-sahithewes-projects.vercel.app/prov.html?_vercel_share=mpa4dieRpm4213AMvosIejdVZx4EynjC';
const ctx2 = await browser.newContext();
const p2 = await ctx2.newPage();
const resp = await p2.goto(SHARE, { waitUntil: 'commit', timeout: 60000 });
const final = p2.url();
console.log('prov final url:', final, 'status:', resp && resp.status());
if (final.includes('lagd-hw36nrste') && !final.includes('sso') && resp && resp.ok()) {
  const body = await resp.body();
  const { writeFileSync } = await import('fs');
  writeFileSync('prov-recovered.html', body);
  console.log('prov.html recovered:', body.length, 'bytes');
} else {
  // redirect-kjede kan lande via mellomsteg — prøv en gang til når cookie er satt
  const resp2 = await p2.goto('https://lagd-hw36nrste-sahithewes-projects.vercel.app/prov.html', { waitUntil: 'commit', timeout: 60000 });
  console.log('second try url:', p2.url(), 'status:', resp2 && resp2.status());
  if (resp2 && resp2.ok() && p2.url().includes('lagd-hw36nrste')) {
    const body = await resp2.body();
    const { writeFileSync } = await import('fs');
    writeFileSync('prov-recovered.html', body);
    console.log('prov.html recovered on retry:', body.length, 'bytes');
  } else {
    console.log('RECOVERY FAILED — leaving no file');
  }
}
await ctx2.close();
await browser.close();
