import type {
  Access,
  Change,
  ChangeStatus,
  Decision,
  Finding,
  FieldShape,
  Override,
  PermissionDelta,
  Slice,
  TargetOrg,
  TestRecord,
} from './types';
import { keyOf } from './types';

export const APEX_COVERAGE_MIN = 75;

const TESTABLE = new Set([
  'ApexClass',
  'ApexTrigger',
  'Flow',
  'GenAiPlannerBundle',
  'GenAiPlugin',
  'GenAiFunction',
  'GenAiPromptTemplate',
]);

export function isTestable(c: Change): boolean {
  return TESTABLE.has(c.type) && c.action !== 'delete' && !c.isTest;
}

const OBJECT_RANK: Record<string, number> = { none: 0, read: 1, edit: 2, viewAll: 3, modifyAll: 4 };
const FIELD_RANK: Record<string, number> = { none: 0, read: 1, edit: 2 };
const SYSTEM_RANK: Record<string, number> = { off: 0, on: 1 };

export function accessRank(kind: PermissionDelta['kind'], a: Access): number {
  const table = kind === 'object' ? OBJECT_RANK : kind === 'field' ? FIELD_RANK : SYSTEM_RANK;
  const r = table[a];
  if (r === undefined) throw new Error(`Access "${a}" is not valid for ${kind} permissions`);
  return r;
}

export function isWidening(p: PermissionDelta): boolean {
  return accessRank(p.kind, p.after) > accessRank(p.kind, p.before);
}

/** Components that exist after this slice deploys: target minus deletions, plus additions/modifications. */
export function providedComponents(slice: Slice, target: TargetOrg): Set<string> {
  const provided = new Set(target.components);
  for (const c of slice.changes) {
    if (c.action === 'delete') provided.delete(keyOf(c));
    else provided.add(keyOf(c));
  }
  return provided;
}

export function describeShape(s?: FieldShape): string {
  if (!s) return '(none)';
  if (s.values) return `${s.dataType}(${s.values.join(' | ')})`;
  if (s.length !== undefined) return `${s.dataType}(${s.length})`;
  return s.dataType;
}

function destructiveReason(c: Change): string | null {
  if (c.type !== 'CustomField') return null;
  if (c.action === 'delete') return 'Field is deleted';
  if (c.action !== 'modify' || !c.field?.before || !c.field.after) return null;
  const { before, after } = c.field;
  if (before.dataType !== after.dataType) return `Data type changes from ${describeShape(before)} to ${describeShape(after)}`;
  if (before.length !== undefined && after.length !== undefined && after.length < before.length)
    return `Length shrinks from ${before.length} to ${after.length}`;
  if (before.values && after.values) {
    const removed = before.values.filter((v) => !after.values!.includes(v));
    if (removed.length) return `Picklist values removed: ${removed.join(', ')}`;
  }
  return null;
}

