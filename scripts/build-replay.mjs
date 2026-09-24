// Turns a raw SSE capture from the MilkRun demo into a compact replay file.
// The live widget falls back to this when the demo can't be reached.
//
//   curl -N -m 180 https://marwan-milkrun.duckdns.org/api/stream/vans > scripts/data/stream-capture.txt
//   curl https://marwan-milkrun.duckdns.org/api/vans > scripts/data/vans-snapshot.json
//   curl https://marwan-milkrun.duckdns.org/api/observability/health > scripts/data/health.json
//   node scripts/build-replay.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const dir = new URL('./data/', import.meta.url);
const raw = readFileSync(new URL('stream-capture.txt', dir), 'utf8');
const snapshot = JSON.parse(readFileSync(new URL('vans-snapshot.json', dir), 'utf8'));
const health = JSON.parse(readFileSync(new URL('health.json', dir), 'utf8'));

const round = (n) => Math.round(n * 1e5) / 1e5;
const compact = (v) => ({
  id: v.van_id,
  lat: round(v.location.latitude),
  lng: round(v.location.longitude),
  status: v.status,
  risk: v.sla_risk,
  zone: v.geofence_name ?? null,
  stop: v.current_stop_index,
  stops: v.total_stops,
  eta: v.eta_next_stop_seconds,
});

const events = raw
  .split(/\r?\n/)
  .filter((l) => l.startsWith('data:'))
  .map((l) => JSON.parse(l.slice(5)))
  .map((v) => ({ ts: Date.parse(v.last_updated), ...compact(v) }))
  .sort((a, b) => a.ts - b.ts);

const t0 = events[0].ts;
const replay = {
  recordedAt: new Date(t0).toISOString(),
  durationMs: events.at(-1).ts - t0,
  health: {
    uptimeSeconds: health.uptime_seconds,
    checked: health.pipeline.dedup_total_checked,
    rejected: health.pipeline.dedup_rejected,
    activeVans: health.pipeline.active_vans,
  },
  initial: snapshot.map(compact),
  events: events.map(({ ts, ...e }) => ({ t: ts - t0, ...e })),
};

mkdirSync(new URL('../public/data/', import.meta.url), { recursive: true });
const out = new URL('../public/data/milkrun-replay.json', import.meta.url);
writeFileSync(out, JSON.stringify(replay));
console.log(`replay: ${replay.initial.length} vans, ${replay.events.length} events, ${(replay.durationMs / 1000).toFixed(0)} s → ${out.pathname}`);
