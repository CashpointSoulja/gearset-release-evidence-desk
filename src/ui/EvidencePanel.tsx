import { useEffect, useRef } from 'react';
import type { SliceEvaluation } from '../engine/checks';
import { APEX_COVERAGE_MIN, isTestable, isWidening, testsFor } from '../engine/checks';
import type { Slice, TargetOrg, TestScenario } from '../engine/types';
import { keyOf } from '../engine/types';
import type { EvidenceTab, Focus } from './focus';
import { shortType, splitKey } from './focus';
import { Graph, GraphLegend } from './Graph';

const TABS: { id: EvidenceTab; label: string }[] = [
  { id: 'diff', label: 'Metadata diff' },
  { id: 'graph', label: 'Dependencies' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'tests', label: 'Tests' },
];

const SCENARIOS: { id: TestScenario; label: string }[] = [
  { id: 'happy-path', label: 'Happy path' },
  { id: 'negative', label: 'Negative' },
  { id: 'permission', label: 'Permission' },
];

const ACCESS_LABEL: Record<string, string> = {
  none: 'No access',
  read: 'Read',
  edit: 'Edit',
  viewAll: 'View All',
  modifyAll: 'Modify All',
  off: 'Off',
  on: 'On',
};

export function EvidencePanel(props: {
  slice: Slice;
  target: TargetOrg;
  ev: SliceEvaluation;
  focus: Focus;
  setFocus: (f: Focus) => void;
}) {
  const { slice, target, ev, focus, setFocus } = props;
  const panelRef = useRef<HTMLDivElement>(null);
  const byKey = new Map(slice.changes.map((c) => [keyOf(c), c]));

  useEffect(() => {
    if (focus.nonce === 0) return;
    const el = panelRef.current?.querySelector('.hl');
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focus]);

  const go = (f: Omit<Focus, 'nonce'>) => setFocus({ ...f, nonce: focus.nonce + 1 });
  const findingsFor = (changeId: string) => ev.open.filter((f) => f.changeId === changeId);
  const statusChip = (changeId: string) => {
    const s = ev.changes[changeId]?.status ?? 'ready';
    return <span className={`chip chip-${s}`}>{s === 'held' ? 'Held back' : s === 'review' ? 'Review' : 'Ready'}</span>;
  };

  const selChange = slice.changes.find((c) => c.id === focus.changeId) ?? slice.changes[0];

  return (
    <section className="card evidence" aria-labelledby="ev-h" id="evidence">
      <div className="card-head">
        <h2 id="ev-h">Evidence</h2>
        <span className="hint">Synthetic metadata · read-only</span>
      </div>
      <div className="tabs" role="tablist" aria-label="Evidence views">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={focus.tab === t.id}
            aria-controls={`panel-${t.id}`}
            className="tab"
            onClick={() => go({ tab: t.id })}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="tab-panel" role="tabpanel" id={`panel-${focus.tab}`} aria-labelledby={`tab-${focus.tab}`} ref={panelRef}>
        {focus.tab === 'diff' && selChange && (
          <div>
            <label htmlFor="diff-pick" className="field-label">Component</label>
            <select
              id="diff-pick"
              value={selChange.id}
              onChange={(e) => go({ tab: 'diff', changeId: e.target.value })}
            >
              {slice.changes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.action} · {shortType[c.type]} · {c.apiName}
                </option>
              ))}
            </select>
            <div className="diff-meta hl-soft">
              <div>
                <strong>{selChange.apiName}</strong> {statusChip(selChange.id)}
              </div>
              <div className="hint">
                {shortType[selChange.type]} · {selChange.action} · {selChange.origin === 'ai-assisted' ? 'AI-assisted draft' : 'Human-authored'} · {selChange.author}
              </div>
              <p>{selChange.summary}</p>
              {selChange.dependsOn.length > 0 && (
                <p className="deps">
                  Needs:{' '}
                  {selChange.dependsOn.map((d) => (
                    <button key={d} className="link" onClick={() => go({ tab: 'graph', component: d })}>
                      {d}
                    </button>
                  ))}
                </p>
              )}
            </div>
            <div className="diff" aria-label={`Diff for ${selChange.apiName}`}>
              <div className="diff-col">
                <div className="diff-h">Target (before)</div>
                <pre className="mono">
                  {selChange.diff.before.length ? selChange.diff.before.map((l, i) => <span key={i} className="del">- {l}{'\n'}</span>) : <span className="none">Not present in target</span>}
                </pre>
              </div>
              <div className="diff-col">
                <div className="diff-h">This slice (after)</div>
                <pre className="mono">
                  {selChange.diff.after.length ? selChange.diff.after.map((l, i) => <span key={i} className="add">+ {l}{'\n'}</span>) : <span className="none">Deleted by this slice</span>}
                </pre>
              </div>
            </div>
            {findingsFor(selChange.id).length > 0 && (
              <ul className="mini-findings">
                {findingsFor(selChange.id).map((f) => (
                  <li key={f.id} className={f.severity}>
                    <strong>{f.severity === 'blocker' ? 'Blocker' : 'Review'}:</strong> {f.title}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {focus.tab === 'graph' && (
          <div>
            <p className="hint">Arrows point from a component to what it needs. Select a box for details.</p>
            <GraphLegend />
            <Graph
              slice={slice}
              target={target}
              ev={ev}
              selected={focus.component}
              missing={focus.missing}
              onSelect={(k) => go({ tab: 'graph', component: k })}
            />
            {(focus.missing ?? focus.component) && (() => {
              const k = (focus.missing ?? focus.component)!;
              const c = byKey.get(k);
              const { type, name } = splitKey(k);
              const usedBy = slice.changes.filter((x) => x.dependsOn.includes(k));
              const inInv = target.components.includes(k);
              return (
                <div className="node-detail hl">
                  <h3>
                    {shortType[type] ?? type} <span className="mono">{name}</span>
                  </h3>
                  <p>
                    {c
                      ? <>Changed in this slice ({c.action}). {statusChip(c.id)}</>
                      : inInv
                        ? 'Not in this slice. Present in the target inventory, so dependants can rely on it.'
                        : <strong className="bad">Not in this slice and not in the target inventory. Anything that needs it will fail to deploy or fail at run time.</strong>}
                  </p>
                  {c && c.dependsOn.length > 0 && <p>Needs: {c.dependsOn.join(', ')}</p>}
                  {usedBy.length > 0 && <p>Needed by: {usedBy.map((u) => u.apiName).join(', ')}</p>}
                  {c && (
                    <button className="btn btn-secondary btn-sm" onClick={() => go({ tab: 'diff', changeId: c.id })}>
                      Open diff
                    </button>
                  )}
                </div>
              );
            })()}
            <h3 className="sub">Dependency list</h3>
            <ul className="dep-list">
              {slice.changes.filter((c) => c.action !== 'delete').flatMap((c) =>
                c.dependsOn.map((d) => {
                  const ok = byKey.has(d) ? byKey.get(d)!.action !== 'delete' : target.components.includes(d);
                  return (
                    <li key={c.id + d} className={ok ? '' : 'bad'}>
                      <span className="mono">{c.apiName}</span> needs <span className="mono">{d}</span>:{' '}
                      {ok ? (byKey.has(d) ? 'in this slice' : 'in target') : 'missing'}
                    </li>
                  );
                }),
              )}
            </ul>
            <details className="inventory" open={!!focus.inventory}>
              <summary>Target inventory ({target.components.length} components, synthetic)</summary>
              <p className="hint">{target.name}</p>
              {focus.inventory && !target.components.includes(focus.inventory) && (
                <p className="bad hl">
                  <span className="mono">{focus.inventory}</span> is not in the target inventory.
                </p>
              )}
              <ul className="mono inv-list">
                {target.components.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
            </details>
          </div>
        )}

        {focus.tab === 'permissions' && (
          <div>
            {slice.permissions.length === 0 ? (
              <p className="empty">This slice changes no permissions.</p>
            ) : (
              <div className="table-wrap">
                <table className="perm-table">
                  <caption className="visually-hidden">Permission changes in this slice</caption>
                  <thead>
                    <tr>
                      <th scope="col">Permission set</th>
                      <th scope="col">Grants on</th>
                      <th scope="col">Before → after</th>
                      <th scope="col">Who gets it</th>
                      <th scope="col">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slice.permissions.map((p) => {
                      const f = ev.findings.find((x) => x.check === 'permission-widening' && x.evidence.some((e) => e.kind === 'permission' && e.permId === p.id));
                      const open = f && ev.open.includes(f);
                      return (
                        <tr key={p.id} className={focus.permId === p.id ? 'hl' : ''}>
                          <td className="mono">{p.permissionSet}</td>
                          <td>
                            <span className="hint">{p.kind}</span> <span className="mono">{p.target}</span>
                          </td>
                          <td>
                            {ACCESS_LABEL[p.before]} → <strong>{ACCESS_LABEL[p.after]}</strong>
                          </td>
                          <td>{p.assignedTo}</td>
                          <td>
                            {!isWidening(p) ? (
                              <span className="chip chip-ready">Not wider</span>
                            ) : !f ? null : open ? (
                              <span className={`chip chip-${f.severity === 'blocker' ? 'held' : 'review'}`}>{f.severity === 'blocker' ? 'Blocker' : 'Needs sign-off'}</span>
                            ) : (
                              <span className="chip chip-ready">Signed off</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="hint">
              Rule: any increase in access needs a named sign-off. View All, Modify All and system permissions are blockers
              because they bypass record sharing.
            </p>
          </div>
        )}

        {focus.tab === 'tests' && (
          <div>
            <div className="table-wrap">
              <table className="test-matrix">
                <caption className="visually-hidden">Test evidence by component and scenario</caption>
                <thead>
                  <tr>
                    <th scope="col">Component</th>
                    {SCENARIOS.map((s) => (
                      <th scope="col" key={s.id}>{s.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slice.changes.filter(isTestable).map((c) => {
                    const k = keyOf(c);
                    const ts = testsFor(slice, k);
                    return (
                      <tr key={c.id} className={focus.component === k ? 'hl' : ''}>
                        <th scope="row">
                          <span className="hint">{shortType[c.type]}</span>
                          <br />
                          <span className="mono">{c.apiName}</span>
                          {c.origin === 'ai-assisted' && <span className="tag">AI-assisted</span>}
                        </th>
                        {SCENARIOS.map((s) => {
                          const t = ts.filter((x) => x.scenario === s.id);
                          const pass = t.some((x) => x.result === 'pass');
                          const fail = t.some((x) => x.result !== 'pass');
                          return (
                            <td key={s.id} className={fail ? 'cell-bad' : pass ? 'cell-ok' : 'cell-none'}>
                              {t.length === 0 ? '—' : fail ? 'Fail / not run' : 'Pass'}
                              {s.id === 'happy-path' && c.type === 'ApexClass' && pass && (
                                <span className="hint"> {Math.min(...t.map((x) => x.coverage ?? 0))}%</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="hint">
              Rule: every testable change needs a passing test; Apex needs {APEX_COVERAGE_MIN}% coverage; AI-assisted changes
              also need a negative or permission test, not only the happy path.
            </p>
            <h3 className="sub">Test records ({slice.tests.length})</h3>
            <ul className="test-list">
              {slice.tests.map((t) => (
                <li key={t.id} className={focus.testIds?.includes(t.id) ? 'hl' : ''}>
                  <span className={`chip chip-${t.result === 'pass' ? 'ready' : 'held'}`}>{t.result}</span>{' '}
                  <strong>{t.name}</strong>
                  <div className="hint">
                    {t.kind} · {t.scenario}
                    {t.coverage !== undefined ? ` · ${t.coverage}% coverage` : ''} · covers {t.covers.map((k) => splitKey(k).name).join(', ')} · {t.source}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