export function runChecks(slice: Slice, target: TargetOrg): Finding[] {
  const findings: Finding[] = [];
  const provided = providedComponents(slice, target);
  const deleted = new Set(slice.changes.filter((c) => c.action === 'delete').map(keyOf));

  for (const c of slice.changes) {
    const key = keyOf(c);

    // 1. Missing dependencies
    if (c.action !== 'delete') {
      for (const dep of c.dependsOn) {
        if (provided.has(dep)) continue;
        const wasDeleted = deleted.has(dep);
        findings.push({
          id: `missing-dependency:${slice.id}:${c.id}:${dep}`,
          check: 'missing-dependency',
          severity: 'blocker',
          changeId: c.id,
          title: `${c.apiName} needs ${dep}, which ${wasDeleted ? 'this slice deletes' : 'is not in the slice or the target org'}`,
          why: wasDeleted
            ? 'The slice removes a component another change still references. The deploy fails, or the feature breaks at runtime.'
            : 'It passes in the source sandbox, where the dependency exists, then fails at validation or at runtime in the target org.',
          rule: 'Every reference must resolve to a component in the slice or in the target org inventory.',
          evidence: [
            { kind: 'graph', focus: key, missing: dep },
            { kind: 'inventory', component: dep },
            { kind: 'diff', changeId: c.id },
          ],
          overridable: false,
        });
      }
    }

    // 2. Destructive field changes
    const reason = destructiveReason(c);
    if (reason) {
      const populated = c.field?.populatedRecords ?? 0;
      const hasData = populated > 0;
      const dependents = slice.changes.filter((o) => o.id !== c.id && o.dependsOn.includes(key));
      findings.push({
        id: `destructive-field:${slice.id}:${c.id}`,
        check: 'destructive-field',
        severity: hasData ? 'blocker' : 'review',
        changeId: c.id,
        title: `${reason} on ${c.apiName}${hasData ? ` (${populated.toLocaleString('en-GB')} populated records)` : ' (no populated records)'}`,
        why: hasData
          ? 'Data in these records is lost or truncated on deploy, and rolling back the metadata does not bring it back.'
          : 'No records hold data today, but reports, integrations or formulas that reference it can still break.',
        rule: 'Destructive field changes with data are held back until a named reviewer records where the data went.',
        evidence: [
          { kind: 'diff', changeId: c.id },
          { kind: 'inventory', component: key },
          ...(dependents.length ? [{ kind: 'graph' as const, focus: key }] : []),
        ],
        overridable: true,
      });
    }
  }

  // 3. Permission widening
  for (const p of slice.permissions) {
    if (!isWidening(p)) continue;
    const owner = slice.changes.find((c) => c.type === 'PermissionSet' && c.apiName === p.permissionSet);
    const broad = p.kind === 'system' || p.after === 'modifyAll' || p.after === 'viewAll';
    findings.push({
      id: `permission-widening:${slice.id}:${p.id}`,
      check: 'permission-widening',
      severity: broad ? 'blocker' : 'review',
      changeId: owner?.id ?? p.permissionSet,
      title: `${p.permissionSet} widens ${p.target} from ${p.before} to ${p.after}`,
      why: broad
        ? `${p.after === 'on' ? 'A system permission' : p.after} overrides sharing rules for ${p.assignedTo}, so far more records can be seen or changed than the feature needs.`
        : `Gives ${p.assignedTo} more access than before. It may be right, but a human should confirm it is the least access the feature needs.`,
      rule: broad
        ? 'View All, Modify All and system permissions are held back unless a named reviewer justifies them.'
        : 'Every widening needs a named reviewer to sign it off.',
      evidence: [{ kind: 'permission', permId: p.id }, ...(owner ? [{ kind: 'diff' as const, changeId: owner.id }] : [])],
      overridable: true,
    });
  }

  // 4. Incomplete tests
  for (const c of slice.changes) {
    if (!isTestable(c)) continue;
    const key = keyOf(c);
    const covering = slice.tests.filter((t) => t.covers.includes(key));
    const ids = covering.map((t) => t.id);
    const ev = [{ kind: 'test' as const, component: key, testIds: ids }, { kind: 'diff' as const, changeId: c.id }];
    const failed = covering.filter((t) => t.result !== 'pass');
    const base = { check: 'incomplete-tests' as const, changeId: c.id, evidence: ev };

    if (failed.length) {
      findings.push({
        ...base,
        id: `incomplete-tests:${slice.id}:${c.id}:failed`,
        severity: 'blocker',
        title: `${c.apiName} has ${failed.length} failing or unrun test${failed.length > 1 ? 's' : ''}`,
        why: 'A failing test is direct evidence the change does not behave as intended.',
        rule: 'Every test that covers a changed component must pass.',
        overridable: false,
      });
      continue;
    }
    if (c.type === 'ApexClass' || c.type === 'ApexTrigger') {
      const apex = covering.filter((t) => t.kind === 'apex');
      const best = Math.max(0, ...apex.map((t) => t.coverage ?? 0));
      if (!apex.length || best < APEX_COVERAGE_MIN) {
        findings.push({
          ...base,
          id: `incomplete-tests:${slice.id}:${c.id}:coverage`,
          severity: 'blocker',
          title: apex.length
            ? `${c.apiName} coverage is ${best}%, below ${APEX_COVERAGE_MIN}%`
            : `${c.apiName} has no Apex test covering it`,
          why: 'Salesforce requires 75% Apex coverage across the org to deploy to production. This desk applies the same bar to each changed class, so one thin class can\u2019t hide behind the org average.',
          rule: `House rule: each changed Apex class needs a passing Apex test with at least ${APEX_COVERAGE_MIN}% coverage.`,
          overridable: false,
        });
        continue;
      }
    } else if (!covering.length) {
      const ai = c.origin === 'ai-assisted';
      findings.push({
        ...base,
        id: `incomplete-tests:${slice.id}:${c.id}:none`,
        severity: ai ? 'blocker' : 'review',
        title: `${c.apiName} has no test evidence`,
        why: ai
          ? 'This was AI-assisted. Nobody has shown it works outside the demo path it was written for.'
          : 'No recorded test exercises this component.',
        rule: 'AI-assisted changes need test evidence before release. Human changes without tests need sign-off.',
        overridable: true,
      });
      continue;
    }
    if (c.origin === 'ai-assisted' && !covering.some((t) => t.scenario !== 'happy-path')) {
      findings.push({
        ...base,
        id: `incomplete-tests:${slice.id}:${c.id}:happy-only`,
        severity: 'review',
        title: `${c.apiName} is only tested on the happy path`,
        why: 'A happy-path demo passes while refusals, bad input and permission edges stay untested. Those are exactly where AI-assisted changes tend to go wrong.',
        rule: 'AI-assisted changes need at least one negative or permission-scenario test.',
        overridable: true,
      });
    }
  }

  return findings;
}

