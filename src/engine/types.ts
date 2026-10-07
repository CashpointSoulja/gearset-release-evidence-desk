export type MetadataType =
  | 'CustomObject'
  | 'CustomField'
  | 'ApexClass'
  | 'ApexTrigger'
  | 'Flow'
  | 'PermissionSet'
  | 'GenAiPlannerBundle'
  | 'GenAiPlugin'
  | 'GenAiFunction'
  | 'GenAiPromptTemplate';

export const METADATA_TYPES: MetadataType[] = [
  'CustomObject',
  'CustomField',
  'ApexClass',
  'ApexTrigger',
  'Flow',
  'PermissionSet',
  'GenAiPlannerBundle',
  'GenAiPlugin',
  'GenAiFunction',
  'GenAiPromptTemplate',
];

export type ChangeAction = 'add' | 'modify' | 'delete';
export type Origin = 'human' | 'ai-assisted';

/** e.g. { dataType: 'Text', length: 255 } or { dataType: 'Picklist', values: ['Low','High'] } */
export interface FieldShape {
  dataType: string;
  length?: number;
  values?: string[];
}

export interface Change {
  id: string;
  type: MetadataType;
  apiName: string;
  action: ChangeAction;
  origin: Origin;
  author: string;
  summary: string;
  /** Component keys (`Type:ApiName`) this change needs at deploy time. */
  dependsOn: string[];
  diff: { before: string[]; after: string[] };
  field?: { before?: FieldShape; after?: FieldShape; populatedRecords: number };
  /** Apex test classes are evidence, not testable production code. */
  isTest?: boolean;
}

export type Access = 'none' | 'read' | 'edit' | 'viewAll' | 'modifyAll' | 'off' | 'on';
export type PermissionKind = 'object' | 'field' | 'system';

export interface PermissionDelta {
  id: string;
  permissionSet: string;
  kind: PermissionKind;
  /** Object API name, Object.Field, or system permission name. */
  target: string;
  before: Access;
  after: Access;
  assignedTo: string;
}

export type TestKind = 'apex' | 'flow' | 'agent-conversation' | 'prompt';
export type TestScenario = 'happy-path' | 'negative' | 'permission';
export type TestResult = 'pass' | 'fail' | 'not-run';

export interface TestRecord {
  id: string;
  name: string;
  kind: TestKind;
  covers: string[];
  scenario: TestScenario;
  result: TestResult;
  /** Apex line coverage percentage for the covered classes, when kind is apex. */
  coverage?: number;
  source: string;
}

export interface Slice {
  id: string;
  name: string;
  revision: number;
  description: string;
  /** Atomic slices ship whole or not at all (an agent missing one action is broken). */
  atomic: boolean;
  changes: Change[];
  permissions: PermissionDelta[];
  tests: TestRecord[];
  parentId?: string;
  provenance: string;
}

export interface TargetOrg {
  name: string;
  components: string[];
}

export interface Release {
  id: string;
  name: string;
  source: 'seed' | 'import';
  targetOrg: TargetOrg;
  slices: Slice[];
}

export type CheckId = 'missing-dependency' | 'destructive-field' | 'permission-widening' | 'incomplete-tests';

export const CHECK_LABELS: Record<CheckId, string> = {
  'missing-dependency': 'Missing dependency',
  'destructive-field': 'Destructive field change',
  'permission-widening': 'Permission widening',
  'incomplete-tests': 'Incomplete tests',
};

export type EvidenceRef =
  | { kind: 'diff'; changeId: string }
  | { kind: 'graph'; focus: string; missing?: string }
  | { kind: 'permission'; permId: string }
  | { kind: 'test'; component: string; testIds: string[] }
  | { kind: 'inventory'; component: string };

export type Severity = 'blocker' | 'review';

export interface Finding {
  id: string;
  check: CheckId;
  severity: Severity;
  changeId: string;
  title: string;
  why: string;
  rule: string;
  evidence: EvidenceRef[];
  overridable: boolean;
}

export interface Override {
  findingId: string;
  sliceId: string;
  reviewer: string;
  reason: string;
  at: string;
}

export type ChangeStatus = 'ready' | 'review' | 'held';
export type Decision = 'ready' | 'ready-with-holdbacks' | 'needs-review' | 'blocked';

export const keyOf = (c: Pick<Change, 'type' | 'apiName'>) => `${c.type}:${c.apiName}`;
