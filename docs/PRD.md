# PRD: Release Evidence Desk

Independent concept by Ayo Ahmed. Not affiliated with Gearset. Status: working synthetic prototype. Date: 2026-10-07.

## 1. Problem

Hypothesis: **an AI-assisted Salesforce change can pass a happy-path demo yet break a dependency or permission at release.**

AI assistance makes it cheaper to produce metadata (Agentforce topics, actions, prompt templates, Apex, Flows, permission sets). It does not make the change set more complete. The sandbox demo exercises one conversation with a privileged user, so the gaps that matter at release stay invisible:

- a component the change needs is not in the package and not in the target org;
- a field change destroys data that already exists;
- a permission set grants more than the feature needs;
- tests cover the happy path only, so refusal and access-denied paths are unverified.

Gearset's public material already positions dependency detection, code review gates and Agentforce metadata support as part of its platform (see [SOURCES.md](SOURCES.md)). This concept does not claim those features are missing or broken. It explores one product question: **what would a release reviewer need to see, in one place, to make a defensible go/no-go call on an AI-assisted slice, and how would we measure that it helps?**

## 2. Users

| User | Context | What they need from this desk |
|---|---|---|
| Release manager | Owns promotion to production; reviews many slices a week | A decision they can defend, protected blockers, a memo to attach to the change record |
| Salesforce admin / developer (author) | Built the change, often with AI help | To see exactly why it is held and what would unblock it |
| Security / platform owner | Signs off access changes | Every widening listed with who receives it, and a record of who accepted it |
| Engineering or CoE lead | Accountable for release health | Readiness measures that compare across slices and over time |

## 3. Goals and non-goals

Goals
1. Classify four release risks with deterministic, explainable rules.
2. Make every finding traceable to evidence in one click.
3. Protect hard blockers so they cannot be signed off; require a named reason for softer risks.
4. Show the change between two revisions of a slice.
5. Export a decision memo and a measurable readiness report.

Non-goals (for this prototype)
- Connecting to Salesforce, reading real metadata or executing deployments.
- Replacing a DevOps platform's comparison, deployment or static-analysis engines.
- Generating fixes. Revision 2 is pre-written.
- Any AI or model processing.

## 4. Scope and requirements

| ID | Requirement | Status |
|---|---|---|
| R1 | Load a seed release or import CSV/JSON with row-level validation | Done |
| R2 | Missing dependency: every `dependsOn` key must be in the slice (not deleted) or the target inventory. Blocker, never overridable | Done |
| R3 | Destructive field change: delete, type change, shorter length or removed picklist values. Blocker if populated records exist, else review | Done |
| R4 | Permission widening: any access increase is review; View All, Modify All and system permissions are blockers | Done |
| R5 | Incomplete tests: failing or unrun tests and Apex coverage below 75% are blockers; no tests is a blocker for AI-assisted changes, review for human ones; AI-assisted changes tested only on the happy path need review | Done |
| R6 | Status per change (ready / review / held), cascading holds to dependants; slice decision ready / ready with holdbacks / needs review / blocked; atomic slices block if anything is held | Done |
| R7 | Evidence chips open diff, dependency graph, permission table, test matrix or target inventory, with the relevant row highlighted | Done |
| R8 | Override form: reviewer name, reason ≥ 20 characters, recorded per slice revision, withdrawable, written to memo | Done |
| R9 | Compare any two slices: decision, gates, readiness measures, resolved / remaining / new findings | Done |
| R10 | Export decision memo (.md), readiness report (.json), change status (.csv) | Done |
| R11 | Reset to empty; state persists in localStorage until reset | Done |
| R12 | Plain labelling of synthetic data and absence of deployment | Done |
| R13 | Accessible at keyboard and screen reader level; readable at 1366, 820 and 390 px | Done; see [TEST_PLAN.md](TEST_PLAN.md) |

## 5. Key flows

1. **Unsafe to safe.** Seed → Agentforce rev 1 is Blocked (2 missing dependencies, Modify All, untested actions) → load rev 2 → blockers gone, 2 widenings need sign-off → sign off with reasons → Ready to promote → compare rev 1 vs rev 2.
2. **Protected holdback.** Case SLA slice → field deletion with 3,412 populated records is held → other 3 changes are deployable → decision "Ready with protected holdbacks" → memo lists deploy list and held items.
3. **Import.** Paste or upload CSV → validate (errors by line) → load → same checks.

## 6. Design principles

- **Evidence over verdicts.** No finding without a link to the thing that caused it.
- **Safe by default.** A rule that cannot be explained is not a rule. Missing dependencies, failing tests, low coverage and sharing-bypass permissions cannot be overridden.
- **Human judgment where it is genuinely a judgment.** Access increases and data-free destructive changes can be accepted, but only with a name and a reason.
- **Revision-scoped decisions.** A sign-off on revision 1 does not carry to revision 2.

## 7. Success criteria

See [METRICS.md](METRICS.md). The prototype is a success if, in moderated sessions with release managers, they (a) reach the correct decision on both seed slices without help, (b) can say why each blocker matters after one click, and (c) would attach the exported memo to a real change record.

## 8. Open questions

- Where do teams keep the "why we accepted this risk" record today, if anywhere?
- Is 20 characters the right floor for a reason, or should certain risks require a ticket link?
- Should "AI-assisted" be self-declared, inferred from commit metadata, or both?
- Which slice boundaries do teams actually use: user story, feature branch or pipeline stage?
