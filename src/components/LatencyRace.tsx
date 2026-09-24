import { useEffect, useRef, useState } from 'preact/hooks';

// Plays the three production measurements back in real time, so the reader
// actually waits the 10 seconds a user used to wait.

const RUNS = [
  { label: 'Java on Lambda, cold', sub: 'where we started', ms: 10_000, tone: 'danger' },
  { label: 'Java + provisioned concurrency', sub: 'first fix: keep instances warm', ms: 2_000, tone: 'warn' },
  { label: 'Go rewrite', sub: 'fix the cause, not the symptom', ms: 1_000, tone: 'live' },
] as const;

const MAX = 10_000;

// Full class names so Tailwind can see them.
const TONE = {
  danger: { text: 'text-danger', bg: 'bg-danger' },
  warn: { text: 'text-warn', bg: 'bg-warn' },
  live: { text: 'text-live', bg: 'bg-live' },
} as const;

export default function LatencyRace() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const raf = useRef(0);

  const run = () => {
    cancelAnimationFrame(raf.current);
    setStarted(true);
    setRunning(true);
    const t0 = performance.now();
    const tick = (now: number) => {
      const e = Math.min(MAX, now - t0);
      setElapsed(e);
      if (e < MAX) raf.current = requestAnimationFrame(tick);
      else setRunning(false);
    };
    raf.current = requestAnimationFrame(tick);
  };

  // Start automatically the first time it scrolls into view.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setElapsed(MAX);
      setStarted(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          run();
          io.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <div ref={rootRef} class="not-prose card my-8 overflow-hidden">
      <div class="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <span class="eyebrow">Cold-path response time, played back in real time</span>
        <span class="font-mono text-[0.72rem] text-faint tabular-nums">{(elapsed / 1000).toFixed(1)} s</span>
      </div>
      <div class="space-y-4 p-4">
        {RUNS.map((r) => {
          const p = Math.min(1, elapsed / r.ms);
          const done = p >= 1;
          const width = (Math.min(elapsed, r.ms) / MAX) * 100;
          return (
            <div key={r.label}>
              <div class="mb-1.5 flex items-baseline justify-between gap-3">
                <div class="min-w-0">
                  <span class="text-[0.88rem] font-medium text-fg">{r.label}</span>
                  <span class="ml-2 hidden font-mono text-[0.68rem] text-faint sm:inline">{r.sub}</span>
                </div>
                <span class={`shrink-0 font-mono text-[0.8rem] tabular-nums ${done ? TONE[r.tone].text : 'text-faint'}`}>
                  {done ? `${r.ms / 1000} s ✓` : started ? `${(Math.min(elapsed, r.ms) / 1000).toFixed(1)} s` : '—'}
                </span>
              </div>
              <div class="relative h-2.5 overflow-hidden rounded-full bg-elev">
                <div class={`absolute inset-y-0 left-0 rounded-full ${TONE[r.tone].bg}`} style={{ width: `${width}%`, opacity: done ? 1 : 0.75 }} />
                <div class="absolute inset-y-0 border-l border-dashed border-line-strong" style={{ left: `${(r.ms / MAX) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div class="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
        <span class="text-[0.72rem] text-faint">Measured initial response latency in production. Bars are to scale.</span>
        <button type="button" class="diagram-btn shrink-0" onClick={run} disabled={running}>
          {running ? 'Running…' : 'Run again'}
        </button>
      </div>
    </div>
  );
}
