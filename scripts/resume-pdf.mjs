// Prints /resume to public/marwan-eid-resume.pdf, so the PDF never drifts
// from the site. Run against a local build:
//   npm run build && npm run preview -- --port 3000
//   node scripts/resume-pdf.mjs http://localhost:3000
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:3000';
const out = new URL('../public/marwan-eid-resume.pdf', import.meta.url);

const browser = await chromium.launch();
const page = await browser.newPage({ colorScheme: 'light' });
await page.goto(`${base}/resume`, { waitUntil: 'networkidle' });
await page.emulateMedia({ media: 'print', colorScheme: 'light' });
await page.pdf({
  path: out.pathname.replace(/^\/([A-Z]:)/, '$1'),
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
});
await browser.close();
console.log(`wrote ${out.pathname}`);
