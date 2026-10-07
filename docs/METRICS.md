# Metrics and success criteria

Independent concept by Ayo Ahmed. None of these numbers come from a real customer; targets are hypotheses to validate.

## North star (if this became a product)

**Escaped release defects per 100 promoted slices**, where an escaped defect is a rollback, hotfix or access incident within 14 days that traces to a missing dependency, destructive change, permission widening or untested path.

Why: it measures the outcome customers pay for (releases that do not break), not usage of the desk.

## Leading indicators

| Metric | Definition | Hypothesis target |
|---|---|---|
| Pre-release catch rate | Findings raised on slices that would otherwise have failed, divided by all release failures in that category | ≥ 60% of dependency and permission failures caught before promotion |
| Time to decision | Slice opened → decision recorded | Median under 10 minutes for slices under 20 changes |
| Override rate | Reviewable findings signed off ÷ reviewable findings raised | 20–50%. Near 100% means the rules are noise; near 0% means reviewers are rubber-stamping fixes |
| Override quality | Sign-offs whose reason references specific evidence (sampled) | ≥ 80% |
| Remediation loop | Blocked slices that return as a new revision within 2 days | ≥ 70% |
| Partial-promotion share | Slices promoted with protected holdbacks rather than fully blocked | Tracked; shows how often one bad change no longer stops good ones |

## Readiness measures (shown in the app and exported)

| Measure | Formula |
|---|---|
| Deployable changes | ready changes ÷ all changes |
| Dependencies resolved | dependency edges satisfied by slice or target ÷ all edges from non-deleted changes |
| Test evidence complete | testable changes with no incomplete-test finding ÷ testable changes |
| Permission deltas widening access | widening deltas ÷ all permission deltas |
| Destructive changes held back | destructive findings whose change is held ÷ destructive findings |
| AI-assisted changes | AI-assisted changes ÷ all changes |
| Findings still open | open findings ÷ all findings |
| Human sign-offs recorded | count |

Each is shown as `n of d (p%)` so the denominator is visible.

## Event taxonomy (proposed for a real build; the prototype only writes a local review log)

| Event | Properties |
|---|---|
| `release_loaded` | source (seed/import/pipeline), slice_count, change_count |
| `import_validated` | format, error_count, warning_count |
| `slice_evaluated` | slice_id, revision, decision, findings_by_check, blockers, ai_assisted_share |
| `evidence_opened` | finding_check, evidence_kind |
| `override_recorded` | finding_check, severity, reason_length, time_since_open |
| `override_withdrawn` | finding_check |
| `revision_loaded` | slice_id, from_revision, to_revision |
| `slices_compared` | a_decision, b_decision, resolved_count, new_count |
| `decision_exported` | format, decision |
| `release_outcome` (joined later) | slice_id, promoted, rolled_back, hotfix_within_14d, cause_category |

## Prototype success criteria (what would make me continue)

1. 5 of 6 release managers in moderated tests reach the correct decision on both seed slices without prompting.
2. After one evidence click, participants can explain why each blocker matters in their own words.
3. At least half say they would attach the memo to a real change record.
4. No participant tries to override a missing dependency and is surprised it is protected (i.e. the protection reads as reasonable, not arbitrary).

## Guardrails

- False-positive rate on blockers, sampled weekly: under 5%.
- Desk time added per release: under 15 minutes median.
- No increase in time to promote for slices with zero findings.
