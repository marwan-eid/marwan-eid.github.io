import { useEffect, useRef, useState } from 'preact/hooks';

// Live view of the MilkRun demo: 50 simulated delivery vans in Amsterdam,
// streamed from Kafka → Spring WebFlux → Server-Sent Events → this canvas.
// When the stream can't be reached (offline, CORS, demo down) it plays a
// recording of real pipeline output instead, and says so.

type VanStatus = 'EN_ROUTE' | 'DELIVERING' | 'RETURNING' | 'RETURNED' | string;

type Update = {
  id: string;
  lat: number;
  lng: number;
  status: VanStatus;
  risk: string;
  zone: string | null;
  stop?: number;
  stops?: number;
  eta?: number;
  ts?: number;
};

type Replay = {
  recordedAt: string;
  durationMs: number;
  health: { uptimeSeconds: number; checked: number; rejected: number; activeVans: number };
  checkedPerSec?: number;
  initial: Update[];
  events: (Update & { t: number })[];
};

type Mode = 'connecting' | 'live' | 'replay';

type Props = {
  api: string;
  replayUrl: string;
  variant?: 'hero' | 'full';
};

type Van = {
  id: string;
  lat: number;
  lng: number;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  t0: number;
  trail: [number, number][];
  status: VanStatus;
  zone: string | null;
  pingAt: number;
};

// Geofence zones seeded in MilkRun's PostGIS schema (infra/postgres/init.sql).
const ZONES = [
  { name: 'Vondelpark Construction', lng: [4.865, 4.875], lat: [52.358, 52.362] },
  { name: 'Central Station Traffic', lng: [4.895, 4.905], lat: [52.377, 52.381] },
  { name: 'De Pijp School Zone', lng: [4.89, 4.898], lat: [52.35, 52.354] },
  { name: 'Jordaan Narrow Streets', lng: [4.878, 4.887], lat: [52.37, 52.374] },
];

const BOUNDS = { lat: [52.312, 52.398], lng: [4.83, 4.94] };
const CENTER = { lat: (BOUNDS.lat[0] + BOUNDS.lat[1]) / 2, lng: (BOUNDS.lng[0] + BOUNDS.lng[1]) / 2 };
const KM_LAT = 111.32;
const KM_LNG = 111.32 * Math.cos((CENTER.lat * Math.PI) / 180);
const TWEEN_MS = 1400;
const PING_MS = 1600;
const TRAIL = 10;
const FALLBACK_RATE = 86.5; // events/s measured on the demo, used only while replaying

const fromApi = (v: any): Update => ({
  id: v.van_id,
  lat: v.location.latitude,
  lng: v.location.longitude,
  status: v.status,
  risk: v.sla_risk,
  zone: v.geofence_name ?? null,
  stop: v.current_stop_index,
  stops: v.total_stops,
  eta: v.eta_next_stop_seconds,
  ts: Date.parse(v.last_updated),
});

const fmtInt = (n: number) => Math.floor(n).toLocaleString('en-US');

