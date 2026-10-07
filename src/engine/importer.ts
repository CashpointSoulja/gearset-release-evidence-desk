import type {
  Access,
  Change,
  ChangeAction,
  FieldShape,
  MetadataType,
  Origin,
  PermissionDelta,
  PermissionKind,
  Release,
  Slice,
  TestKind,
  TestRecord,
  TestResult,
  TestScenario,
} from './types';
import { METADATA_TYPES } from './types';

export interface ImportIssue {
  line: number;
  level: 'error' | 'warning';
  message: string;
}

export interface ImportResult {
  release: Release | null;
  issues: ImportIssue[];
  counts: { changes: number; permissions: number; tests: number; targets: number; slices: number };
}

export const CSV_HEADER = ['record', 'slice', 'type', 'name', 'action', 'origin', 'depends_on', 'detail'] as const;

const ACTIONS: ChangeAction[] = ['add', 'modify', 'delete'];
const ORIGINS: Origin[] = ['human', 'ai-assisted'];
const PERM_KINDS: PermissionKind[] = ['object', 'field', 'system'];
const ACCESS: Record<PermissionKind, Access[]> = {
  object: ['none', 'read', 'edit', 'viewAll', 'modifyAll'],
  field: ['none', 'read', 'edit'],
  system: ['off', 'on'],
};
const TEST_KINDS: TestKind[] = ['apex', 'flow', 'agent-conversation', 'prompt'];
const SCENARIOS: TestScenario[] = ['happy-path', 'negative', 'permission'];
const RESULTS: TestResult[] = ['pass', 'fail', 'not-run'];
const KEY_RE = /^[A-Za-z]+:[A-Za-z0-9_.]+$/;

/** RFC 4180-style parser: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): { rows: string[][]; lines: number[] } {
  const rows: string[][] = [];
  const lines: number[] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let rowStart = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else {
        if (ch === '\n') line++;
        field += ch;
      }
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim() !== '')) {
        rows.push(row);
        lines.push(rowStart);
      }
      row = [];
      field = '';
      line++;
      rowStart = line;
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) {
    rows.push(row);
    lines.push(rowStart);
  }
  return { rows, lines };
}

function parseDetail(detail: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of detail.split(';')) {
    const p = part.trim();
    if (!p) continue;
    const eq = p.indexOf('=');
    if (eq < 1) continue;
    out[p.slice(0, eq).trim()] = p.slice(eq + 1).trim();
  }
  return out;
}

/** "Text(255)" | "Picklist(A|B)" | "DateTime" */
export function parseShape(s: string | undefined): FieldShape | undefined | null {
  if (s === undefined || s === '') return undefined;
  const m = /^([A-Za-z]+)(?:\(([^)]*)\))?$/.exec(s.trim());
  if (!m) return null;
  const [, dataType, arg] = m;
  if (arg === undefined) return { dataType };
  if (/^\d+$/.test(arg)) return { dataType, length: Number(arg) };
  return { dataType, values: arg.split('|').map((v) => v.trim()).filter(Boolean) };
}

const splitKeys = (s: string) => s.split(';').map((k) => k.trim()).filter(Boolean);

