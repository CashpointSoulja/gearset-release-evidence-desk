# Deployment

The app is a static build (`npm run build` → `dist/`) with relative asset paths, so it runs from any static host or sub-path with no server, login or API.

## Status (2026-10-07)

| Target | Status |
|---|---|
| Cloudflare (free plan) | Not available: no Cloudflare account is connected to this project's tooling, so nothing was deployed there. |
| GitHub Pages | Workflow in `.github/workflows/pages.yml` (lint, test, build, deploy on push to `main`). Needs the public repository to exist and Pages "Source" set to GitHub Actions. |

No live URL is claimed here until it opens signed out.

## Cloudflare Pages (if connected later)

- Build command: `npm ci && npm run build`
- Output directory: `dist`
- Node version: 20
- No environment variables or secrets are needed.