function fmtUptime(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d}d ${p(h)}h ${p(m)}m ${p(s)}s`;
}

function fmtClock(ts: number) {
  return new Date(ts).toLocaleTimeString('en-GB', { timeZone: 'Europe/Amsterdam', hour12: false });
}

const STATUS_LABEL: Record<string, string> = {
  EN_ROUTE: 'en route',
  DELIVERING: 'delivering',
  RETURNING: 'returning',
  RETURNED: 'returned',
};

export default function LiveFleet({ api, replayUrl, variant = 'hero' }: Props) {
  const dashboardUrl = `${api}/`;
  const full = variant === 'full';
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const checkedRef = useRef<HTMLSpanElement>(null);
  const uptimeRef = useRef<HTMLSpanElement>(null);

  const [mode, setMode] = useState<Mode>('connecting');
  const [recordedAt, setRecordedAt] = useState<string | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [vanCount, setVanCount] = useState<number | null>(null);
  const [log, setLog] = useState<Update[]>([]);

  // Mutable simulation state lives in refs so the canvas can run at 60fps
  // without re-rendering the component.
  const vans = useRef(new Map<string, Van>());
  const counters = useRef({ checked: 0, uptime: 0, at: 0, rate: 0 });
  const colors = useRef<Record<string, string>>({});
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      for (const k of ['fg', 'muted', 'faint', 'line', 'line-strong', 'grid', 'accent', 'live', 'warn', 'surface']) {
        colors.current[k] = cs.getPropertyValue(`--${k}`).trim();
      }
    };
    readColors();
    window.addEventListener('themechange', readColors);
    return () => window.removeEventListener('themechange', readColors);
  }, []);

  // ─── Data sources ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;
    let healthTimer: number | undefined;
    let replayTimer: number | undefined;
    let erroredSince = 0;

    const seed = (list: Update[]) => {
      const now = performance.now();
      vans.current.clear();
      for (const u of list) {
        vans.current.set(u.id, {
          id: u.id,
          lat: u.lat,
          lng: u.lng,
          fromLat: u.lat,
          fromLng: u.lng,
          toLat: u.lat,
          toLng: u.lng,
          t0: now - TWEEN_MS,
          trail: [[u.lat, u.lng]],
          status: u.status,
          zone: u.zone,
          pingAt: -Infinity,
        });
      }
      setVanCount(list.length);
    };

    const apply = (u: Update) => {
      const now = performance.now();
      const v = vans.current.get(u.id);
      if (!v) {
        vans.current.set(u.id, {
          id: u.id,
          lat: u.lat,
          lng: u.lng,
          fromLat: u.lat,
          fromLng: u.lng,
          toLat: u.lat,
          toLng: u.lng,
          t0: now,
          trail: [[u.lat, u.lng]],
          status: u.status,
          zone: u.zone,
          pingAt: now,
        });
        setVanCount(vans.current.size);
      } else {
        v.fromLat = v.lat;
        v.fromLng = v.lng;
        v.toLat = u.lat;
        v.toLng = u.lng;
        v.t0 = now;
        v.status = u.status;
        v.zone = u.zone;
        v.pingAt = now;
        v.trail.push([u.lat, u.lng]);
        if (v.trail.length > TRAIL) v.trail.shift();
      }
      setLog((l) => [u, ...l].slice(0, full ? 6 : 3));
    };

    const pollHealth = async () => {
      try {
        const res = await fetch(`${api}/api/observability/health`, { cache: 'no-store' });
        if (!res.ok) return;
        const h = await res.json();
        const c = counters.current;
        const now = performance.now();
        const checked = h.pipeline.dedup_total_checked as number;
        if (c.at && checked > c.checked) {
          c.rate = (checked - c.checked) / ((now - c.at) / 1000);
          setRate(c.rate);
        }
        c.checked = checked;
        c.uptime = h.uptime_seconds;
        c.at = now;
      } catch {
        /* keep extrapolating from the last good sample */
      }
    };

    const startReplay = async () => {
      if (cancelled) return;
      es?.close();
      window.clearInterval(healthTimer);
      try {
        const data: Replay = await (await fetch(replayUrl)).json();
        if (cancelled) return;
        setMode('replay');
        setRecordedAt(data.recordedAt);
        const r = data.checkedPerSec ?? FALLBACK_RATE;
        setRate(r);
        const recordedMs = Date.parse(data.recordedAt);

        const loop = () => {
          seed(data.initial);
          setLog([]);
          const start = performance.now();
          counters.current = { checked: data.health.checked, uptime: data.health.uptimeSeconds, at: start, rate: r };
          let i = 0;
          const tick = () => {
            if (cancelled) return;
            const elapsed = performance.now() - start;
            while (i < data.events.length && data.events[i].t <= elapsed) {
              const e = data.events[i++];
              apply({ ...e, ts: recordedMs + e.t });
            }
            replayTimer = window.setTimeout(i < data.events.length ? tick : loop, i < data.events.length ? 100 : 3000);
          };
          tick();
        };
        loop();
      } catch {
        setMode('replay');
      }
    };

    const startLive = async () => {
      const ctrl = new AbortController();
      const timeout = window.setTimeout(() => ctrl.abort(), 4500);
      try {
        const res = await fetch(`${api}/api/vans`, { signal: ctrl.signal, cache: 'no-store' });
        window.clearTimeout(timeout);
        if (!res.ok) throw new Error(String(res.status));
        const list = ((await res.json()) as any[]).map(fromApi);
        if (cancelled) return;
        seed(list);
        await pollHealth();
        // A second sample soon after the first gives an events/s rate quickly.
        window.setTimeout(pollHealth, 3000);
        healthTimer = window.setInterval(pollHealth, 10_000);

        es = new EventSource(`${api}/api/stream/vans`);
        es.addEventListener('van-update', (e) => {
          erroredSince = 0;
          apply(fromApi(JSON.parse((e as MessageEvent).data)));
        });
        es.onopen = () => {
          erroredSince = 0;
          setMode('live');
        };
        es.onerror = () => {
          // EventSource retries on its own; give up only if it stays down.
          if (!erroredSince) erroredSince = Date.now();
          if (es?.readyState === EventSource.CLOSED || Date.now() - erroredSince > 12_000) startReplay();
        };
        setMode('live');
      } catch {
        window.clearTimeout(timeout);
        startReplay();
      }
    };

    startLive();
    return () => {
      cancelled = true;
      es?.close();
      window.clearInterval(healthTimer);
      window.clearTimeout(replayTimer);
    };
  }, [api, replayUrl, full]);

  // ─── Rendering ──────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext('2d')!;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let visible = true;
    let lastCounterPaint = 0;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };

    const project = () => {
      const spanX = (BOUNDS.lng[1] - BOUNDS.lng[0]) * KM_LNG;
      const spanY = (BOUNDS.lat[1] - BOUNDS.lat[0]) * KM_LAT;
      const pad = 18;
      const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY); // px per km
      return {
        scale,
        x: (lng: number) => w / 2 + (lng - CENTER.lng) * KM_LNG * scale,
        y: (lat: number) => h / 2 - (lat - CENTER.lat) * KM_LAT * scale,
      };
    };

    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const statusColor = (s: VanStatus) => {
      const c = colors.current;
      if (s === 'DELIVERING') return c.live;
      if (s === 'RETURNING' || s === 'RETURNED') return c.faint;
      return c.accent;
    };

    const draw = (now: number) => {
      const c = colors.current;
      const p = project();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // 1 km grid
      ctx.strokeStyle = c.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const stepPx = p.scale;
      for (let x = (w / 2) % stepPx; x < w; x += stepPx) {
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, h);
      }
      for (let y = (h / 2) % stepPx; y < h; y += stepPx) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(w, Math.round(y) + 0.5);
      }
      ctx.stroke();

      // Geofence zones
      ctx.font = `500 ${full ? 10 : 9}px "Geist Mono Variable", ui-monospace, monospace`;
      for (const z of ZONES) {
        const x0 = p.x(z.lng[0]);
        const x1 = p.x(z.lng[1]);
        const y0 = p.y(z.lat[1]);
        const y1 = p.y(z.lat[0]);
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = c.warn;
        ctx.globalAlpha = 0.55;
        ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = c.warn;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
        if (full) {
          ctx.fillStyle = c.faint;
          ctx.fillText(z.name, x1 + 5, y0 + 8);
        }
      }

      // Trails
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const v of vans.current.values()) {
        const t = reduced.current ? 1 : Math.min(1, (now - v.t0) / TWEEN_MS);
        const k = ease(t);
        v.lat = v.fromLat + (v.toLat - v.fromLat) * k;
        v.lng = v.fromLng + (v.toLng - v.fromLng) * k;
        if (v.trail.length < 2) continue;
        const col = statusColor(v.status);
        for (let i = 1; i < v.trail.length; i++) {
          const last = i === v.trail.length - 1;
          const [aLat, aLng] = v.trail[i - 1];
          const [bLat, bLng] = last ? [v.lat, v.lng] : v.trail[i];
          ctx.globalAlpha = 0.08 + (0.45 * i) / v.trail.length;
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.moveTo(p.x(aLng), p.y(aLat));
          ctx.lineTo(p.x(bLng), p.y(bLat));
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      // Pings + vans
      for (const v of vans.current.values()) {
        const x = p.x(v.lng);
        const y = p.y(v.lat);
        const col = statusColor(v.status);
        const age = now - v.pingAt;
        if (age < PING_MS && !reduced.current) {
          const q = age / PING_MS;
          ctx.globalAlpha = (1 - q) * 0.7;
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.arc(x, y, 3 + q * (full ? 22 : 16), 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = c.surface;
        ctx.beginPath();
        ctx.arc(x, y, full ? 4.5 : 3.75, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x, y, full ? 3 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Scale bar + coordinates
      ctx.fillStyle = c.faint;
      ctx.strokeStyle = c.faint;
      ctx.font = `500 9px "Geist Mono Variable", ui-monospace, monospace`;
      const bx = 14;
      const by = h - 14;
      ctx.beginPath();
      ctx.moveTo(bx, by - 4);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx + p.scale, by);
      ctx.lineTo(bx + p.scale, by - 4);
      ctx.stroke();
      ctx.fillText('1 km', bx + p.scale + 6, by + 1);
      const label = `${CENTER.lat.toFixed(3)}°N ${CENTER.lng.toFixed(3)}°E`;
      ctx.fillText(label, w - ctx.measureText(label).width - 14, by + 1);

      // Counters (DOM, throttled)
      if (now - lastCounterPaint > 90) {
        lastCounterPaint = now;
        const cnt = counters.current;
        if (cnt.at) {
          const dt = (now - cnt.at) / 1000;
          if (checkedRef.current) checkedRef.current.textContent = fmtInt(cnt.checked + cnt.rate * dt);
          if (uptimeRef.current) uptimeRef.current.textContent = fmtUptime(cnt.uptime + dt);
        }
      }
    };

    const frame = (now: number) => {
      draw(now);
      raf = visible && !document.hidden ? requestAnimationFrame(frame) : 0;
    };
    const kick = () => {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
    };

    resize();
    const ro = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    ro.observe(wrap);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      kick();
    });
    io.observe(wrap);
    document.addEventListener('visibilitychange', kick);
    kick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', kick);
    };
  }, [full]);

  const badge =
    mode === 'live' ? 'Live' : mode === 'replay' ? 'Replay' : 'Connecting';
  const recorded = recordedAt
    ? new Date(recordedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  return (
    <figure class="not-prose card overflow-hidden" aria-label="Live map of the MilkRun delivery fleet">
      <div class="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <div class="flex min-w-0 items-center gap-2.5 font-mono text-[0.72rem]">
          <span class="live-dot shrink-0" data-state={mode} aria-hidden="true" />
          <span class="font-semibold tracking-wider text-fg uppercase">{badge}</span>
          <span class="truncate text-faint">milkrun · amsterdam</span>
        </div>
        <span class="shrink-0 font-mono text-[0.72rem] text-faint">
          {vanCount ?? '—'} vans · {rate ? `${Math.round(rate)} ev/s` : '— ev/s'}
        </span>
      </div>

      <div ref={wrapRef} class={`relative w-full ${full ? 'aspect-[4/3] sm:aspect-[16/10]' : 'aspect-[5/4]'}`}>
        <canvas ref={canvasRef} class="absolute inset-0" aria-hidden="true" />
        {mode === 'connecting' && (
          <div class="absolute inset-0 grid place-items-center font-mono text-xs text-faint">connecting to stream…</div>
        )}
      </div>

      <div class="grid grid-cols-2 border-t border-line font-mono">
        <div class="border-r border-line px-4 py-3">
          <div class="text-[0.65rem] tracking-wider text-faint uppercase">Events processed</div>
          <div class="mt-1 text-[0.95rem] text-fg tabular-nums">
            <span ref={checkedRef}>—</span>
          </div>
        </div>
        <div class="px-4 py-3">
          <div class="text-[0.65rem] tracking-wider text-faint uppercase">Pipeline uptime</div>
          <div class="mt-1 text-[0.95rem] text-fg tabular-nums">
            <span ref={uptimeRef}>—</span>
          </div>
        </div>
      </div>

      <ol
        class={`border-t border-line px-4 py-2.5 font-mono text-[0.68rem] leading-5 text-faint ${full ? 'h-[8.5rem]' : 'h-[4.25rem]'} overflow-hidden`}
        aria-live="off"
      >
        {log.length === 0 && <li>waiting for events…</li>}
        {log.map((e, i) => (
          <li key={`${e.id}-${e.ts}-${i}`} class={`flex gap-3 truncate ${i === 0 ? 'text-muted' : ''}`}>
            <span class="tabular-nums">{e.ts ? fmtClock(e.ts) : ''}</span>
            <span class="text-fg/80">{e.id}</span>
            <span>{STATUS_LABEL[e.status] ?? e.status.toLowerCase()}</span>
            {e.zone && <span class="hidden truncate text-warn sm:inline">{e.zone}</span>}
            {!e.zone && e.stop != null && (
              <span class="hidden sm:inline">
                stop {e.stop}/{e.stops}
              </span>
            )}
          </li>
        ))}
      </ol>

      {/* Always rendered, with a fixed height, so switching modes never shifts the layout. */}
      <figcaption class="flex h-9 items-center justify-between gap-3 border-t border-line bg-elev px-4 text-[0.72rem] text-muted">
        <span class="truncate">
          {mode === 'replay'
            ? `Live feed offline · replaying a real recording from ${recorded}`
            : mode === 'live'
              ? 'Streaming live from the MilkRun demo server'
              : 'Connecting to the MilkRun demo server…'}
        </span>
        <a href={dashboardUrl} class="shrink-0 hover:text-fg">
          Full dashboard ↗
        </a>
      </figcaption>
    </figure>
  );
}
