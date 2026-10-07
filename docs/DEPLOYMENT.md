# Deployment

## Status (2026-10-07)

The demo is live on Cloudflare Pages, on the free plan:

https://gearset-release-evidence-desk-live.pages.dev/

The public source repository is:

https://github.com/CashpointSoulja/gearset-release-evidence-desk

The revised, voiced walkthrough is on Drive with anyone-with-link reader access:

https://drive.google.com/file/d/1zyH9ZqmfaNTr8L_WFCxHkp7Tr954abB4/view?usp=drivesdk&authuser=ayomideahmedcp%40gmail.com

The working demo and Drive playback were inspected on 2026-10-07. The app has no sign-in flow and uses only synthetic data. Drive sharing permissions were read back as anyone-with-link reader. Signed-out Drive playback has not yet been checked separately.

## Build

The app is a static build with no server, login, API, secrets or environment variables. Its release checks run in the browser. It does not connect to or deploy Salesforce changes.

- Build command: `npm ci && npm run build`
- Output directory: `dist`
- Node version: 20
- Production source: `main`

The Cloudflare Pages project is Git-backed. The older unsuffixed empty project is not the live demo; use the URL above.
