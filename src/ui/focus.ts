import type { EvidenceRef } from '../engine/types';

export type EvidenceTab = 'diff' | 'graph' | 'permissions' | 'tests';

export interface Focus {
  tab: EvidenceTab;
  changeId?: string;
  component?: string;
  missing?: string;
  permId?: string;
  testIds?: string[];
  inventory?: string;
  nonce: number;
}

let n = 0;
export function focusFor(ref: EvidenceRef): Focus {
  n++;
  switch (ref.kind) {
    case 'diff':
      return { tab: 'diff', changeId: ref.changeId, nonce: n };
    case 'graph':
      return { tab: 'graph', component: ref.focus, missing: ref.missing, nonce: n };
    case 'permission':
      return { tab: 'permissions', permId: ref.permId, nonce: n };
    case 'test':
      return { tab: 'tests', component: ref.component, testIds: ref.testIds, nonce: n };
    case 'inventory':
      return { tab: 'graph', inventory: ref.component, component: ref.component, nonce: n };
  }
}

export const EVIDENCE_LABEL: Record<EvidenceRef['kind'], string> = {
  diff: 'Metadata diff',
  graph: 'Dependency graph',
  permission: 'Permission impact',
  test: 'Test evidence',
  inventory: 'Target inventory',
};

export function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const shortType: Record<string, string> = {
  CustomObject: 'Object',
  CustomField: 'Field',
  ApexClass: 'Apex class',
  ApexTrigger: 'Apex trigger',
  Flow: 'Flow',
  PermissionSet: 'Permission set',
  GenAiPlannerBundle: 'Agent',
  GenAiPlugin: 'Agent topic',
  GenAiFunction: 'Agent action',
  GenAiPromptTemplate: 'Prompt template',
};

export function splitKey(key: string) {
  const i = key.indexOf(':');
  return { type: key.slice(0, i), name: key.slice(i + 1) };
}
