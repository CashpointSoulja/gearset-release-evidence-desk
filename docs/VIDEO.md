# Walkthrough video

- File: `docs/video/release-evidence-desk-walkthrough.mp4` (1920×1080, 30 fps, H.264 + AAC, 85.8 s)
- Subtitles: burned into the picture, and also as [`walkthrough.srt`](video/walkthrough.srt)
- Public link: see [DEPLOYMENT.md](DEPLOYMENT.md)

## How it was made

1. The production build (`npm run build`) was served locally and opened in a desktop browser window at 1280×720 CSS pixels (rendered at 1.5× for a 1920×1080 frame).
2. A script clicked through the real app while capturing timestamped frames. Every state on screen is the working app reacting to those clicks; nothing is mocked or redrawn. The blue dot is the pointer position; it turns yellow on each click.
3. Each subtitle phrase has its own synthesised voice clip (a stock British English voice; no voice cloning). Each scene waits for its narration before the next click, and captions are timed to the clips.
4. No zooms or cuts: the camera is the browser window, and movement is page scrolling.

The video was recorded from the local production build because the public demo URL was not yet live (see [DEPLOYMENT.md](DEPLOYMENT.md)). It is the same `dist/` bundle the Pages workflow deploys.

## Script and timing

| Start | Scene | Narration (as captioned) |
|---|---|---|
| 00:00 | intro | This is Release Evidence Desk, an independent concept by Ayo Ahmed. |
| 00:04 | intro | Everything here is synthetic. Nothing connects to Salesforce, and nothing is deployed. |
| 00:10 | load | I load the seed release, and four fixed checks run in the browser. |
| 00:14 | blocked | The AI-assisted Agentforce agent passed its demo, but it's blocked. |
| 00:17 | blocked | It needs an Apex class and a field that aren't in the slice, or in the target org. |
| 00:22 | graph | Every finding opens its evidence. The graph shows both missing pieces in red. |
| 00:27 | perm | It also grants Modify All on Case, which bypasses sharing. That's a protected blocker. |
| 00:33 | rev2 | Revision two is a pre-written fix. It adds the missing pieces, narrows access to Read, and adds refusal and permission tests. |
| 00:41 | rev2 | The blockers clear. Two access increases still need a human. |
| 00:45 | signoff | I sign each one off with a name and a reason. Both go into the memo. |
| 00:49 | signoff | Short reasons are refused, and blockers can't be signed off at all. |
| 00:53 | signoff | Each sign-off belongs to this revision only, so it never carries over to a later one. |
| 00:58 | ready | The slice is now ready to promote. |
| 01:00 | compare | Compare puts revision one beside revision two, gate by gate. |
| 01:04 | sla | Now a blocked exception. This human-authored slice deletes a field holding 3,412 records. |
| 01:11 | sla | That change is held back, while the other three can still ship. |
| 01:15 | export | Finally, I export the decision memo: what ships, what's held, and who accepted which risk. |
| 01:20 | close | It records a review decision, with evidence. It never runs a deployment. |

## On-screen actions per scene

| Scene | Action |
|---|---|
| intro | Empty state |
| load | Click "Load seed release" |
| blocked | Agentforce rev 1 decision: Blocked |
| graph | Click "Dependency graph" on the first finding |
| perm | Click "Permission impact" on the Modify All finding |
| rev2 | Click "Load revision 2 and re-check" |
| signoff | Open sign-off form twice, type reviewer and reason, record |
| ready | Decision: Ready to promote |
| compare | Click "Compare slices" |
| sla | Open Case SLA slice; click "Metadata diff" on the deletion |
| export | Click "Export decision", download memo, scroll memo preview |
| close | Review log |
