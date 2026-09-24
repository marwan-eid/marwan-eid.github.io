import { useEffect, useState } from 'preact/hooks';

// Step-through model of MilkRun's per-van ReorderBuffer: a priority queue keyed
// by device timestamp, flushed once an event is older than the grace window.
// Anything older than the last flushed event goes to the dead-letter queue.

type Ev = { d: number; late?: boolean };
type Frame = { t: number; arrived: Ev | null; buffer: number[]; out: number[]; dlq: number[]; note: string };

const GRACE = 2;
const ARRIVALS: (Ev | null)[] = [{ d: 1 }, { d: 2 }, { d: 4 }, { d: 3 }, { d: 5 }, { d: 7 }, { d: 6 }, { d: 8 }, { d: 4, late: true }, null];

function simulate(): Frame[] {
  const frames: Frame[] = [{ t: 0, arrived: null, buffer: [], out: [], dlq: [], note: 'Events will arrive out of order, as they do over cellular networks.' }];
  let buffer: number[] = [];
  const out: number[] = [];
  const dlq: number[] = [];
  let lastFlushed = 0;
  ARRIVALS.forEach((ev, i) => {
    const t = i + 1;
    let note = '';
    if (ev && ev.d < lastFlushed) {
      dlq.push(ev.d);
      note = `Event #${ev.d} is older than the last emitted event (#${lastFlushed}), so it's too late to reorder. It goes to the DLQ for audit.`;
    } else if (ev) {
      buffer = [...buffer, ev.d].sort((a, b) => a - b);
    }
    const flushed: number[] = [];
    while (buffer.length && buffer[0] <= t - GRACE) {
      const d = buffer.shift()!;
      lastFlushed = d;
      out.push(d);
      flushed.push(d);
    }
    if (!note) {
      const arrivedTxt = ev ? `#${ev.d} arrives${i > 0 && ARRIVALS[i - 1] && ev.d < (ARRIVALS[i - 1] as Ev).d ? ' (behind #' + (ARRIVALS[i - 1] as Ev).d + ')' : ''}` : 'No new arrivals';
      const flushTxt = flushed.length ? `#${flushed.join(', #')} ${flushed.length > 1 ? 'are' : 'is'} past the ${GRACE}s grace window, so emitted in order.` : 'Nothing is old enough to emit yet; the buffer waits.';
      note = `${arrivedTxt}. ${flushTxt}`;
    }
    frames.push({ t, arrived: ev, buffer: [...buffer], out: [...out], dlq: [...dlq], note });
  });
  return frames;
}

const FRAMES = simulate();

function Chip({ d, tone }: { d: number; tone: 'in' | 'buf' | 'out' | 'dlq' }) {
  const cls = {
    in: 'border-fg/40 bg-surface text-fg',
    buf: 'border-accent/50 bg-accent-soft text-fg',
    out: 'border-live/50 bg-live/10 text-fg',
    dlq: 'border-danger/50 bg-danger/10 text-danger',
  }[tone];
  return <span class={`inline-grid h-8 min-w-8 place-items-center rounded-md border px-1.5 font-mono text-[0.8rem] tabular-nums ${cls}`}>#{d}</span>;
}

export default function ReorderBufferDemo() {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const f = FRAMES[i];

  useEffect(() => {
    if (!playing) return;
    if (i >= FRAMES.length - 1) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setI(i + 1), 1500);
    return () => window.clearTimeout(t);
  }, [playing, i]);

  const lanes: { label: string; sub: string; items: number[]; tone: 'in' | 'buf' | 'out' | 'dlq' }[] = [
    { label: 'Arrived', sub: 'network order', items: f.arrived ? [f.arrived.d] : [], tone: 'in' },
    { label: 'Reorder buffer', sub: 'min-heap by device time', items: f.buffer, tone: 'buf' },
    { label: 'Emitted', sub: 'to ETA engine', items: f.out, tone: 'out' },
    { label: 'Dead-letter queue', sub: 'late events', items: f.dlq, tone: 'dlq' },
  ];

  return (
    <div class="not-prose card my-8 overflow-hidden">
      <div class="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <span class="eyebrow">Try it: reorder buffer</span>
        <span class="font-mono text-[0.68rem] text-faint">
          t = {f.t}s · grace = {GRACE}s
        </span>
      </div>
      <div class="font-mono text-[0.7rem] text-faint">
        <div class="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2.5">
          <span class="mr-1">arrival order:</span>
          {ARRIVALS.filter(Boolean).map((e, k) => (
            <span key={k} class={`rounded px-1 tabular-nums ${k === i - 1 ? 'bg-fg text-bg' : k < i ? 'text-muted' : ''} ${(e as Ev).late ? 'text-danger' : ''}`}>
              #{(e as Ev).d}
            </span>
          ))}
        </div>
      </div>
      <div class="divide-y divide-line">
        {lanes.map((l) => (
          <div key={l.label} class="grid grid-cols-[8.5rem_1fr] items-center gap-3 px-4 py-2.5 sm:grid-cols-[11rem_1fr]">
            <div>
              <div class="text-[0.82rem] font-medium text-fg">{l.label}</div>
              <div class="font-mono text-[0.64rem] text-faint">{l.sub}</div>
            </div>
            <div class="flex min-h-8 flex-wrap gap-1.5">
              {l.items.map((d, k) => (
                <Chip key={`${d}-${k}`} d={d} tone={l.tone} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div class="grid gap-3 border-t border-line p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <p class="min-h-[2.5rem] text-sm leading-relaxed text-muted" aria-live="polite">
          {f.note}
        </p>
        <div class="flex items-center gap-1.5">
          <button type="button" class="diagram-btn" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0} aria-label="Previous step">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            class="diagram-btn diagram-btn-primary"
            onClick={() => {
              if (i >= FRAMES.length - 1) setI(0);
              setPlaying(!playing);
            }}
          >
            {playing ? 'Pause' : i >= FRAMES.length - 1 ? 'Replay' : 'Play'}
          </button>
          <button type="button" class="diagram-btn" onClick={() => setI(Math.min(FRAMES.length - 1, i + 1))} disabled={i >= FRAMES.length - 1} aria-label="Next step">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
