// Visual check: screenshots pages in both themes at desktop and mobile widths.
//   npm run preview -- --port 3000   (in another terminal)
//   node scripts/screenshot.mjs http://localhost:3000 / /work/milkrun
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base = 'http://localhost:3000', ...paths] = process.argv.slice(2);
const targets = paths.length ? paths : ['/'];
const outDir = process.env.SHOT_DIR ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];
const themes = (process.env.THEMES ?? 'dark,light').split(',');
const full = process.env.FULL !== '0';
const wait = Number(process.env.WAIT ?? 3500);

const browser = await chromium.launch();
for (const vp of viewports.filter((v) => !process.env.VP || v.name === process.env.VP)) {
  for (const theme of themes) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      colorScheme: theme,
    });
    const page = await ctx.newPage();
    page.on('console', (m) => m.type() === 'error' && console.log(`  [console] ${m.text()}`));
    page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));
    for (const p of targets) {
      await page.goto(base + p, { waitUntil: 'networkidle' }).catch(() => {});
      await page.waitForTimeout(wait);
      const file = `${outDir}/${p === '/' ? 'home' : p.replace(/^\//, '').replace(/\//g, '_')}-${vp.name}-${theme}.png`;
      await page.screenshot({ path: file, fullPage: full });
      console.log(file);
    }
    await ctx.close();
  }
}
await browser.close();
