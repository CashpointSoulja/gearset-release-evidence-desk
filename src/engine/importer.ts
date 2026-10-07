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
export function parseCsv(text: string): { rows: string[][]; lines: number[]; unclosedQuoteLine?: number } {
  const rows: string[][] = [];
  const lines: number[] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let rowStart = 1;
  let quoteLine = 0;
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
    } else if (ch === '"') {
      inQuotes = true;
      quoteLine = line;
    }
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
  return inQuotes ? { rows, lines, unclosedQuoteLine: quoteLine } : { rows, lines };
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
  const { rows, lines, unclosedQuoteLine } = parseCsv(text.replace(/^\uFEFF/, ''));
  if (unclosedQuoteLine)
    return { release: null, issues: [{ line: unclosedQuoteLine, level: 'error', message: 'A quoted value opened here is never closed. Nothing was loaded.' }], counts };
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
      if (detail.test !== undefined && type !== 'ApexClass') return err('test=true is only valid on an ApexClass test class.');
      if (detail.test !== undefined && detail.test !== 'true') return err('test must be "true" when present.');
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

  for (const message of orphanPermissionWarnings([...slices.values()])) issues.push({ line: 1, level: 'warning', message });
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

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isKey = (v: unknown) => typeof v === 'string' && KEY_RE.test(v);
const optStr = (v: unknown) => v === undefined || typeof v === 'string';
const isShape = (v: unknown) =>
  v === undefined ||
  (isObj(v) &&
    isStr(v.dataType) &&
    (v.length === undefined || (Number.isInteger(v.length) && (v.length as number) >= 0)) &&
    (v.values === undefined || isStrArr(v.values)));
const oneOf = <T,>(list: readonly T[], v: unknown): v is T => list.includes(v as T);

/** Validates an untrusted value against the Release shape. Returns error messages; empty means valid. Never throws. */
export function validateRelease(data: unknown): string[] {
  const e: string[] = [];
  if (!isObj(data)) return ['Top level must be an object.'];
  if (!optStr(data.name) || !optStr(data.id)) e.push('name and id must be strings.');
  const t = data.targetOrg;
  if (!isObj(t) || !Array.isArray(t.components) || !t.components.every(isKey))
    e.push('targetOrg.components must be an array of Type:ApiName strings.');
  else if (!optStr(t.name)) e.push('targetOrg.name must be a string.');
  const slices = data.slices;
  if (!Array.isArray(slices) || !slices.length) {
    e.push('slices must be a non-empty array.');
    return e;
  }
  const sliceIds = new Set<string>();
  slices.forEach((s: unknown, i) => {
    const at = `slices[${i}]`;
    if (!isObj(s)) return e.push(`${at} must be an object.`);
    if (!isStr(s.id)) e.push(`${at}.id must be a non-empty string.`);
    else if (sliceIds.has(s.id)) e.push(`${at}.id "${s.id}" is used by another slice. Give each revision its own slice id.`);
    else sliceIds.add(s.id);
    if (!optStr(s.name) || !optStr(s.description) || !optStr(s.parentId) || !optStr(s.provenance))
      e.push(`${at} name, description, parentId and provenance must be strings.`);
    if (s.revision !== undefined && !(Number.isInteger(s.revision) && (s.revision as number) >= 1))
      e.push(`${at}.revision must be a whole number from 1.`);
    if (s.atomic !== undefined && typeof s.atomic !== 'boolean') e.push(`${at}.atomic must be true or false.`);

    if (!Array.isArray(s.changes) || !s.changes.length) e.push(`${at}.changes must be a non-empty array.`);
    const changeIds = new Set<string>();
    (Array.isArray(s.changes) ? s.changes : []).forEach((c: unknown, j) => {
      const ct = `${at}.changes[${j}]`;
      if (!isObj(c)) return e.push(`${ct} must be an object.`);
      if (!isStr(c.id)) e.push(`${ct}.id must be a non-empty string.`);
      else if (changeIds.has(c.id)) e.push(`${ct}.id "${c.id}" is used twice in this slice.`);
      else changeIds.add(c.id);
      if (!oneOf(METADATA_TYPES, c.type)) e.push(`${ct}.type "${String(c.type)}" is not supported.`);
      if (!isStr(c.apiName) || !/^[A-Za-z0-9_.]+$/.test(c.apiName)) e.push(`${ct}.apiName must be an API name.`);
      if (!oneOf(ACTIONS, c.action)) e.push(`${ct}.action must be add, modify or delete.`);
      if (!oneOf(ORIGINS, c.origin)) e.push(`${ct}.origin must be human or ai-assisted.`);
      if (!Array.isArray(c.dependsOn) || !c.dependsOn.every(isKey)) e.push(`${ct}.dependsOn must be an array of Type:ApiName strings.`);
      if (!isObj(c.diff) || !isStrArr(c.diff.before) || !isStrArr(c.diff.after)) e.push(`${ct}.diff needs before[] and after[] string arrays.`);
      if (!optStr(c.author) || !optStr(c.summary)) e.push(`${ct} author and summary must be strings.`);
      if (c.isTest !== undefined && typeof c.isTest !== 'boolean') e.push(`${ct}.isTest must be true or false.`);
      else if (c.isTest && c.type !== 'ApexClass') e.push(`${ct}.isTest is only valid on an ApexClass test class.`);
      if (
        c.field !== undefined &&
        !(isObj(c.field) && isShape(c.field.before) && isShape(c.field.after) && Number.isInteger(c.field.populatedRecords) && (c.field.populatedRecords as number) >= 0)
      )
        e.push(`${ct}.field needs before/after shapes ({ dataType, length?, values? }) and a whole-number populatedRecords.`);
    });

    if (s.permissions !== undefined && !Array.isArray(s.permissions)) e.push(`${at}.permissions must be an array.`);
    const permIds = new Set<string>();
    (Array.isArray(s.permissions) ? s.permissions : []).forEach((p: unknown, j) => {
      const pt = `${at}.permissions[${j}]`;
      if (!isObj(p)) return e.push(`${pt} must be an object.`);
      if (!isStr(p.id) || permIds.has(p.id)) e.push(`${pt}.id must be a unique non-empty string.`);
      else permIds.add(p.id);
      if (!isStr(p.permissionSet) || !isStr(p.target)) e.push(`${pt} needs permissionSet and target strings.`);
      if (!optStr(p.assignedTo)) e.push(`${pt}.assignedTo must be a string.`);
      if (!oneOf(PERM_KINDS, p.kind) || !oneOf(ACCESS[p.kind], p.before) || !oneOf(ACCESS[p.kind], p.after))
        e.push(`${pt} has an invalid kind or access level.`);
    });

    if (s.tests !== undefined && !Array.isArray(s.tests)) e.push(`${at}.tests must be an array.`);
    const testIds = new Set<string>();
    (Array.isArray(s.tests) ? s.tests : []).forEach((x: unknown, j) => {
      const tt = `${at}.tests[${j}]`;
      if (!isObj(x)) return e.push(`${tt} must be an object.`);
      if (!isStr(x.id) || testIds.has(x.id)) e.push(`${tt}.id must be a unique non-empty string.`);
      else testIds.add(x.id);
      if (!optStr(x.name) || !optStr(x.source)) e.push(`${tt} name and source must be strings.`);
      if (!oneOf(TEST_KINDS, x.kind) || !oneOf(SCENARIOS, x.scenario) || !oneOf(RESULTS, x.result))
        e.push(`${tt} has an invalid kind, scenario or result.`);
      if (!Array.isArray(x.covers) || !x.covers.length || !x.covers.every(isKey)) e.push(`${tt}.covers must be a non-empty array of Type:ApiName strings.`);
      if (x.coverage !== undefined && !(typeof x.coverage === 'number' && x.coverage >= 0 && x.coverage <= 100))
        e.push(`${tt}.coverage must be a number from 0 to 100.`);
    });
  });
  return e;
}