export interface ChangeEvaluation {
  status: ChangeStatus;
  reasons: string[];
}

export interface SliceEvaluation {
  findings: Finding[];
  open: Finding[];
  changes: Record<string, ChangeEvaluation>;
  decision: Decision;
  deployable: Change[];
  held: Change[];
  review: Change[];
}

export function evaluateSlice(slice: Slice, target: TargetOrg, overrides: Override[]): SliceEvaluation {
  const findings = runChecks(slice, target);
  const accepted = new Set(overrides.filter((o) => o.sliceId === slice.id).map((o) => o.findingId));
  const open = findings.filter((f) => !(f.overridable && accepted.has(f.id)));
  const changes: Record<string, ChangeEvaluation> = {};
  for (const c of slice.changes) changes[c.id] = { status: 'ready', reasons: [] };

  for (const f of open) {
    const ce = changes[f.changeId];
    if (!ce) continue;
    if (f.severity === 'blocker') {
      ce.status = 'held';
      ce.reasons.push(f.title);
    } else if (ce.status !== 'held') {
      ce.status = 'review';
      ce.reasons.push(f.title);
    }
  }

  // Cascade: anything depending on a held-back change is held back too.
  let changed = true;
  while (changed) {
    changed = false;
    const heldKeys = new Set(slice.changes.filter((c) => changes[c.id].status === 'held').map(keyOf));
    for (const c of slice.changes) {
      if (changes[c.id].status === 'held') continue;
      const dep = c.dependsOn.find((d) => heldKeys.has(d));
      if (dep) {
        changes[c.id].status = 'held';
        changes[c.id].reasons.push(`Depends on held-back ${dep}`);
        changed = true;
      }
    }
  }

  const held = slice.changes.filter((c) => changes[c.id].status === 'held');
  const review = slice.changes.filter((c) => changes[c.id].status === 'review');
  const deployable = slice.changes.filter((c) => changes[c.id].status === 'ready');

  let decision: Decision;
  if (held.length && (slice.atomic || held.length === slice.changes.length)) decision = 'blocked';
  else if (review.length) decision = 'needs-review';
  else if (held.length) decision = 'ready-with-holdbacks';
  else decision = 'ready';

  return { findings, open, changes, decision, deployable, held, review };
}

export const DECISION_LABELS: Record<Decision, string> = {
  ready: 'Ready to promote',
  'ready-with-holdbacks': 'Ready with protected holdbacks',
  'needs-review': 'Needs human review',
  blocked: 'Blocked',
};

export function validateOverride(
  finding: Finding | undefined,
  reviewer: string,
  reason: string,
): string | null {
  if (!finding) return 'Finding not found.';
  if (!finding.overridable) return 'This finding cannot be overridden. Change the slice instead.';
  if (!reviewer.trim()) return 'Add the reviewer\u2019s name.';
  if (reason.trim().length < 20) return 'Give a reason of at least 20 characters so the memo explains the decision.';
  return null;
}

export function testsFor(slice: Slice, key: string): TestRecord[] {
  return slice.tests.filter((t) => t.covers.includes(key));
}
