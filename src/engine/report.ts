import { DECISION_LABELS, evaluateSlice, isTestable, isWidening, providedComponents } from './checks';
import type { SliceEvaluation } from './checks';
import type { CheckId, Override, Release, Slice } from './types';
import { CHECK_LABELS, keyOf } from './types';

export interface Ratio {
  num: number;
  den: number;
}

export interface Gate {
  check: CheckId;
  label: string;
  passed: boolean;
  open: number;
  overridden: number;
}

export interface ReadinessReport {
  release: string;
  slice: { id: string; name: string; revision: number; atomic: boolean };
  decision: string;
  decisionCode: SliceEvaluation['decision'];
  gates: Gate[];
  metrics: {
    deployableChanges: Ratio;
    dependenciesResolved: Ratio;
    testEvidenceComplete: Ratio;
    permissionWidenings: Ratio;
    destructiveProtected: Ratio;
    aiAssistedChanges: Ratio;
    findingsOpen: Ratio;
    overrides: number;
  };
  changes: { key: string; action: string; origin: string; status: string; reasons: string[] }[];
  overrides: Override[];
  provenance: string;
  disclaimer: string;
}

export const DISCLAIMER =
  'Synthetic data. Produced by deterministic checks in the browser. No Salesforce org was contacted and nothing was deployed.';

const pct = (r: Ratio) => (r.den === 0 ? 'n/a' : `${Math.round((r.num / r.den) * 100)}%`);
export const fmtRatio = (r: Ratio) => `${r.num} of ${r.den}${r.den ? ` (${pct(r)})` : ''}`;

export function buildReport(release: Release, slice: Slice, overrides: Override[]): ReadinessReport {
  const ev = evaluateSlice(slice, release.targetOrg, overrides);
  const sliceOverrides = overrides.filter((o) => o.sliceId === slice.id);
  const overriddenIds = new Set(sliceOverrides.map((o) => o.findingId));
  const openIds = new Set(ev.open.map((f) => f.id));

  const gates: Gate[] = (Object.keys(CHECK_LABELS) as CheckId[]).map((check) => {
    const all = ev.findings.filter((f) => f.check === check);
    const open = all.filter((f) => openIds.has(f.id)).length;
    return { check, label: CHECK_LABELS[check], passed: open === 0, open, overridden: all.filter((f) => overriddenIds.has(f.id) && !openIds.has(f.id)).length };
  });

  const provided = providedComponents(slice, release.targetOrg);
  const edges = slice.changes.filter((c) => c.action !== 'delete').flatMap((c) => c.dependsOn);
  const testable = slice.changes.filter(isTestable);
  const testGaps = new Set(ev.findings.filter((f) => f.check === 'incomplete-tests').map((f) => f.changeId));
  const destructive = ev.findings.filter((f) => f.check === 'destructive-field');
  const widenings = slice.permissions.filter(isWidening);

  return {
    release: release.name,
    slice: { id: slice.id, name: slice.name, revision: slice.revision, atomic: slice.atomic },
    decision: DECISION_LABELS[ev.decision],
    decisionCode: ev.decision,
    gates,
    metrics: {
      deployableChanges: { num: ev.deployable.length, den: slice.changes.length },
      dependenciesResolved: { num: edges.filter((d) => provided.has(d)).length, den: edges.length },
      testEvidenceComplete: { num: testable.filter((c) => !testGaps.has(c.id)).length, den: testable.length },
      permissionWidenings: { num: widenings.length, den: slice.permissions.length },
      destructiveProtected: {
        num: destructive.filter((f) => ev.changes[f.changeId]?.status === 'held').length,
        den: destructive.length,
      },
      aiAssistedChanges: { num: slice.changes.filter((c) => c.origin === 'ai-assisted').length, den: slice.changes.length },
      findingsOpen: { num: ev.open.length, den: ev.findings.length },
      overrides: sliceOverrides.length,
    },
    changes: slice.changes.map((c) => ({
      key: keyOf(c),
      action: c.action,
      origin: c.origin,
      status: ev.changes[c.id].status,
      reasons: ev.changes[c.id].reasons,
    })),
    overrides: sliceOverrides,
    provenance: slice.provenance,
    disclaimer: DISCLAIMER,
  };
}

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function reportCsv(r: ReadinessReport): string {
  const rows = [['component', 'action', 'origin', 'status', 'reasons']];
  for (const c of r.changes) rows.push([c.key, c.action, c.origin, c.status, c.reasons.join(' | ')]);
  return rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}

