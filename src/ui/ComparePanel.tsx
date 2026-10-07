import { evaluateSlice, runChecks } from '../engine/checks';
import { buildReport, fmtRatio } from '../engine/report';
import type { Override, Release } from '../engine/types';

export function ComparePanel(props: {
  release: Release;
  overrides: Override[];
  aId: string;
  bId: string;
  setA: (id: string) => void;
  setB: (id: string) => void;
}) {
  const { release, overrides, aId, bId, setA, setB } = props;
  const a = release.slices.find((s) => s.id === aId) ?? release.slices[0];
  const b = release.slices.find((s) => s.id === bId) ?? release.slices[release.slices.length - 1];
  const ra = buildReport(release, a, overrides);
  const rb = buildReport(release, b, overrides);
  const fa = runChecks(a, release.targetOrg);
  const fb = runChecks(b, release.targetOrg);
  const ea = evaluateSlice(a, release.targetOrg, overrides);
  const eb = evaluateSlice(b, release.targetOrg, overrides);
  const norm = (id: string, sid: string) => id.split(`:${sid}:`).join(':');
  const idsB = new Set(fb.map((f) => norm(f.id, b.id)));
  const idsA = new Set(fa.map((f) => norm(f.id, a.id)));
  const resolved = fa.filter((f) => !idsB.has(norm(f.id, a.id)));
  const added = fb.filter((f) => !idsA.has(norm(f.id, b.id)));
  const carried = fb.filter((f) => idsA.has(norm(f.id, b.id)));
  const keysA = new Set(a.changes.map((c) => `${c.type}:${c.apiName}`));
  const keysB = new Set(b.changes.map((c) => `${c.type}:${c.apiName}`));
  const addedChanges = b.changes.filter((c) => !keysA.has(`${c.type}:${c.apiName}`));
  const removedChanges = a.changes.filter((c) => !keysB.has(`${c.type}:${c.apiName}`));

  const rows: [string, string, string][] = [
    ['Decision', ra.decision, rb.decision],
    ['Changes', String(a.changes.length), String(b.changes.length)],
    ['Deployable changes', fmtRatio(ra.metrics.deployableChanges), fmtRatio(rb.metrics.deployableChanges)],
    ['Dependencies resolved', fmtRatio(ra.metrics.dependenciesResolved), fmtRatio(rb.metrics.dependenciesResolved)],
    ['Test evidence complete', fmtRatio(ra.metrics.testEvidenceComplete), fmtRatio(rb.metrics.testEvidenceComplete)],
    ['Permission deltas widening access', fmtRatio(ra.metrics.permissionWidenings), fmtRatio(rb.metrics.permissionWidenings)],
    ['Open findings', `${ea.open.length} (${ea.open.filter((f) => f.severity === 'blocker').length} blockers)`, `${eb.open.length} (${eb.open.filter((f) => f.severity === 'blocker').length} blockers)`],
    ...ra.gates.map((g, i): [string, string, string] => [
      `Gate: ${g.label}`,
      g.passed ? 'Pass' : `Fail (${g.open})`,
      rb.gates[i].passed ? 'Pass' : `Fail (${rb.gates[i].open})`,
    ]),
  ];

  const cls = (v: string) => (/^(Pass|Ready to promote)/.test(v) ? 'ok' : /^(Fail|Blocked)/.test(v) ? 'bad' : '');

  return (
    <section className="card compare" aria-labelledby="cmp-h">
      <div className="card-head">
        <h2 id="cmp-h">Compare release slices</h2>
      </div>
      <div className="cmp-pickers">
        <div>
          <label htmlFor="cmp-a" className="field-label">Slice A</label>
          <select id="cmp-a" value={a.id} onChange={(e) => setA(e.target.value)}>
            {release.slices.map((s) => (
              <option key={s.id} value={s.id}>{s.name} · rev {s.revision}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cmp-b" className="field-label">Slice B</label>
          <select id="cmp-b" value={b.id} onChange={(e) => setB(e.target.value)}>
            {release.slices.map((s) => (
              <option key={s.id} value={s.id}>{s.name} · rev {s.revision}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="table-wrap">
        <table className="cmp-table">
          <thead>
            <tr>
              <th scope="col">Measure</th>
              <th scope="col">A · rev {a.revision}</th>
              <th scope="col">B · rev {b.revision}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([k, va, vb]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td className={cls(va)}>{va}</td>
                <td className={cls(vb)}>{vb}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cmp-lists">
        <div>
          <h3 className="sub">What B changes</h3>
          {addedChanges.length === 0 && removedChanges.length === 0 && <p className="empty">Same components.</p>}
          <ul>
            {addedChanges.map((c) => <li key={c.id}>+ adds <span className="mono">{c.type}:{c.apiName}</span></li>)}
            {removedChanges.map((c) => <li key={c.id}>− drops <span className="mono">{c.type}:{c.apiName}</span></li>)}
            {b.permissions.filter((p) => { const o = a.permissions.find((x) => x.id === p.id); return o && o.after !== p.after; }).map((p) => (
              <li key={p.id}>~ changes <span className="mono">{p.permissionSet}</span> on {p.target} to {p.after}</li>
            ))}
            {b.tests.length !== a.tests.length && <li>Tests: {a.tests.length} → {b.tests.length}</li>}
          </ul>
        </div>
        <div>
          <h3 className="sub">Findings</h3>
          <ul>
            <li className="ok">Resolved in B: {resolved.length}</li>
            <li className={carried.length ? 'warn' : ''}>Still present: {carried.length}{carried.length ? ` (${carried.map((f) => f.title).join('; ')})` : ''}</li>
            <li className={added.length ? 'bad' : ''}>New or changed in B: {added.length}{added.length ? ` (${added.map((f) => f.title).join('; ')})` : ''}</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
