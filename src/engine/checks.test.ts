import { describe, expect, it } from 'vitest';
import { evaluateSlice, overridesFor, runChecks, sliceFingerprint, validateOverride } from './checks';
import { SAMPLE_CSV, SAMPLE_JSON, importAuto, importCsv, importJson, parseCsv } from './importer';
import { buildReport, decisionMemo, reportCsv } from './report';
import { remediationFor, seedRelease } from './seed';
import type { Override, Slice } from './types';

const release = seedRelease();
const target = release.targetOrg;
const agentV1 = release.slices[0];
const sla = release.slices[1];
const agentV2 = remediationFor(agentV1.id)!;
const ov = (slice: Slice, findingId: string): Override => ({
  sliceId: slice.id,
  revision: slice.revision,
  fingerprint: sliceFingerprint(slice, target),
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
    const all = f.filter((x) => x.overridable).map((x) => ov(agentV1, x.id));
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
    const ev = evaluateSlice(agentV2, target, f.map((x) => ov(agentV2, x.id)));
    expect(ev.decision).toBe('ready');
    expect(ev.deployable.length).toBe(agentV2.changes.length);
  });
  it('overrides recorded on v1 do not carry to v2', () => {
    const v1Overrides = runChecks(agentV1, target).filter((x) => x.overridable).map((x) => ov(agentV1, x.id));
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
  it('the populated deletion is protected: a forged sign-off does not release it', () => {
    const f = runChecks(sla, target).find((x) => x.check === 'destructive-field')!;
    expect(f.overridable).toBe(false);
    expect(validateOverride(f, 'A', 'x'.repeat(30))).toMatch(/protected/);
    expect(evaluateSlice(sla, target, [ov(sla, f.id)]).decision).toBe('ready-with-holdbacks');
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
    const perm = f.find((x) => x.check === 'permission-widening' && x.severity === 'review');
    expect(validateOverride(missing, 'A', 'x'.repeat(30))).toMatch(/protected/);
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
    const overrides = f.map((x) => ov(agentV2, x.id));
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
    expect(csv.split('\n')[0]).toBe('slice,revision,slice_decision,component,action,origin,status,reasons');
    expect(csv).toContain('CustomField:Case.Legacy_Region__c,delete,human,held,');
  });
});

