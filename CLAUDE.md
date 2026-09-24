## Project notes

Personal site for Marwan Eid, built with Astro 7 + Preact islands + Tailwind v4, deployed to GitHub Pages (`marwan-eid.github.io`) by `.github/workflows/deploy.yml` on push to `main`.

- Personal data lives in `src/data/profile.ts`; diagram specs in `src/data/diagrams.ts`; case studies in `src/content/work/*.mdx`.
- Case studies must only state facts backed by the resume, public repos, or measured data. Don't invent metrics.
- After changing `/resume` or `profile.ts`, regenerate the PDF: `npm run build && npm run preview -- --port 3000`, then `npm run resume:pdf`.
- Run `npm run check` before committing.

## Development

Start the dev server in background mode: `astro dev --background` (manage with `astro dev stop|status|logs`).

Docs: https://docs.astro.build
