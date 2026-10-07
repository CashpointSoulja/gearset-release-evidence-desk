# Walkthrough video

- File: `docs/video/release-evidence-desk-walkthrough.mp4` (1920×1080, 30 fps, H.264 + AAC, 89.8 s)
- Subtitles: burned into the picture, and also as [`walkthrough.srt`](video/walkthrough.srt)
- Public link: see [DEPLOYMENT.md](DEPLOYMENT.md)

## How it was made

Re-recorded on 2026-10-07 after the protected-blocker and revision-bound sign-off fixes. The earlier cut narrated Modify All as protected while the build still allowed it to be signed off; that cut is replaced.


1. The production build (`npm run build`) was served locally and opened in a desktop browser window at 1280×720 CSS pixels (rendered at 1.5× for a 1920×1080 frame).
2. A script clicked through the real app while capturing timestamped frames. Every state on screen is the working app reacting to those clicks; nothing is mocked or redrawn. The blue dot is the pointer position; it turns yellow on each click.
3. Each subtitle phrase has its own synthesised voice clip (a stock British English voice; no voice cloning). Each scene waits for its narration before the next click, and captions are timed to the clips.
4. No zooms or cuts: the camera is the browser window, and movement is page scrolling.

The video was recorded from the local production build after the protected-blocker and revision-bound sign-off fixes. The same production source is now live on Cloudflare Pages; links and access status are in [DEPLOYMENT.md](DEPLOYMENT.md).

## Script and timing

| Start | Scene | Narration (as captioned) |
|---|---|---|
| 00:00 | intro | This is Release Evidence Desk, an independent concept by Ayo Ahmed. |
| 00:04 | intro | Everything here is synthetic. Nothing connects to Salesforce, and nothing is deployed. |
| 00:10 | load | I load the seed release, and four fixed checks run in the browser. |
| 00:14 | blocked | The AI-assisted Agentforce agent passed its demo, but it's blocked. |
| 00:17 | blocked | It needs an Apex class and a field that aren't in the slice, or in the target org. |
| 00:22 | graph | Every finding opens its evidence. The graph shows both missing pieces in red. |
| 00:27 | perm | It also grants Modify All on Case, which bypasses sharing. |
| 00:31 | perm | That's protected. There's no sign-off button, only a fix. |
| 00:35 | rev2 | Revision two is a pre-written fix. It adds the missing pieces, narrows access to Read, and adds refusal and permission tests. |
| 00:43 | rev2 | The blockers clear. Two access increases still need a human. |
| 00:47 | signoff | I sign off each access increase with a name and a reason. |
| 00:51 | signoff | A short reason is refused. |
| 00:53 | signoff | Each sign-off is bound to this exact revision. Change the slice, and it drops. |
| 01:01 | ready | The slice is now ready to promote. |
| 01:03 | compare | Compare puts revision one beside revision two, gate by gate. |
| 01:07 | sla | Now a blocked exception. This human-authored slice deletes a field holding 3,412 records. |
| 01:14 | sla | That deletion is protected. It can't be signed off, so it's held back while the other three changes ship. |
| 01:20 | export | Finally, I export the decision memo: what ships, what's held back, and who signed off. |
| 01:26 | close | It records a decision with evidence. It never deploys. |

## On-screen actions per scene

| Scene | Action |
|---|---|
| intro | Empty state |
| load | Click "Load seed release" |
| blocked | Agentforce rev 1 decision: Blocked |
| graph | Click "Dependency graph" on the first finding |
| perm | Click "Permission impact" on the Modify All finding; scroll to its "Protected: cannot be signed off" note (no sign-off button) |
| rev2 | Click "Load revision 2 and re-check" |
| signoff | Open the first sign-off form, type a 10-character reason, record: refused. Replace with a valid reason, record. Repeat for the second widening |
| ready | Decision: Ready to promote |
| compare | Click "Compare slices" |
| sla | Open Case SLA slice; click "Metadata diff" on the deletion; scroll to its protected note |
| export | Click "Export decision", download memo, scroll memo preview |
| close | Review log |
