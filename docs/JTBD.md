# Jobs to be done

Hypotheses for validation, not research findings. Independent concept by Ayo Ahmed.

## Core job

**When** an AI-assisted Salesforce change is ready to promote and its demo works,
**I want to** know whether it is complete, safe for existing data and no more privileged than it needs to be,
**so I can** promote it confidently or hold back exactly the risky part, and defend that call later.

## Related jobs

| Who | Job statement |
|---|---|
| Release manager | When several slices are queued for a release window, help me ship the safe ones without being blocked by one bad change. |
| Author | When my change is held back, tell me the specific missing piece so I can fix it without a meeting. |
| Security owner | When access changes, show me who gets what and make someone accountable for accepting it. |
| CoE lead | When leadership asks whether AI-assisted development is making releases riskier, give me numbers, not anecdotes. |

## Forces of progress

| Push (current pain) | Pull (new solution) |
|---|---|
| Rollbacks and hotfixes after "it worked in the sandbox" | One screen with the decision and its evidence |
| Access creep found in audits months later | Every widening named and signed off at release |
| Review is a meeting and a spreadsheet | A memo generated from the same checks |
| AI output volume outpaces reviewer attention | Fixed rules that scale with volume |

| Anxiety (about switching) | Habit (keeps current behaviour) |
|---|---|
| "Another gate will slow us down" | Trusting the author's sandbox demo |
| "False positives will train people to click through" | Validation-only deploys as the de facto check |
| "Our metadata is messier than any rule set" | Tribal knowledge about which components are risky |

Design responses: protected blockers are few and explainable; everything else is a review with a reason, not a hard stop; partial promotion keeps safe work moving.

## Switching triggers to probe

- A production incident traced to a missing component or permission after an AI-assisted change.
- An internal audit finding about permission sets.
- First Agentforce rollout to production.
- A new compliance requirement for change records.

## Interview prompts

1. Walk me through the last release that had to be rolled back or hotfixed. What was missing?
2. How do you decide a change is ready today? Who signs off, and where is that written?
3. When AI helped write a change, did anything about your review change?
4. What would make you trust a "blocked" verdict? What would make you ignore it?
