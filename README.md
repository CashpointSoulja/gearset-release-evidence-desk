# Release Evidence Desk

**Independent concept by Ayo Ahmed. Not affiliated with Gearset.** All data is synthetic. Nothing connects to Salesforce and nothing is deployed.

- Live demo: see [Status](#status)
- Walkthrough video: see [Status](#status)
- Product docs: [`docs/`](docs/)

## In 30 seconds

Teams now ship Salesforce changes that were partly drafted by AI. The demo works, so the change looks done. The release then fails because an Apex class was never added, a permission set quietly grants Modify All, or nobody tested what happens when the agent should say no.

Release Evidence Desk reads a release slice and runs four fixed checks: missing dependencies, destructive field changes, permission widening and incomplete tests. Each finding links to the exact diff, graph edge, permission row or test behind it. Hard blockers are protected and cannot be waved through. Softer risks need a named reviewer and a written reason. The result exports as a deployment decision memo and a measurable readiness report.

**Why a customer would care:** fewer failed or rolled-back releases, no surprise data loss or access creep, and an audit-ready reason for every go/no-go call.

## ELI5

You built a Lego model from instructions a robot helper wrote. It looks right on your desk. Before you carry it to the big table, someone checks: are all the pieces it needs actually in the box? Did you pull off a piece other people were using? Did you give it a key to every room? Did anyone try knocking it over? If a piece is missing, it stays on your desk. If it's only a small worry, a grown-up writes down why it's OK. Then you get a note saying exactly what goes to the big table and what stays behind.

## What you can do in the demo

1. **Load the seed release** (or import a small CSV/JSON change set; format in [`docs/IMPORT_FORMAT.md`](docs/IMPORT_FORMAT.md)).
2. **See the checks**. The AI-assisted *Agentforce case-triage agent* (revision 1) is **Blocked**: two missing dependencies, a Modify All grant, and only happy-path tests.
3. **Click any evidence chip** to open the metadata diff, dependency graph, permission table, test matrix or target inventory behind that finding.
4. **Load revision 2** (a pre-written fixture, not generated). It adds the missing Apex service and field, narrows access to Read, and adds negative and permission tests. Blockers clear; two permission widenings remain for sign-off.
5. **Sign off** each remaining widening with your name and a reason of at least 20 characters. The slice becomes **Ready to promote**.
6. **Compare slices** to see revision 1 and 2 side by side: gates, readiness measures and which findings were resolved.
7. **Open the Case SLA slice**: three changes are ready, but deleting a field with 3,412 populated records is a **protected holdback**. It stays out of the package unless someone signs off.
8. **Export** a decision memo (`.md`), readiness report (`.json`) or change status (`.csv`).
9. **Reset** clears everything, including saved browser state.

## What is synthetic

Everything: the company (Harbourline Insurance), people, metadata, record counts, target inventory and test results. Revision 2 is written in advance and shipped as a fixture. There is no AI or model processing in the app. The checks are deterministic TypeScript rules in [`src/engine/checks.ts`](src/engine/checks.ts).

## Run it

```bash
npm ci
npm run dev        # local dev server
npm test           # unit tests (Vitest)
npm run lint
npm run build      # type-check and production build to dist/
```

Node 20 is used for development and CI.

## Docs

| Doc | What it covers |
|---|---|
| [PRD](docs/PRD.md) | Problem, users, scope, requirements, non-goals |
| [JTBD](docs/JTBD.md) | Jobs, forces, switching triggers |
| [Five Whys](docs/FIVE_WHYS.md) | Root cause of "passed the demo, failed the release" |
| [Metrics](docs/METRICS.md) | North star, readiness measures, event taxonomy, success criteria |
| [Assumptions and risks](docs/ASSUMPTIONS_RISKS.md) | What must be true, how to test it, what could go wrong |
| [Viability memo](docs/VIABILITY.md) | Commercial case and fit with the Senior PM role |
| [Test plan and results](docs/TEST_PLAN.md) | Unit, build, visual and interaction evidence |
| [v2 roadmap](docs/ROADMAP.md) | What would come next and in what order |
| [Sources](docs/SOURCES.md) | Every public URL used, with date checked |
| [Design](docs/DESIGN.md) and [brand guide](docs/brand/brand-guide.html) | Visual research done before implementation |
| [Import format](docs/IMPORT_FORMAT.md) | CSV and JSON change-set format |
| [Video](docs/VIDEO.md) | Walkthrough script and how it was recorded |

## Status

See [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md) for current results. Hosting status is recorded in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Credit and ownership

Concept, product thinking and build by Ayo Ahmed. Gearset, its logo and product names belong to their owner and appear only to show the concept in context. Salesforce and Agentforce are trademarks of Salesforce, Inc. Inter and Cousine are used under the SIL Open Font License.
