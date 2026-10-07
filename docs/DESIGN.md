# Design: Gearset Release Evidence Desk

Independent concept by Ayo Ahmed. Not affiliated with Gearset.

Brand research was done on the public site on 2026-10-07, before any app code was written. Reference captures sit in `docs/brand/` and the visual guide is `docs/brand/brand-guide.html`.

## What was inspected
| Source | What I took from it |
|---|---|
| https://gearset.com/ (desktop 1366px and mobile 390px) | Logo, nav, hero, buttons, product UI frame |
| https://gearset.com/assets/site-DNisi_EU.css, index-CUJtXxfw.css, navigation-BdOYcwKz.css | Font stacks, colour frequency, radii |
| https://gearset.com/solutions/agentforce/ | Agentforce metadata types and the "catch missing dependencies before you deploy" positioning |
| https://gearset.com/solutions/deploy/, /solutions/code-reviews/, /solutions/org-intelligence/ | Compare & deploy, code review gates, dependency visibility language |

## Logo
- Use the literal inline SVG from the gearset.com nav (`viewBox="0 0 1200 271.6"`), saved unchanged as `public/brand/gearset-logo.svg`.
- Its colours are wordmark navy `#232e54`, plus `#e2673d` orange, `#14a0dc` blue and `#ffb945` amber in the gear mark.
- It always sits top-left on a white bar, as on gearset.com. It never goes on navy, because the navy wordmark would disappear there.
- The label "Independent concept by Ayo Ahmed. Not affiliated with Gearset." always sits right next to the logo.

## Typography
- **Inter** is Gearset's site font (self-hosted there, 100–900). This app self-hosts Inter from `@fontsource/inter` (SIL OFL 1.1).
- **Cousine** is Gearset's monospace (used for code on the site). The app uses it for API names, diffs and metadata paths, via `@fontsource/cousine`.
- Hero headings on the site are Inter 700–800 in navy `#00305d`. Product UI text is Inter 400–600 at 13–15px.

## Colour (ranked by frequency in the live CSS)
| Token | Hex | Use on gearset.com | Use here |
|---|---|---|---|
| navy | `#00305d` | Headings, primary dark button, text | Headings, decision text |
| navy-deep | `#002446` | Dark sections | Product app bar gradient end |
| blue | `#1275d9` | Links, product primary buttons | Primary buttons, links, focus ring |
| yellow | `#ffd35c` | Hero background, trial CTA | Page accent band, "active" markers |
| amber | `#ffb945` | Logo, highlights | "Needs review" chips |
| green | `#3db088` | Success | "Ready" / pass |
| red | `#c75c5c` | Error | "Blocked" / fail |
| slate | `#656c79` | Body secondary | Secondary text |
| line | `#cbcfda` | Borders | Borders, graph edges |
| paper | `#f7f7f7` | Section background | Board background |
| ink | `#0a0a0a` | Body | Body text (with navy for headings) |

## UI treatment, mirrored from Gearset's product frame on the homepage
- A white marketing-style nav bar with the logo, then a **navy gradient product bar** carrying a small uppercase section label (the homepage product frame says "BUILD"; this app says "RELEASE REVIEW").
- A **light grey board** with white cards, radius 8px, 1px `#e3e6ee` border and very soft shadows. Lane titles are 13px semibold with a muted count.
- **Small outlined blue buttons** (radius 4px, 1px `#1275d9`) for secondary actions; a filled blue button for the primary action, top-right of each panel.
- Status chips are small and use an icon plus a label ("⚠ Ready for review" style), coloured amber, green or red.
- Marketing CTAs on the site are uppercase pills (9999px radius). This app keeps the pill for the single yellow "Export decision memo" CTA only, so the product surface still reads as product UI.

## Layout
- Desktop (≥1100px): three zones. Slice and change list on the left, findings in the centre, an evidence panel (diff, dependency graph, permissions, tests) sticky on the right.
- Tablet (820px): two columns, with evidence below the findings.
- Phone (390px): a single column; the tabs scroll horizontally and the evidence panel opens inline under the clicked finding.

## Accessibility
- All controls are native buttons, inputs or selects with visible labels and a `#1275d9` 2px focus ring.
- Colour is never the only signal: each chip carries a text label and an icon.
- Contrast: navy and ink on white pass AA. Amber chips use dark text `#5c3b00` on `#fff1d6`.

## Honesty in the UI
- A permanent banner reads: "Synthetic data. No Salesforce connection. Nothing is deployed."
- Remediation is a pre-written synthetic revision, labelled as such; there is no AI processing in this app.