export function decisionMemo(release: Release, slice: Slice, overrides: Override[], generatedAt: string): string {
  const r = buildReport(release, slice, overrides);
  const ev = evaluateSlice(slice, release.targetOrg, overrides);
  const byId = new Map(slice.changes.map((c) => [c.id, c]));
  const m = r.metrics;
  const lines: string[] = [];
  lines.push(`# Deployment decision memo: ${slice.name} (revision ${slice.revision})`);
  lines.push('');
  lines.push(`> ${DISCLAIMER}`);
  lines.push('');
  lines.push(`- Release: ${release.name}`);
  lines.push(`- Target: ${release.targetOrg.name}`);
  lines.push(`- Generated: ${generatedAt}`);
  lines.push(`- Slice type: ${slice.atomic ? 'atomic (ships whole or not at all)' : 'independent changes (safe ones can ship alone)'}`);
  lines.push('');
  lines.push(`## Decision: ${r.decision}`);
  lines.push('');
  const why: Record<string, string> = {
    blocked: `Do not promote. ${ev.held.length} of ${slice.changes.length} changes are held back${slice.atomic ? ', and this slice is atomic' : ''}.`,
    'needs-review': `Do not promote yet. ${ev.review.length === 1 ? '1 change needs' : `${ev.review.length} changes need`} a named reviewer to sign off.`,
    'ready-with-holdbacks': `Promote ${ev.deployable.length} of ${slice.changes.length} changes. ${ev.held.length === 1 ? '1 protected change stays' : `${ev.held.length} protected changes stay`} out of the package.`,
    ready: `Promote all ${slice.changes.length} changes. Every gate passes.`,
  };
  lines.push(why[r.decisionCode]);
  lines.push('');
  lines.push('## Gates');
  lines.push('');
  lines.push('| Gate | Result | Open | Overridden |');
  lines.push('|---|---|---|---|');
  for (const g of r.gates) lines.push(`| ${g.label} | ${g.passed ? 'Pass' : 'Fail'} | ${g.open} | ${g.overridden} |`);
  lines.push('');
  lines.push('## Readiness measures');
  lines.push('');
  lines.push(`- Deployable changes: ${fmtRatio(m.deployableChanges)}`);
  lines.push(`- Dependencies resolved: ${fmtRatio(m.dependenciesResolved)}`);
  lines.push(`- Testable changes with complete evidence: ${fmtRatio(m.testEvidenceComplete)}`);
  lines.push(`- Permission deltas that widen access: ${fmtRatio(m.permissionWidenings)}`);
  lines.push(`- Destructive field changes held back: ${fmtRatio(m.destructiveProtected)}`);
  lines.push(`- AI-assisted changes: ${fmtRatio(m.aiAssistedChanges)}`);
  lines.push(`- Findings still open: ${fmtRatio(m.findingsOpen)}`);
  lines.push(`- Human overrides recorded: ${m.overrides}`);
  lines.push('');
  lines.push('## Deploy list');
  lines.push('');
  if (ev.decision === 'blocked' || ev.decision === 'needs-review') lines.push('_None: the decision is not to promote this revision._');
  else for (const c of ev.deployable) lines.push(`- ${c.action} ${keyOf(c)} (${c.origin})`);
  lines.push('');
  lines.push('## Held back (protected)');
  lines.push('');
  if (!ev.held.length) lines.push('_None._');
  for (const c of ev.held) lines.push(`- ${keyOf(c)}: ${ev.changes[c.id].reasons.join('; ')}`);
  lines.push('');
  lines.push('## Open findings');
  lines.push('');
  if (!ev.open.length) lines.push('_None._');
  for (const f of ev.open) {
    lines.push(`- **${f.severity === 'blocker' ? 'Blocker' : 'Review'}: ${f.title}** (${byId.get(f.changeId)?.apiName ?? f.changeId})`);
    lines.push(`  - Why it matters: ${f.why}`);
    lines.push(`  - Rule: ${f.rule}`);
  }
  lines.push('');
  lines.push('## Human overrides');
  lines.push('');
  if (!r.overrides.length) lines.push('_None._');
  for (const o of r.overrides) {
    const f = ev.findings.find((x) => x.id === o.findingId);
    lines.push(`- ${o.at}: ${o.reviewer} accepted "${f?.title ?? o.findingId}". Reason: ${o.reason}`);
  }
  lines.push('');
  lines.push('## Provenance');
  lines.push('');
  lines.push(`- ${slice.provenance}`);
  lines.push('- Checks: missing dependency, destructive field change, permission widening and incomplete tests. All are deterministic rules; see the in-app rule text on each finding.');
  lines.push('- This memo records a review decision. It does not execute or schedule a deployment.');
  lines.push('');
  return lines.join('\n');
}