export function importCsv(text: string, releaseName = 'Imported release'): ImportResult {
  const issues: ImportIssue[] = [];
  const counts = { changes: 0, permissions: 0, tests: 0, targets: 0, slices: 0 };
  const { rows, lines } = parseCsv(text.replace(/^\uFEFF/, ''));
  if (!rows.length) return { release: null, issues: [{ line: 1, level: 'error', message: 'File is empty.' }], counts };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = CSV_HEADER.filter((h) => !header.includes(h));
  if (missing.length) {
    return {
      release: null,
      issues: [{ line: 1, level: 'error', message: `Header is missing column(s): ${missing.join(', ')}` }],
      counts,
    };
  }
  const col = (r: string[], name: (typeof CSV_HEADER)[number]) => (r[header.indexOf(name)] ?? '').trim();

  const slices = new Map<string, Slice>();
  const targets: string[] = [];
  const getSlice = (id: string) => {
    let s = slices.get(id);
    if (!s) {
      s = {
        id,
        name: id,
        revision: 1,
        description: 'Imported from CSV.',
        atomic: false,
        changes: [],
        permissions: [],
        tests: [],
        provenance: 'Imported by the user from a CSV file in this browser session.',
      };
      slices.set(id, s);
    }
    return s;
  };

  rows.slice(1).forEach((r, idx) => {
    const line = lines[idx + 1];
    const err = (message: string) => issues.push({ line, level: 'error', message });
    const record = col(r, 'record').toLowerCase();
    const sliceId = col(r, 'slice');
    const type = col(r, 'type');
    const name = col(r, 'name');
    const detail = parseDetail(col(r, 'detail'));

    if (record === 'target') {
      const key = name || type;
      if (!KEY_RE.test(key)) return err(`Target component "${key}" must look like Type:ApiName.`);
      targets.push(key);
      counts.targets++;
      return;
    }
    if (record === 'slice') {
      if (!sliceId) return err('Slice rows need a slice id.');
      const s = getSlice(sliceId);
      if (name) s.name = name;
      s.atomic = (detail.atomic ?? '').toLowerCase() === 'true';
      if (detail.description) s.description = detail.description;
      return;
    }
    if (!sliceId) return err('Missing slice id.');

    if (record === 'change') {
      if (!METADATA_TYPES.includes(type as MetadataType)) return err(`Unknown metadata type "${type}". Use one of: ${METADATA_TYPES.join(', ')}.`);
      if (!name) return err('Change rows need an API name.');
      const action = col(r, 'action').toLowerCase() as ChangeAction;
      if (!ACTIONS.includes(action)) return err(`Action must be add, modify or delete (got "${col(r, 'action')}").`);
      const origin = (col(r, 'origin').toLowerCase() || 'human') as Origin;
      if (!ORIGINS.includes(origin)) return err(`Origin must be human or ai-assisted (got "${origin}").`);
      const dependsOn = splitKeys(col(r, 'depends_on'));
      const bad = dependsOn.filter((k) => !KEY_RE.test(k));
      if (bad.length) return err(`depends_on entries must look like Type:ApiName (bad: ${bad.join(', ')}).`);
      const before = parseShape(detail.before);
      const after = parseShape(detail.after);
      if (before === null || after === null) return err('Field shapes must look like Text(255), Picklist(A|B) or DateTime.');
      const populated = detail.populated ? Number(detail.populated) : 0;
      if (!Number.isInteger(populated) || populated < 0) return err('populated must be a whole number of records.');
      const s = getSlice(sliceId);
      const id = `${sliceId}-c${s.changes.length + 1}`;
      if (s.changes.some((c) => c.type === type && c.apiName === name))
        issues.push({ line, level: 'warning', message: `${type}:${name} appears twice in slice ${sliceId}; both rows are kept.` });
      const change: Change = {
        id,
        type: type as MetadataType,
        apiName: name,
        action,
        origin,
        author: detail.author ?? 'Imported',
        summary: detail.summary ?? `${action} ${type} ${name}`,
        dependsOn,
        isTest: detail.test === 'true' || undefined,
        diff: {
          before: before ? [`${name}: ${detail.before}`] : action === 'add' ? [] : [`${name} (current)`],
          after: after ? [`${name}: ${detail.after}`] : action === 'delete' ? [] : [`${name} (changed)`],
        },
      };
      if (type === 'CustomField') change.field = { before: before ?? undefined, after: after ?? undefined, populatedRecords: populated };
      s.changes.push(change);
      counts.changes++;
      return;
    }

    if (record === 'permission') {
      const kind = type.toLowerCase() as PermissionKind;
      if (!PERM_KINDS.includes(kind)) return err(`Permission type must be object, field or system (got "${type}").`);
      const set = detail.set;
      if (!set) return err('Permission rows need detail "set=<PermissionSetName>".');
      const before = (detail.before ?? '') as Access;
      const after = (detail.after ?? '') as Access;
      if (!ACCESS[kind].includes(before) || !ACCESS[kind].includes(after))
        return err(`For ${kind} permissions, before/after must be one of: ${ACCESS[kind].join(', ')}.`);
      if (!name) return err('Permission rows need a target in the name column.');
      const s = getSlice(sliceId);
      const p: PermissionDelta = {
        id: `${sliceId}-p${s.permissions.length + 1}`,
        permissionSet: set,
        kind,
        target: name,
        before,
        after,
        assignedTo: detail.assigned ?? 'users with this permission set',
      };
      s.permissions.push(p);
      counts.permissions++;
      return;
    }

    if (record === 'test') {
      const kind = type.toLowerCase() as TestKind;
      if (!TEST_KINDS.includes(kind)) return err(`Test type must be one of: ${TEST_KINDS.join(', ')}.`);
      const scenario = (detail.scenario ?? 'happy-path') as TestScenario;
      const result = (detail.result ?? 'not-run') as TestResult;
      if (!SCENARIOS.includes(scenario)) return err(`scenario must be one of: ${SCENARIOS.join(', ')}.`);
      if (!RESULTS.includes(result)) return err(`result must be one of: ${RESULTS.join(', ')}.`);
      const covers = splitKeys(col(r, 'depends_on'));
      if (!covers.length) return err('Test rows list the components they cover in depends_on.');
      let coverage: number | undefined;
      if (detail.coverage !== undefined) {
        coverage = Number(detail.coverage);
        if (!Number.isFinite(coverage) || coverage < 0 || coverage > 100) return err('coverage must be 0 to 100.');
      }
      if (kind === 'apex' && coverage === undefined)
        issues.push({ line, level: 'warning', message: 'Apex test has no coverage value; it will count as 0%.' });
      const s = getSlice(sliceId);
      const t: TestRecord = {
        id: `${sliceId}-t${s.tests.length + 1}`,
        name: name || `Test ${s.tests.length + 1}`,
        kind,
        covers,
        scenario,
        result,
        coverage,
        source: 'Imported test record',
      };
      s.tests.push(t);
      counts.tests++;
      return;
    }

    err(`Unknown record "${record}". Use target, slice, change, permission or test.`);
  });

  for (const s of slices.values()) {
    if (!s.changes.length) issues.push({ line: 1, level: 'error', message: `Slice "${s.id}" has no change rows.` });
  }
  if (!targets.length)
    issues.push({ line: 1, level: 'warning', message: 'No target rows: every dependency outside the slice will be reported missing.' });
  counts.slices = slices.size;
  if (!slices.size) issues.push({ line: 1, level: 'error', message: 'No slices found.' });

  const hasErrors = issues.some((i) => i.level === 'error');
  return {
    release: hasErrors
      ? null
      : {
          id: 'imported',
          name: releaseName,
          source: 'import',
          targetOrg: { name: 'Imported target inventory', components: targets },
          slices: [...slices.values()],
        },
    issues,
    counts,
  };
}

