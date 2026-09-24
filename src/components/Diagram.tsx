import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

// A small declarative engine for interactive architecture diagrams.
// Each diagram is a spec (nodes, edges, steps); visitors can click components
// for details or play the walkthrough to see a request move through the system.

export type DiagramNode = {
  id: string;
  label: string;
  sub?: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  tone?: 'default' | 'accent' | 'store' | 'external' | 'muted';
  detail: string;
};

export type DiagramEdge = {
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
  /** Force the side each end attaches to. */
  fromSide?: Side;
  toSide?: Side;
};

export type DiagramStep = {
  title: string;
  text: string;
  nodes: string[];
  edges?: string[]; // "from>to"
};

type Side = 'l' | 'r' | 't' | 'b';

type Props = {
  title: string;
  width: number;
  height: number;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  steps: DiagramStep[];
  groups?: { label: string; x: number; y: number; w: number; h: number }[];
};

const W = 150;
const H = 54;

function anchor(n: DiagramNode, side: Side): [number, number] {
  const w = n.w ?? W;
  const h = n.h ?? H;
  switch (side) {
    case 'l':
      return [n.x, n.y + h / 2];
    case 'r':
      return [n.x + w, n.y + h / 2];
    case 't':
      return [n.x + w / 2, n.y];
    case 'b':
      return [n.x + w / 2, n.y + h];
  }
}

function autoSides(a: DiagramNode, b: DiagramNode): [Side, Side] {
  const aw = a.w ?? W;
  const ah = a.h ?? H;
  const bw = b.w ?? W;
  const bh = b.h ?? H;
  const dx = b.x + bw / 2 - (a.x + aw / 2);
  const dy = b.y + bh / 2 - (a.y + ah / 2);
  const horizontalGap = Math.max(b.x - (a.x + aw), a.x - (b.x + bw));
  if (horizontalGap > 10 && Math.abs(dx) >= Math.abs(dy) * 0.6) return dx > 0 ? ['r', 'l'] : ['l', 'r'];
  return dy > 0 ? ['b', 't'] : ['t', 'b'];
}

const NORMAL: Record<Side, [number, number]> = { l: [-1, 0], r: [1, 0], t: [0, -1], b: [0, 1] };

// Cubic curve whose control points leave each box along the side's normal,
// so any side-to-side combination (including bottom→bottom) looks right.
function edgeGeometry(a: DiagramNode, b: DiagramNode, e: DiagramEdge) {
  const [autoA, autoB] = autoSides(a, b);
  const sa = e.fromSide ?? autoA;
  const sb = e.toSide ?? autoB;
  const [x1, y1] = anchor(a, sa);
  const [x2, y2] = anchor(b, sb);
  const k = Math.max(28, Math.min(110, Math.hypot(x2 - x1, y2 - y1) * 0.45));
  const c1 = [x1 + NORMAL[sa][0] * k, y1 + NORMAL[sa][1] * k];
  const c2 = [x2 + NORMAL[sb][0] * k, y2 + NORMAL[sb][1] * k];
  return {
    d: `M${x1},${y1} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${x2},${y2}`,
    // Point at t = 0.5 on the curve, for the label.
    mx: (x1 + 3 * c1[0] + 3 * c2[0] + x2) / 8,
    my: (y1 + 3 * c1[1] + 3 * c2[1] + y2) / 8,
  };
}