describe('regressions: fail-closed import, protected blockers, revision-bound sign-offs', () => {
  const MODIFY_ALL_CSV =
    'record,slice,type,name,action,origin,depends_on,detail\n' +
    'target,,,CustomObject:Case,,,,\n' +
    'change,s1,CustomField,Case.X__c,add,human,CustomObject:Case,after=Text(10)\n' +
    'permission,s1,object,Case,,,,set=Support_Agent;before=read;after=modifyAll\n';

  it('an imported Modify All grant with no PermissionSet change row blocks the slice instead of reading Ready', () => {
    const r = importCsv(MODIFY_ALL_CSV);
    expect(r.issues.some((i) => i.level === 'warning' && /whole slice/.test(i.message))).toBe(true);
    const ev = evaluateSlice(r.release!.slices[0], r.release!.targetOrg, []);
    expect(ev.sliceLevel.map((f) => f.check)).toEqual(['permission-widening']);
    expect(ev.decision).toBe('blocked');
    expect(ev.deployable).toEqual([]);
  });

  it('a slice-level review finding stops Ready until signed off', () => {
    const r = importCsv(MODIFY_ALL_CSV.replace('after=modifyAll', 'after=edit'));
    const s = r.release!.slices[0];
    const ev = evaluateSlice(s, r.release!.targetOrg, []);
    expect(ev.decision).toBe('needs-review');
    const fp = sliceFingerprint(s, r.release!.targetOrg);
    const o: Override = { sliceId: s.id, revision: s.revision, fingerprint: fp, findingId: ev.findings[0].id, reviewer: 'R', reason: 'x'.repeat(25), at: '' };
    expect(evaluateSlice(s, r.release!.targetOrg, [o]).decision).toBe('ready');
  });

  it.each([
    ['null', 'null'],
    ['array', '[]'],
    ['string', '"hello"'],
    ['null slice', '{"targetOrg":{"components":[]},"slices":[null]}'],
    ['null change', '{"targetOrg":{"components":[]},"slices":[{"id":"a","changes":[null]}]}'],
    ['non-string target', '{"targetOrg":{"components":[1]},"slices":[{"id":"a","changes":[]}]}'],
    ['permissions not array', '{"targetOrg":{"components":[]},"slices":[{"id":"a","changes":[{"id":"c","type":"Flow","apiName":"F","action":"add","origin":"human","dependsOn":[],"diff":{"before":[],"after":[]}}],"permissions":"x"}]}'],
    ['covers not array', '{"targetOrg":{"components":[]},"slices":[{"id":"a","changes":[{"id":"c","type":"Flow","apiName":"F","action":"add","origin":"human","dependsOn":[],"diff":{"before":[],"after":[]}}],"tests":[{"id":"t","kind":"flow","scenario":"negative","result":"pass","covers":5}]}]}'],
    ['bad field shape', '{"targetOrg":{"components":[]},"slices":[{"id":"a","changes":[{"id":"c","type":"CustomField","apiName":"A.B__c","action":"modify","origin":"human","dependsOn":[],"diff":{"before":[],"after":[]},"field":{"before":{"dataType":"Picklist","values":"x"},"populatedRecords":1}}]}]}'],
    ['bad access', '{"targetOrg":{"components":[]},"slices":[{"id":"a","changes":[{"id":"c","type":"Flow","apiName":"F","action":"add","origin":"human","dependsOn":[],"diff":{"before":[],"after":[]}}],"permissions":[{"id":"p","permissionSet":"S","kind":"object","target":"Case","before":"read","after":"root"}]}]}'],
  ])('malformed JSON (%s) is rejected with an error, never thrown', (_, text) => {
    let r: ReturnType<typeof importJson> | undefined;
    expect(() => (r = importJson(text))).not.toThrow();
    expect(r!.release).toBeNull();
    expect(r!.issues.some((i) => i.level === 'error')).toBe(true);
  });

  it('JSON with two revisions under the same slice id is rejected', () => {
    const d = JSON.parse(SAMPLE_JSON);
    d.slices.push({ ...d.slices[0], revision: 2 });
    const r = importJson(JSON.stringify(d));
    expect(r.release).toBeNull();
    expect(r.issues[0].message).toMatch(/used by another slice/);
  });

  it('Modify All is a protected blocker: not offered, refused by validation, and ignored if forged', () => {
    const f = runChecks(agentV1, target).find((x) => x.check === 'permission-widening' && x.severity === 'blocker')!;
    expect(f.overridable).toBe(false);
    expect(f.rule).toMatch(/^Protected/);
    expect(validateOverride(f, 'A', 'x'.repeat(30))).toMatch(/protected/);
    const s = structuredClone(agentV1);
    s.permissions = [s.permissions[0]];
    s.changes.forEach((c) => (c.dependsOn = c.dependsOn.filter((d) => target.components.includes(d) || s.changes.some((o) => `${o.type}:${o.apiName}` === d))));
    s.tests = [];
    const forged = runChecks(s, target).map((x) => ov(s, x.id));
    expect(evaluateSlice(s, target, forged).decision).toBe('blocked');
  });

  it('an AI-assisted change with no tests is protected', () => {
    const f = runChecks(agentV1, target).filter((x) => x.id.endsWith(':none'));
    expect(f.length).toBe(2);
    expect(f.every((x) => x.severity === 'blocker' && !x.overridable)).toBe(true);
  });

  it('every blocker the engine can raise is non-overridable', () => {
    const all = [agentV1, agentV2, sla].flatMap((s) => runChecks(s, target));
    expect(all.filter((x) => x.severity === 'blocker' && x.overridable)).toEqual([]);
  });

  it('a sign-off does not survive a new revision or changed content under the same slice id', () => {
    const findings = runChecks(agentV2, target);
    const signed = findings.map((x) => ov(agentV2, x.id));
    expect(evaluateSlice(agentV2, target, signed).decision).toBe('ready');
    const bumped = { ...structuredClone(agentV2), revision: 3 };
    expect(evaluateSlice(bumped, target, signed).decision).toBe('needs-review');
    const edited = structuredClone(agentV2);
    edited.permissions[1].assignedTo = 'every internal user';
    expect(evaluateSlice(edited, target, signed).decision).toBe('needs-review');
    expect(overridesFor(edited, target, signed)).toEqual([]);
    const newTarget = { ...target, components: [...target.components, 'Flow:Other'] };
    expect(evaluateSlice(agentV2, newTarget, signed).decision).toBe('needs-review');
  });

  it('the report and memo only count sign-offs for this exact revision', () => {
    const signed = runChecks(agentV2, target).map((x) => ov(agentV2, x.id));
    const bumped = { ...structuredClone(agentV2), revision: 3 };
    expect(buildReport(release, bumped, signed).metrics.overrides).toBe(0);
    expect(decisionMemo(release, agentV2, signed, 'now')).toMatch(/on revision 2 \(fingerprint [0-9a-f]{8}\)/);
  });
});