/** JSON import: the Release shape in src/engine/types.ts, validated field by field. */
export function importJson(text: string): ImportResult {
  const counts = { changes: 0, permissions: 0, tests: 0, targets: 0, slices: 0 };
  const issues: ImportIssue[] = [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { release: null, issues: [{ line: 1, level: 'error', message: `Not valid JSON: ${(e as Error).message}` }], counts };
  }
  const d = data as Partial<Release>;
  const err = (message: string) => issues.push({ line: 0, level: 'error', message });
  if (!d || typeof d !== 'object') err('Top level must be an object.');
  if (!d.targetOrg || !Array.isArray(d.targetOrg.components)) err('targetOrg.components must be an array of Type:ApiName strings.');
  if (!Array.isArray(d.slices) || !d.slices.length) err('slices must be a non-empty array.');
  (d.slices ?? []).forEach((s, i) => {
    const at = `slices[${i}]`;
    if (!s.id) err(`${at}.id is required.`);
    if (!Array.isArray(s.changes) || !s.changes.length) err(`${at}.changes must be a non-empty array.`);
    (s.changes ?? []).forEach((c, j) => {
      if (!METADATA_TYPES.includes(c.type)) err(`${at}.changes[${j}].type "${c.type}" is not supported.`);
      if (!ACTIONS.includes(c.action)) err(`${at}.changes[${j}].action must be add, modify or delete.`);
      if (!ORIGINS.includes(c.origin)) err(`${at}.changes[${j}].origin must be human or ai-assisted.`);
      if (!Array.isArray(c.dependsOn)) err(`${at}.changes[${j}].dependsOn must be an array.`);
      if (!c.diff || !Array.isArray(c.diff.before) || !Array.isArray(c.diff.after)) err(`${at}.changes[${j}].diff needs before[] and after[].`);
    });
    (s.permissions ?? []).forEach((p, j) => {
      if (!PERM_KINDS.includes(p.kind) || !ACCESS[p.kind].includes(p.before) || !ACCESS[p.kind].includes(p.after))
        err(`${at}.permissions[${j}] has an invalid kind or access level.`);
    });
    (s.tests ?? []).forEach((t, j) => {
      if (!TEST_KINDS.includes(t.kind) || !SCENARIOS.includes(t.scenario) || !RESULTS.includes(t.result))
        err(`${at}.tests[${j}] has an invalid kind, scenario or result.`);
    });
    counts.changes += s.changes?.length ?? 0;
    counts.permissions += s.permissions?.length ?? 0;
    counts.tests += s.tests?.length ?? 0;
  });
  counts.slices = d.slices?.length ?? 0;
  counts.targets = d.targetOrg?.components?.length ?? 0;
  if (issues.length) return { release: null, issues, counts };
  const release: Release = {
    id: d.id ?? 'imported',
    name: d.name ?? 'Imported release',
    source: 'import',
    targetOrg: d.targetOrg!,
    slices: d.slices!.map((s) => ({
      ...s,
      name: s.name ?? s.id,
      revision: s.revision ?? 1,
      description: s.description ?? 'Imported from JSON.',
      atomic: !!s.atomic,
      permissions: s.permissions ?? [],
      tests: s.tests ?? [],
      provenance: 'Imported by the user from a JSON file in this browser session.',
    })),
  };
  return { release, issues, counts };
}