export default function Diagram({ title, width, height, nodes, edges, steps, groups = [] }: Props) {
  const [step, setStep] = useState(-1); // -1 = overview
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const reduced = useRef(false);
  const uid = useMemo(() => Math.random().toString(36).slice(2, 8), []);

  const byId = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);

  useEffect(() => {
    reduced.current = matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(
      () => {
        if (step >= steps.length - 1) {
          setPlaying(false);
          return;
        }
        setStep((s) => s + 1);
      },
      step < 0 ? 300 : 4200,
    );
    return () => window.clearTimeout(t);
  }, [playing, step, steps.length]);

  // Stop autoplay when scrolled away.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => !e.isIntersecting && setPlaying(false));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const current = step >= 0 ? steps[step] : null;
  const activeNodes = new Set(selected ? [selected] : (current?.nodes ?? []));
  const activeEdges = new Set(current && !selected ? (current.edges ?? []) : []);
  const dim = activeNodes.size > 0;

  const go = (s: number) => {
    setSelected(null);
    setStep(Math.max(-1, Math.min(steps.length - 1, s)));
  };

  const togglePlay = () => {
    setSelected(null);
    if (playing) setPlaying(false);
    else {
      if (step >= steps.length - 1) setStep(-1);
      setPlaying(true);
    }
  };

  const selNode = selected ? byId[selected] : null;

  return (
    <div ref={rootRef} class="not-prose card my-8 overflow-hidden">
      <div class="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <span class="eyebrow truncate">{title}</span>
        <span class="shrink-0 font-mono text-[0.68rem] text-faint">click a component · or press play</span>
      </div>

      <div class="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          class="block h-auto w-full min-w-[640px]"
          role="group"
          aria-label={title}
        >
          <defs>
            <marker id={`arrow-${uid}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--line-strong)" />
            </marker>
            <marker id={`arrow-on-${uid}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
            </marker>
          </defs>

          {groups.map((g) => (
            <g key={g.label}>
              <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="14" fill="none" stroke="var(--line-strong)" stroke-dasharray="4 5" />
              <text x={g.x + 14} y={g.y + 20} class="diagram-group">
                {g.label}
              </text>
            </g>
          ))}

          {edges.map((e) => {
            const a = byId[e.from];
            const b = byId[e.to];
            if (!a || !b) return null;
            const key = `${e.from}>${e.to}`;
            const on = activeEdges.has(key);
            const { d, mx, my } = edgeGeometry(a, b, e);
            const pathId = `p-${uid}-${e.from}-${e.to}`;
            return (
              <g key={key} opacity={dim && !on ? 0.35 : 1} style={{ transition: 'opacity .3s' }}>
                <path
                  id={pathId}
                  d={d}
                  fill="none"
                  stroke={on ? 'var(--accent)' : 'var(--line-strong)'}
                  stroke-width={on ? 1.75 : 1.25}
                  stroke-dasharray={e.dashed ? '4 4' : undefined}
                  marker-end={`url(#arrow${on ? '-on' : ''}-${uid})`}
                  class={on && !reduced.current ? 'diagram-flow' : ''}
                />
                {on && !reduced.current && (
                  <circle r="4" fill="var(--accent)">
                    <animateMotion dur="1.6s" repeatCount="indefinite" {...({ path: d } as Record<string, string>)} />
                  </circle>
                )}
                {e.label && (
                  <text class="diagram-edge-label" x={mx} y={my} dy="0.35em" text-anchor="middle">
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}

          {nodes.map((n) => {
            const w = n.w ?? W;
            const h = n.h ?? H;
            const on = activeNodes.has(n.id);
            const tone = n.tone ?? 'default';
            return (
              <g
                key={n.id}
                transform={`translate(${n.x},${n.y})`}
                class="diagram-node"
                data-tone={tone}
                data-on={on ? '' : undefined}
                opacity={dim && !on ? 0.4 : 1}
                style={{ transition: 'opacity .3s' }}
                tabIndex={0}
                role="button"
                aria-pressed={selected === n.id}
                onClick={() => {
                  setPlaying(false);
                  setSelected((s) => (s === n.id ? null : n.id));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setPlaying(false);
                    setSelected((s) => (s === n.id ? null : n.id));
                  }
                }}
              >
                <rect width={w} height={h} rx={tone === 'store' ? 10 : 10} class="diagram-box" />
                <text x={w / 2} y={n.sub ? h / 2 - 3 : h / 2 + 4} text-anchor="middle" class="diagram-label">
                  {n.label}
                </text>
                {n.sub && (
                  <text x={w / 2} y={h / 2 + 13} text-anchor="middle" class="diagram-sub">
                    {n.sub}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div class="grid gap-3 border-t border-line p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div class="min-h-[4.5rem]" aria-live="polite">
          {selNode ? (
            <>
              <p class="text-[0.95rem] font-medium text-fg">
                {selNode.label}
                {selNode.sub && <span class="ml-2 font-mono text-[0.72rem] font-normal text-faint">{selNode.sub}</span>}
              </p>
              <p class="mt-1 text-sm leading-relaxed text-muted">{selNode.detail}</p>
            </>
          ) : current ? (
            <>
              <p class="text-[0.95rem] font-medium text-fg">
                <span class="mr-2 font-mono text-[0.72rem] text-accent">
                  {String(step + 1).padStart(2, '0')}/{String(steps.length).padStart(2, '0')}
                </span>
                {current.title}
              </p>
              <p class="mt-1 text-sm leading-relaxed text-muted">{current.text}</p>
            </>
          ) : (
            <>
              <p class="text-[0.95rem] font-medium text-fg">Walkthrough: {steps.length} steps</p>
              <p class="mt-1 text-sm leading-relaxed text-muted">
                Press play to follow an event through the system, or click any component to see what it does and why it's there.
              </p>
            </>
          )}
        </div>
        <div class="flex items-center gap-1.5">
          <button type="button" class="diagram-btn" onClick={() => go(step - 1)} disabled={step < 0} aria-label="Previous step">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button type="button" class="diagram-btn diagram-btn-primary" onClick={togglePlay}>
            {playing ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M7 5v14l12-7z" />
              </svg>
            )}
            <span>{playing ? 'Pause' : step >= steps.length - 1 ? 'Replay' : 'Play'}</span>
          </button>
          <button
            type="button"
            class="diagram-btn"
            onClick={() => go(step + 1)}
            disabled={step >= steps.length - 1}
            aria-label="Next step"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
