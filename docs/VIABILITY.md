# Viability memo

Independent concept by Ayo Ahmed for the Senior Product Manager role at Gearset. Not affiliated with Gearset. Date: 2026-10-07.

The role page given to me (`/careers/openings/senior-product-manager-remote-united-kingdom/`) returned 404 on 2026-10-07. This memo quotes the archived copy captured on 2026-01-16 (see [SOURCES.md](SOURCES.md)). The role may have changed or closed.

## 1. Why this problem, for this company

Gearset's public positioning already covers comparison and deployment, dependency awareness, code review gates and Agentforce metadata. The opportunity is not a new engine. It is a **product decision surface** for a growing kind of change: AI-assisted Salesforce work that looks finished sooner than it is. Gearset's own writing on an agentic development lifecycle frames the same shift publicly.

If the hypothesis holds, the value is commercial as well as technical:
- **Retention and expansion:** release safety is a reason to stay on a DevOps platform as AI raises change volume.
- **New buyer:** security and platform owners care about access creep and audit trails, which are adjacent to release managers.
- **Positioning:** "ship AI-assisted changes with evidence" is a clear message for Agentforce adopters.

## 2. How the concept maps to the role (archived JD)

| JD expectation (quoted from the archived page) | How this project shows it |
|---|---|
| "deeply understanding the core job to be done" | [JTBD.md](JTBD.md) with forces and switching triggers; [FIVE_WHYS.md](FIVE_WHYS.md) |
| "Work closely with the engineering teams on defining slices, delivering them iteratively" | The desk itself models release slices, revisions and partial promotion; the build was scoped in slices (engine → evidence → compare → export) |
| "identifying, defining and measuring outcomes" | [METRICS.md](METRICS.md): north star, leading indicators, readiness measures with visible denominators, guardrails |
| "researching and validating possible solutions" | Testable assumptions with cheapest tests in [ASSUMPTIONS_RISKS.md](ASSUMPTIONS_RISKS.md); prototype success criteria |
| "Drive commercial outcomes … Ideal Customer Profile, key pains, value proposition and positioning" | Section 3 below |
| "taking decisions supported by evidence" | Product principle: no finding without evidence; memo records who decided and why |
| "Experience of working in the DevOps domain / Salesforce ecosystem" (great to have) | Uses real Salesforce metadata types (GenAiPlannerBundle, GenAiPlugin, GenAiFunction, GenAiPromptTemplate, permission sets, Flow, Apex) with fictional content |

I am not claiming prior Gearset, Salesforce or DevOps employment. This project is evidence of how I approach a problem, not of tenure.

## 3. Go-to-market sketch (hypothesis)

- **ICP:** Salesforce teams of 10+ admins and developers, already on a DevOps platform, starting Agentforce or heavy AI-assisted development, with a change-control or audit obligation (financial services, insurance, healthcare).
- **Key pains:** rollbacks after "works in sandbox"; access creep found in audits; review that depends on one experienced person.
- **Value proposition:** see what an AI-assisted slice is missing before promotion, ship the safe part, and keep a defensible record of every risk accepted.
- **Positioning:** for release managers promoting AI-assisted Salesforce changes, a release evidence desk that joins dependencies, data impact, access and test scenarios into one go/no-go decision, unlike diff-only review.
- **Packaging thought:** part of a pipeline or compliance tier rather than a standalone SKU; the memo and audit trail are the upgrade hook.
- **Launch success measures:** adoption by release managers on accounts with Agentforce metadata; escaped-defect rate on reviewed slices vs. unreviewed; override-rate within guardrails.

## 4. What would kill it

- Discovery shows AI-assisted failures are rare or mostly runtime logic errors that static rules cannot see.
- Existing platform checks already give reviewers this joined view, and the gap is training rather than product.
- Reviewers reject any non-overridable rule.

## 5. Next step if continuing

Ten release-manager interviews using the prompts in [JTBD.md](JTBD.md), then moderated tests on this prototype against the success criteria in [METRICS.md](METRICS.md).
