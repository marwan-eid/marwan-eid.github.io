# marwan-eid.github.io

My personal site: case studies, resume, and a live view of [MilkRun](https://github.com/marwan-eid/MilkRun), my real-time fleet-tracking pipeline.

**→ [marwan-eid.github.io](https://marwan-eid.github.io)**

## What's interesting here

- **Live system on the homepage.** The hero map subscribes to MilkRun's Server-Sent Events stream and its health endpoint: 50 vans moving across Amsterdam, with an event counter and uptime ticking in real time. If the stream is unreachable, it plays a 3-minute recording of real pipeline output and labels it `REPLAY`, never passing a recording off as live.
- **Interactive architecture diagrams.** One small engine ([`Diagram.tsx`](src/components/Diagram.tsx)) renders every diagram from a declarative spec ([`diagrams.ts`](src/data/diagrams.ts)): click components for details or play a step-by-step walkthrough.
- **Explainers you can poke.** A Bloom filter using the same double-hashing scheme as MilkRun (fill it until false positives appear), a step-through reorder buffer, and a latency comparison that plays back in real time.
- **One source of truth.** [`profile.ts`](src/data/profile.ts) feeds the home page, `/about`, `/resume`, and the resume PDF, which is printed from the `/resume` page itself.
- **Build-time social cards.** Every page gets its own Open Graph image, rendered with Satori and resvg during the build.

## Stack and decisions

| | |
|---|---|
| Framework | **Astro** (static output) with **Preact** islands. Pages ship zero JS unless they have something interactive, and islands cost ~4 KB of runtime instead of React's ~45 KB. |
| Styling | **Tailwind CSS v4** plus CSS custom properties for light/dark theme tokens; theme resolved before first paint (no flash). |
| Content | **MDX** case studies in a typed content collection. |
| Hosting | **GitHub Pages**, deployed by GitHub Actions: free, fast, and no server to keep alive. |
| Quality gates | `astro check` (TypeScript strict) and a **Lighthouse CI** budget on every push. |

## Develop

```bash
npm install
npm run dev            # http://localhost:4321
npm run build && npm run preview -- --port 3000
```

Previewing on port 3000 lets the live widget connect, because MilkRun's CORS allow-list includes `localhost:3000`.

### Scripts

| Command | What it does |
|---|---|
| `npm run photo` | Crops and grades the source portrait into `src/assets/` |
| `npm run replay` | Rebuilds `public/data/milkrun-replay.json` from a raw SSE capture in `scripts/data/` |
| `npm run resume:pdf` | Prints `/resume` to `public/marwan-eid-resume.pdf` (needs a preview server on :3000) |
| `npm run shots -- / /work/milkrun` | Screenshots pages in both themes at desktop and mobile widths |