describe('regressions: final audit', () => {
  const H = 'record,slice,type,name,action,origin,depends_on,detail\ntarget,,,CustomObject:Case,,,,\n';

  it('a modified populated field with no before-shape is a protected destructive blocker', () => {
    const r = importCsv(H + 'change,s1,CustomField,Case.Region__c,modify,human,,after=Text(20);populated=50\n');
    const f = runChecks(r.release!.slices[0], r.release!.targetOrg).find((x) => x.check === 'destructive-field')!;
    expect(f.severity).toBe('blocker');
    expect(f.overridable).toBe(false);
    expect(evaluateSlice(r.release!.slices[0], r.release!.targetOrg, []).decision).toBe('blocked');
  });

  it('a modified field with neither shape (JSON, no field block) still needs review', () => {
    const s = structuredClone(sla);
    s.changes.push({ id: 'x', type: 'CustomField', apiName: 'Case.Other__c', action: 'modify', origin: 'human', author: 'A', summary: '', dependsOn: [], diff: { before: [], after: [] } });
    expect(runChecks(s, target).some((f) => f.check === 'destructive-field' && f.changeId === 'x')).toBe(true);
  });

  it('test=true does not let an AI-assisted Flow skip test evidence', () => {
    const r = importCsv(H + 'change,s1,Flow,Agent_Route,modify,ai-assisted,,test=true\n');
    expect(r.release).toBeNull();
    expect(r.issues[0].message).toMatch(/only valid on an ApexClass/);
    const s = structuredClone(sla);
    const flow = s.changes.find((c) => c.type === 'Flow')!;
    flow.origin = 'ai-assisted';
    flow.isTest = true;
    s.tests = s.tests.filter((t) => !t.covers.includes(`Flow:${flow.apiName}`));
    const f = runChecks(s, target).find((x) => x.changeId === flow.id && x.check === 'incomplete-tests')!;
    expect(f).toMatchObject({ severity: 'blocker', overridable: false });
    const d = JSON.parse(SAMPLE_JSON);
    d.slices[0].changes.push({ id: 'zz', type: 'Flow', apiName: 'Z', action: 'add', origin: 'ai-assisted', dependsOn: [], diff: { before: [], after: [] }, isTest: true });
    const r2 = importJson(JSON.stringify(d));
    expect(r2.release).toBeNull();
    expect(r2.issues.some((i) => /only valid on an ApexClass/.test(i.message))).toBe(true);
  });

  it('a blocked atomic slice exports every change as held, never ready', () => {
    const ev = evaluateSlice(agentV1, target, []);
    expect(ev.decision).toBe('blocked');
    expect(ev.deployable).toEqual([]);
    const csv = reportCsv(buildReport(release, agentV1, []));
    const rows = csv.trim().split('\n').slice(1);
    expect(rows.length).toBe(agentV1.changes.length);
    expect(rows.every((r) => r.includes(',blocked,') && r.includes(',held,'))).toBe(true);
    expect(csv).not.toMatch(/,ready,/);
  });

  it('an unclosed CSV quote is rejected with its line number', () => {
    const r = importCsv(H + 'change,s1,Flow,F,add,human,,"summary=never closed\ntest,s1,flow,T,,,Flow:F,scenario=negative;result=pass\n');
    expect(r.release).toBeNull();
    expect(r.issues[0]).toMatchObject({ line: 3, level: 'error' });
  });

  it('pasted CSV is parsed as CSV even if a JSON file name is still remembered', () => {
    const r = importAuto(SAMPLE_CSV, 'sample-change-set.json');
    expect(r.release).not.toBeNull();
    expect(r.release!.name).toBe('Imported release');
    expect(importAuto(SAMPLE_JSON, 'notes.csv').release).not.toBeNull();
  });
});
