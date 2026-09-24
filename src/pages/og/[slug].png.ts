// Build-time Open Graph images: one 1200×630 card per page, rendered with
// Satori (layout → SVG) and resvg (SVG → PNG). No runtime, no external service.
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Card = { kicker: string; title: string; metrics?: { value: string; label: string }[] };

const root = process.cwd();
const font = (pkg: string, file: string) => readFileSync(resolve(root, 'node_modules/@fontsource', pkg, 'files', file));
const fonts = [
  { name: 'Geist', data: font('geist', 'geist-latin-400-normal.woff'), weight: 400 as const, style: 'normal' as const },
  { name: 'Geist', data: font('geist', 'geist-latin-600-normal.woff'), weight: 600 as const, style: 'normal' as const },
  { name: 'Geist Mono', data: font('geist-mono', 'geist-mono-latin-500-normal.woff'), weight: 500 as const, style: 'normal' as const },
];
const avatar = `data:image/jpeg;base64,${readFileSync(resolve(root, 'src/assets/avatar.jpg')).toString('base64')}`;

const C = { bg: '#0a0a0b', fg: '#ededef', muted: '#a1a1aa', faint: '#7c7c86', line: '#232327', accent: '#ff8a4c' };

// Minimal hyperscript for Satori's element format.
const h = (type: string, style: Record<string, unknown>, ...children: unknown[]) => ({
  type,
  props: { style, children: children.length === 1 ? children[0] : children },
});

function card({ kicker, title, metrics = [] }: Card) {
  return h(
    'div',
    {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '64px 72px',
      background: C.bg,
      backgroundImage: `linear-gradient(${C.line} 1px, transparent 1px), linear-gradient(90deg, ${C.line} 1px, transparent 1px)`,
      backgroundSize: '48px 48px',
      fontFamily: 'Geist',
      color: C.fg,
    },
    h(
      'div',
      { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
      h(
        'div',
        { display: 'flex', alignItems: 'center', gap: '18px' },
        { type: 'img', props: { src: avatar, width: 64, height: 64, style: { borderRadius: 999, border: `2px solid ${C.line}` } } },
        h(
          'div',
          { display: 'flex', flexDirection: 'column' },
          h('div', { fontSize: 26, fontWeight: 600 }, 'Marwan Eid'),
          h('div', { fontSize: 20, color: C.faint }, 'Software Engineer · Valeo'),
        ),
      ),
      h('div', { fontFamily: 'Geist Mono', fontSize: 20, color: C.faint }, 'marwan-eid.github.io'),
    ),
    h(
      'div',
      { display: 'flex', flexDirection: 'column', gap: '20px', background: C.bg, padding: '8px 0' },
      h('div', { fontFamily: 'Geist Mono', fontSize: 22, color: C.accent, letterSpacing: '0.08em', textTransform: 'uppercase' }, kicker),
      h('div', { fontSize: title.length > 40 ? 62 : 72, fontWeight: 600, lineHeight: 1.05, letterSpacing: '-0.035em', maxWidth: 1000 }, title),
    ),
    h(
      'div',
      { display: 'flex', gap: '56px', background: C.bg, paddingTop: '8px' },
      ...metrics.slice(0, 3).map((m) =>
        h(
          'div',
          { display: 'flex', flexDirection: 'column' },
          h('div', { fontFamily: 'Geist Mono', fontSize: 34, fontWeight: 500 }, m.value),
          h('div', { fontSize: 20, color: C.faint }, m.label),
        ),
      ),
    ),
  );
}

export const getStaticPaths = (async () => {
  const work = await getCollection('work');
  const pages: { slug: string; card: Card }[] = [
    {
      slug: 'home',
      card: {
        kicker: 'Backend & full-stack engineer',
        title: 'I build real-time backends that hold up.',
        metrics: [
          { value: '10 s → 1 s', label: 'API latency' },
          { value: 'hours → <10 min', label: 'deploys' },
          { value: '75k+ LOC', label: 'migrated to web' },
        ],
      },
    },
    { slug: 'work', card: { kicker: 'Case studies', title: 'Problems, decisions, and what happened next.' } },
    { slug: 'about', card: { kicker: 'About', title: 'Engineer at Valeo. AUC Computer Engineering. Competition mathematician.' } },
    { slug: 'resume', card: { kicker: 'Resume', title: 'Software Engineer · Backend & Full-Stack' } },
    { slug: 'hire', card: { kicker: 'Freelance', title: 'Backends that are fast, reliable, and boring to operate.' } },
    ...work.map((w) => ({ slug: `work-${w.id}`, card: { kicker: w.data.kicker, title: w.data.title, metrics: w.data.metrics } })),
  ];
  return pages.map((p) => ({ params: { slug: p.slug }, props: { card: p.card } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const svg = await satori(card((props as { card: Card }).card) as never, { width: 1200, height: 630, fonts });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