export const SAMPLE_CSV = `record,slice,type,name,action,origin,depends_on,detail
target,,,CustomObject:Quote,,,,
target,,,CustomField:Quote.Discount__c,,,,
target,,,PermissionSet:Sales_Ops,,,,
slice,quote-approval,,Quote approval threshold,,,,atomic=false;description=Raise auto-approval threshold
change,quote-approval,Flow,Quote_Approval,modify,ai-assisted,CustomField:Quote.Discount__c;CustomField:Quote.Approval_Tier__c,summary=Auto-approve up to 15%
change,quote-approval,CustomField,Quote.Approval_Tier__c,add,human,CustomObject:Quote,after=Picklist(Auto|Manager|Director)
change,quote-approval,CustomField,Quote.Discount__c,modify,human,,before=Number(5);after=Number(3);populated=918
permission,quote-approval,field,Quote.Discount__c,,,,set=Sales_Ops;before=read;after=edit;assigned=Sales Ops team (synthetic)
test,quote-approval,flow,Approves 12% discount,,,Flow:Quote_Approval,scenario=happy-path;result=pass
`;

export const SAMPLE_JSON = JSON.stringify(
  {
    name: 'Imported JSON example',
    targetOrg: { name: 'Example target', components: ['CustomObject:Account', 'CustomField:Account.Industry'] },
    slices: [
      {
        id: 'account-health',
        name: 'Account health score',
        atomic: false,
        changes: [
          {
            id: 'j1',
            type: 'CustomField',
            apiName: 'Account.Health_Score__c',
            action: 'add',
            origin: 'human',
            author: 'Example author',
            summary: 'Numeric health score',
            dependsOn: ['CustomObject:Account'],
            diff: { before: [], after: ['Health_Score__c: Number(3)'] },
            field: { after: { dataType: 'Number', length: 3 }, populatedRecords: 0 },
          },
          {
            id: 'j2',
            type: 'ApexClass',
            apiName: 'HealthScoreJob',
            action: 'add',
            origin: 'ai-assisted',
            author: 'Example author',
            summary: 'Nightly score calculation',
            dependsOn: ['CustomField:Account.Health_Score__c', 'CustomField:Account.Industry'],
            diff: { before: [], after: ['public with sharing class HealthScoreJob implements Schedulable { /* ... */ }'] },
          },
        ],
        permissions: [],
        tests: [
          {
            id: 'jt1',
            name: 'HealthScoreJobTest',
            kind: 'apex',
            covers: ['ApexClass:HealthScoreJob'],
            scenario: 'negative',
            result: 'pass',
            coverage: 81,
            source: 'Example',
          },
        ],
      },
    ],
  },
  null,
  2,
);