/** Warns when a permission delta has no PermissionSet change in its slice: its findings then hold the whole slice. */
function orphanPermissionWarnings(slices: Slice[]): string[] {
  const out: string[] = [];
  for (const s of slices) {
    const sets = new Set(s.changes.filter((c) => c.type === 'PermissionSet').map((c) => c.apiName));
    for (const set of new Set(s.permissions.map((p) => p.permissionSet)))
      if (!sets.has(set))
        out.push(`Slice "${s.id}" changes permissions in ${set} without a PermissionSet change row; any finding on them applies to the whole slice.`);
  }
  return out;
}

/** JSON import: the Release shape in src/engine/types.ts, validated field by field. Fails closed and never throws. */
export function importJson(text: string): ImportResult {
  const counts = { changes: 0, permissions: 0, tests: 0, targets: 0, slices: 0 };
  const fail = (message: string): ImportResult => ({ release: null, issues: [{ line: 0, level: 'error', message }], counts });
  try {
    let data: unknown;
    try {
      data = JSON.parse(text.replace(/^\uFEFF/, ''));
    } catch (e) {
      return fail(`Not valid JSON: ${(e as Error).message}`);
    }
    const errors = validateRelease(data);
    if (errors.length) return { release: null, issues: errors.map((message) => ({ line: 0, level: 'error' as const, message })), counts };
    const d = data as Release;
    const slices: Slice[] = d.slices.map((s) => ({
      id: s.id,
      name: s.name ?? s.id,
      revision: s.revision ?? 1,
      description: s.description ?? 'Imported from JSON.',
      atomic: !!s.atomic,
      parentId: s.parentId,
      changes: s.changes.map((c) => ({ ...c, author: c.author ?? 'Imported', summary: c.summary ?? `${c.action} ${c.type} ${c.apiName}` })),
      permissions: (s.permissions ?? []).map((p) => ({ ...p, assignedTo: p.assignedTo ?? 'users with this permission set' })),
      tests: (s.tests ?? []).map((t) => ({ ...t, name: t.name ?? t.id, source: t.source ?? 'Imported test record' })),
      provenance: 'Imported by the user from a JSON file in this browser session.',
    }));
    for (const s of slices) {
      counts.changes += s.changes.length;
      counts.permissions += s.permissions.length;
      counts.tests += s.tests.length;
    }
    counts.slices = slices.length;
    counts.targets = d.targetOrg.components.length;
    const release: Release = {
      id: d.id ?? 'imported',
      name: d.name ?? 'Imported release',
      source: 'import',
      targetOrg: { name: d.targetOrg.name ?? 'Imported target inventory', components: [...d.targetOrg.components] },
      slices,
    };
    const issues: ImportIssue[] = orphanPermissionWarnings(slices).map((message) => ({ line: 0, level: 'warning', message }));
    return { release, issues, counts };
  } catch (e) {
    return fail(`Could not read this file: ${(e as Error).message}`);
  }
}

/** Picks the parser from the content first; the file name only breaks a tie. */
export function importAuto(text: string, fileName = ''): ImportResult {
  const t = text.replace(/^\uFEFF/, '').trimStart();
  const looksJson = /^[{[]/.test(t) || (!/^record\s*,/i.test(t) && /\.json$/i.test(fileName));
  const name = fileName && !/\.json$/i.test(fileName) ? fileName.replace(/\.[^.]+$/, '') : 'Imported release';
  return looksJson ? importJson(text) : importCsv(text, name);
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
