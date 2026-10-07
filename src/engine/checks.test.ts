import { describe, expect, it } from 'vitest';
import { evaluateSlice, runChecks, validateOverride } from './checks';
import { importCsv, importJson, parseCsv, SAMPLE_CSV, SAMPLE_JSON } from './importer';
import { buildReport, decisionMemo, reportCsv } from './report';
import { remediationFor, seedRelease } from './seed';
import type { Override } from './types';

const release = seedRelease();
const target = release.targetOrg;
const agentV1 = release.slices[0];
const sla = release.slices[1];
const agentV2 = remediationFor(agentV1.id)!;
const ov = (sliceId: string, findingId: string): Override => ({
  sliceId,
  findingId,
  reviewer: 'Test Reviewer',
  reason: 'Archived to the data warehouse and verified row counts.',
  at: '2026-10-07T00:00:00Z',
});

describe('Agentforce slice v1 (unsafe)', () => {
  const f = runChecks(agentV1, target);
  it('flags both missing dependencies as non-overridable blockers', () => {
    const missing = f.filter((x) => x.check === 'missing-dependency');
    expect(missing.map((x) => x.id.split(':').slice(-2).join(':')).sort()).toEqual([
      'ApexClass:CaseEscalationService',
      'CustomField:Case.Customer_Tier__c',
    ]);
    expect(missing.every((x) => x.severity === 'blocker' && !x.overridable)).toBe(true);
  });
  it('flags Modify All as a blocker and field edit as review', () => {
    const perms = f.filter((x) => x.check === 'permission-widening');
    expect(perms.map((p) => p.severity).sort()).toEqual(['blocker', 'review']);
  });
  it('flags untested AI-assisted components and happy-path-only tests', () => {
    const t = f.filter((x) => x.check === 'incomplete-tests');
    expect(t.filter((x) => x.id.endsWith(':none')).length).toBe(2);
    expect(t.filter((x) => x.id.endsWith(':happy-only')).length).toBe(3);
  });
  it('is blocked and holds back every change (atomic, cascade)', () => {
    const ev = evaluateSlice(agentV1, target, []);
    expect(ev.decision).toBe('blocked');
    expect(ev.held.length).toBe(agentV1.changes.length);
  });
  it('overriding everything overridable still cannot unblock missing dependencies', () => {
    const all = f.filter((x) => x.overridable).map((x) => ov(agentV1.id, x.id));
    expect(evaluateSlice(agentV1, target, all).decision).toBe('blocked');
  });
});

describe('Agentforce slice v2 (remediated)', () => {
  const f = runChecks(agentV2, target);
  it('has no blockers', () => {
    expect(f.filter((x) => x.severity === 'blocker')).toEqual([]);
  });
  it('leaves exactly two permission sign-offs', () => {
    expect(f.map((x) => x.check)).toEqual(['permission-widening', 'permission-widening']);
    expect(evaluateSlice(agentV2, target, []).decision).toBe('needs-review');
  });
  it('becomes ready once a reviewer signs off both widenings', () => {
    const ev = evaluateSlice(agentV2, target, f.map((x) => ov(agentV2.id, x.id)));
    expect(ev.decision).toBe('ready');
    expect(ev.deployable.length).toBe(agentV2.changes.length);
  });
  it('overrides recorded on v1 do not carry to v2', () => {
    const v1Overrides = runChecks(agentV1, target).filter((x) => x.overridable).map((x) => ov(agentV1.id, x.id));
    expect(evaluateSlice(agentV2, target, v1Overrides).decision).toBe('needs-review');
  });
});

describe('Case SLA slice (protected holdback)', () => {
  it('holds back the populated field deletion and ships the rest', () => {
    const ev = evaluateSlice(sla, target, []);
    expect(ev.decision).toBe('ready-with-holdbacks');
    expect(ev.held.map((c) => c.apiName)).toEqual(['Case.Legacy_Region__c']);
    expect(ev.deployable.length).toBe(3);
  });
  it('a recorded override releases it', () => {
    const f = runChecks(sla, target).find((x) => x.check === 'destructive-field')!;
    expect(evaluateSlice(sla, target, [ov(sla.id, f.id)]).decision).toBe('ready');
  });
  it('deleting a field another change still uses is a missing dependency', () => {
    const s = structuredClone(sla);
    s.changes.find((c) => c.id === 'b3')!.dependsOn.push('CustomField:Case.Legacy_Region__c');
    const f = runChecks(s, target).find((x) => x.check === 'missing-dependency');
    expect(f?.title).toContain('this slice deletes');
  });
});

