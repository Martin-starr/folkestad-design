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
await browser.close();
