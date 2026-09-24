import { useRef, useState } from 'preact/hooks';

// A 64-bit, 3-hash version of MilkRun's dedup filter. Same hashing scheme:
// double hashing with Java's String.hashCode and FNV-1a, h(i) = h1 + i·h2 mod m.

const M = 64;
const K = 3;

function javaHash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

function fnv1a(s: string) {
  let h = 0x811c9dc5 | 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h;
}

function positions(key: string) {
  const h1 = javaHash(key);
  const h2 = fnv1a(key);
  const out: number[] = [];
  for (let i = 0; i < K; i++) out.push(Math.abs(((h1 + Math.imul(i, h2)) | 0) % M));
  return out;
}

type Verdict = 'new' | 'duplicate' | 'false-positive';
type Check = { key: string; pos: number[]; verdict: Verdict };

export default function BloomFilterDemo() {
  const [bits, setBits] = useState<boolean[]>(() => Array(M).fill(false));
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [seq, setSeq] = useState(1042);
  const [last, setLast] = useState<Check | null>(null);
  const [stats, setStats] = useState({ accepted: 0, dupes: 0, fp: 0 });
  const busy = useRef(false);

  const check = (key: string, b: boolean[], s: Set<string>) => {
    const pos = positions(key);
    const allSet = pos.every((p) => b[p]);
    const verdict: Verdict = allSet ? (s.has(key) ? 'duplicate' : 'false-positive') : 'new';
    return { key, pos, verdict };
  };

  const send = (key: string, b = bits, s = seen) => {
    const c = check(key, b, s);
    const nb = b.slice();
    const ns = new Set(s);
    if (c.verdict === 'new') {
      c.pos.forEach((p) => (nb[p] = true));
      ns.add(key);
    }
    setBits(nb);
    setSeen(ns);
    setLast(c);
    setStats((st) => ({
      accepted: st.accepted + (c.verdict === 'new' ? 1 : 0),
      dupes: st.dupes + (c.verdict === 'duplicate' ? 1 : 0),
      fp: st.fp + (c.verdict === 'false-positive' ? 1 : 0),
    }));
    return { nb, ns };
  };

  const sendNext = () => {
    send(`van-07:${seq}`);
    setSeq(seq + 1);
  };

  const retry = () => {
    if (seq === 1042) return;
    send(`van-07:${seq - 1}`);
  };

  const burst = async () => {
    if (busy.current) return;
    busy.current = true;
    let b = bits;
    let s = seen;
    let q = seq;
    for (let i = 0; i < 12; i++) {
      const r = send(`van-07:${q}`, b, s);
      b = r.nb;
      s = r.ns;
      q++;
      setSeq(q);
      await new Promise((res) => setTimeout(res, 140));
    }
    busy.current = false;
  };

  const reset = () => {
    setBits(Array(M).fill(false));
    setSeen(new Set());
    setSeq(1042);
    setLast(null);
    setStats({ accepted: 0, dupes: 0, fp: 0 });
  };

  const n = seen.size;
  const fill = bits.filter(Boolean).length / M;
  const fpRate = Math.pow(1 - Math.exp((-K * n) / M), K);

  const verdictUi: Record<Verdict, { label: string; cls: string }> = {
    new: { label: 'new event → accepted, bits set', cls: 'text-live' },
    duplicate: { label: 'all bits set → duplicate rejected', cls: 'text-warn' },
    'false-positive': { label: 'all bits set, but never seen → false positive, dropped', cls: 'text-danger' },
  };

  return (
    <div class="not-prose card my-8 overflow-hidden">
      <div class="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <span class="eyebrow">Try it: Bloom filter dedup</span>
        <span class="font-mono text-[0.68rem] text-faint">
          m = {M} bits · k = {K} hashes
        </span>
      </div>

      <div class="p-4">
        <div class="grid grid-cols-16 gap-1" role="img" aria-label={`Bit array, ${Math.round(fill * 100)}% of bits set`}>
          {bits.map((on, i) => {
            const hit = last?.pos.includes(i);
            return (
              <div
                key={i}
                class={`aspect-square rounded-[3px] border transition-colors duration-300 ${
                  on ? 'border-accent/60 bg-accent/80' : 'border-line bg-elev'
                } ${hit ? 'ring-2 ring-fg ring-offset-1 ring-offset-surface' : ''}`}
              />
            );
          })}
        </div>

        <div class="mt-4 min-h-[2.75rem] font-mono text-[0.78rem]" aria-live="polite">
          {last ? (
            <>
              <div class="text-fg">
                check("{last.key}") → bits [{last.pos.join(', ')}]
              </div>
              <div class={verdictUi[last.verdict].cls}>{verdictUi[last.verdict].label}</div>
            </>
          ) : (
            <div class="text-faint">Send an event. Its key is hashed to {K} bit positions.</div>
          )}
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <button type="button" class="diagram-btn diagram-btn-primary" onClick={sendNext}>
            Send new event
          </button>
          <button type="button" class="diagram-btn" onClick={retry} disabled={seq === 1042}>
            Retry last (duplicate)
          </button>
          <button type="button" class="diagram-btn" onClick={burst}>
            Send 12 more
          </button>
          <button type="button" class="diagram-btn" onClick={reset}>
            Reset
          </button>
        </div>
      </div>

      <dl class="grid grid-cols-2 border-t border-line font-mono text-[0.72rem] sm:grid-cols-4">
        {[
          ['Bits set', `${Math.round(fill * 100)}%`],
          ['False-positive odds', `${(fpRate * 100).toFixed(fpRate < 0.1 ? 1 : 0)}%`],
          ['Duplicates caught', String(stats.dupes)],
          ['Real events dropped', String(stats.fp)],
        ].map(([k, v], i) => (
          <div key={k} class={`px-4 py-3 ${i % 2 === 0 ? 'border-r border-line' : 'sm:border-r'} ${i < 2 ? 'border-b border-line sm:border-b-0' : ''} ${i === 3 ? 'sm:border-r-0' : ''}`}>
            <dt class="text-[0.62rem] tracking-wider text-faint uppercase">{k}</dt>
            <dd class={`mt-1 text-[0.95rem] tabular-nums ${k === 'Real events dropped' && stats.fp > 0 ? 'text-danger' : 'text-fg'}`}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