describe('check rules', () => {
  it('Apex below 75% coverage is a non-overridable blocker', () => {
    const s = structuredClone(sla);
    s.tests[0].coverage = 74;
    const f = runChecks(s, target).find((x) => x.id.endsWith(':coverage'))!;
    expect(f.severity).toBe('blocker');
    expect(f.overridable).toBe(false);
  });
  it('a failing test is a blocker', () => {
    const s = structuredClone(sla);
    s.tests[1].result = 'fail';
    expect(runChecks(s, target).some((x) => x.id.endsWith(':failed'))).toBe(true);
  });
  it('narrowing a type or shrinking length is destructive; zero records is review', () => {
    const s = structuredClone(sla);
    s.changes = [
      {
        ...s.changes[0],
        id: 'x',
        action: 'modify',
        apiName: 'Case.Note__c',
        field: { before: { dataType: 'Text', length: 255 }, after: { dataType: 'Text', length: 80 }, populatedRecords: 0 },
      },
    ];
    s.tests = [];
    const f = runChecks(s, target);
    expect(f[0].check).toBe('destructive-field');
    expect(f[0].severity).toBe('review');
    expect(f[0].title).toContain('Length shrinks from 255 to 80');
  });
  it('narrowing permissions is not flagged', () => {
    const s = structuredClone(agentV2);
    s.permissions = [{ ...s.permissions[0], before: 'modifyAll', after: 'read' }];
    expect(runChecks(s, target).filter((x) => x.check === 'permission-widening')).toEqual([]);
  });
  it('override validation', () => {
    const f = runChecks(agentV1, target);
    const missing = f.find((x) => x.check === 'missing-dependency');
    const perm = f.find((x) => x.check === 'permission-widening');
    expect(validateOverride(missing, 'A', 'x'.repeat(30))).toMatch(/cannot be overridden/);
    expect(validateOverride(perm, '', 'x'.repeat(30))).toMatch(/name/);
    expect(validateOverride(perm, 'A', 'too short')).toMatch(/20 characters/);
    expect(validateOverride(perm, 'A', 'x'.repeat(20))).toBeNull();
  });
  it('is deterministic', () => {
    expect(runChecks(agentV1, target)).toEqual(runChecks(structuredClone(agentV1), structuredClone(target)));
  });
});

describe('import', () => {
  it('parses quoted CSV fields with commas, quotes and newlines', () => {
    const { rows, lines } = parseCsv('a,b\n"x, y","he said ""hi""\nthere"\nz,w\n');
    expect(rows[1]).toEqual(['x, y', 'he said "hi"\nthere']);
    expect(lines).toEqual([1, 2, 4]);
  });
  it('imports the sample CSV and finds its issues', () => {
    const r = importCsv(SAMPLE_CSV);
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(r.counts).toMatchObject({ changes: 3, permissions: 1, tests: 1, targets: 3, slices: 1 });
    const f = runChecks(r.release!.slices[0], r.release!.targetOrg);
    expect(f.map((x) => x.check).sort()).toEqual([
      'destructive-field',
      'incomplete-tests',
      'permission-widening',
    ]);
  });
  it('reports row-level errors with line numbers and refuses to import', () => {
    const bad = 'record,slice,type,name,action,origin,depends_on,detail\nchange,s1,Widget,Foo,add,human,,\nchange,s1,Flow,F,launch,human,,\npermission,s1,object,Case,,,,set=X;before=none;after=superuser\n';
    const r = importCsv(bad);
    expect(r.release).toBeNull();
    expect(r.issues.filter((i) => i.level === 'error').map((i) => i.line)).toEqual([2, 3, 4, 1]);
  });
  it('rejects a CSV missing header columns', () => {
    expect(importCsv('record,slice\n').issues[0].message).toMatch(/missing column/);
  });
  it('imports the sample JSON and rejects malformed JSON', () => {
    const r = importJson(SAMPLE_JSON);
    expect(r.release?.slices[0].changes.length).toBe(2);
    expect(evaluateSlice(r.release!.slices[0], r.release!.targetOrg, []).decision).toBe('ready');
    expect(importJson('{').release).toBeNull();
    expect(importJson('{"targetOrg":{"components":[]},"slices":[{"id":"x","changes":[{"type":"Nope"}]}]}').release).toBeNull();
  });
});

describe('report and memo', () => {
  it('reports denominators and gates for v1', () => {
    const r = buildReport(release, agentV1, []);
    expect(r.metrics.dependenciesResolved).toEqual({ num: 6, den: 8 });
    expect(r.metrics.deployableChanges).toEqual({ num: 0, den: 6 });
    expect(r.gates.filter((g) => !g.passed).map((g) => g.check)).toEqual(['missing-dependency', 'permission-widening', 'incomplete-tests']);
  });
  it('v2 after sign-off passes all gates and lists overrides in the memo', () => {
    const f = runChecks(agentV2, target);
    const overrides = f.map((x) => ov(agentV2.id, x.id));
    const r = buildReport(release, agentV2, overrides);
    expect(r.gates.every((g) => g.passed)).toBe(true);
    expect(r.metrics.testEvidenceComplete).toEqual({ num: 6, den: 6 });
    const memo = decisionMemo(release, agentV2, overrides, '2026-10-07T00:00:00Z');
    expect(memo).toContain('## Decision: Ready to promote');
    expect(memo).toContain('Test Reviewer accepted');
    expect(memo).toContain('does not execute or schedule a deployment');
  });
  it('memo for a blocked slice has no deploy list', () => {
    expect(decisionMemo(release, agentV1, [], 'now')).toContain('_None: the decision is not to promote this revision._');
  });
  it('CSV report escapes cells', () => {
    const csv = reportCsv(buildReport(release, sla, []));
    expect(csv.split('\n')[0]).toBe('component,action,origin,status,reasons');
    expect(csv).toContain('CustomField:Case.Legacy_Region__c,delete,human,held,');
  });
});
