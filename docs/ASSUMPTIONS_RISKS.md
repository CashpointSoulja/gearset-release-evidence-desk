# Assumptions and risks

## Assumptions (riskiest first)

| # | Assumption | Why it matters | Cheapest test |
|---|---|---|---|
| A1 | AI-assisted changes fail at release for dependency, permission or test-gap reasons often enough to matter | Without this, the desk is a nice-to-have | Ask 10 release managers for their last three rollbacks and categorise causes |
| A2 | Reviewers will accept a few hard, non-overridable blockers | If not, they route around the desk | Moderated test: watch reactions to the protected missing-dependency finding |
| A3 | A target-org inventory is available at review time | Missing-dependency logic needs it | Check what inventory data existing comparison tools already hold |
| A4 | Teams can tag a change as AI-assisted | The stricter test rule depends on it | Ask how teams mark AI-generated work today (commit trailers, PR labels, nothing) |
| A5 | A written decision memo has value beyond the desk | Drives export and audit use case | Ask whether change records or CAB notes exist and who reads them |
| A6 | Slice-level partial promotion is acceptable | "Ready with holdbacks" assumes non-atomic slices are common | Look at how often releases are cherry-picked today |

## Product risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Rule noise trains people to click "sign off" | Medium | High | Few blocker rules, 20-character reasons, override-rate guardrail, evidence on every finding |
| Static dependency declarations miss runtime dependencies (dynamic SOQL, string-referenced fields) | High | Medium | Say so in the UI; treat the desk as a floor, not a proof |
| "AI-assisted" label stigmatises authors | Medium | Medium | Label the change, not the person; same rules apply to human changes, only stricter test rule differs |
| Overlap with existing platform capabilities | High | Medium | Position as a review layer that joins existing signals, not a replacement engine |
| Coverage threshold set too low or high for a team | Medium | Low | Make thresholds configurable in v2 |

## Prototype limits (known and deliberate)

- Synthetic data only; no Salesforce API calls; no deployment execution.
- Dependencies are declared in fixtures or imports, not derived from metadata.
- Revision 2 is a pre-written fixture.
- One target inventory per release.
- State lives in the browser's localStorage only; no multi-user review or authentication.
- Override reviewer names are free text, not verified identities.

## Ethical and honesty guardrails

- The UI and docs never claim to be an official Gearset product, and never claim Gearset's systems are broken.
- No real customer data, credentials or private information.
- Simulated parts are labelled where they appear.
