import { useEffect, useMemo, useState } from 'react';
import { DECISION_LABELS, evaluateSlice } from './engine/checks';
import type { SliceEvaluation } from './engine/checks';
import { buildReport, decisionMemo, DISCLAIMER, fmtRatio, reportCsv } from './engine/report';
import { remediationFor, seedRelease } from './engine/seed';
import type { Finding, Override, Release, Slice } from './engine/types';
import { CHECK_LABELS } from './engine/types';
import { ComparePanel } from './ui/ComparePanel';
import { EvidencePanel } from './ui/EvidencePanel';
import type { Focus } from './ui/focus';
import { download, EVIDENCE_LABEL, focusFor, shortType } from './ui/focus';
import { ImportPanel } from './ui/ImportPanel';
import { OverrideForm } from './ui/OverrideForm';

type View = 'review' | 'compare' | 'export';
interface LogEntry {
  at: string;
  text: string;
}
interface Saved {
  release: Release | null;
  sliceId: string;
  overrides: Override[];
  log: LogEntry[];
}

const STORE = 'release-evidence-desk:v1';
const EMPTY: Saved = { release: null, sliceId: '', overrides: [], log: [] };

function load(): Saved {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return EMPTY;
    const s = JSON.parse(raw) as Saved;
    return s && 'release' in s ? s : EMPTY;
  } catch {
    return EMPTY;
  }
}

const now = () => new Date().toISOString();
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const DECISION_TEXT = (s: Slice, ev: SliceEvaluation) =>
  ({
    blocked: `Do not promote. ${ev.held.length} of ${s.changes.length} changes are held back${s.atomic ? ' and this slice is atomic, so nothing ships' : ''}.`,
    'needs-review': `Not yet. ${ev.review.length} change${ev.review.length > 1 ? 's need' : ' needs'} a named reviewer to sign off.`,
    'ready-with-holdbacks': `Promote ${ev.deployable.length} of ${s.changes.length} changes. ${ev.held.length} protected change${ev.held.length > 1 ? 's stay' : ' stays'} out of the package.`,
    ready: `Promote all ${s.changes.length} changes. Every gate passes.`,
  })[ev.decision];

export default function App() {
  const initial = useMemo(load, []);
  const [release, setRelease] = useState<Release | null>(initial.release);
  const [sliceId, setSliceId] = useState(initial.sliceId);
  const [overrides, setOverrides] = useState<Override[]>(initial.overrides);
  const [log, setLog] = useState<LogEntry[]>(initial.log);
  const [view, setView] = useState<View>('review');
  const [focus, setFocus] = useState<Focus>({ tab: 'graph', nonce: 0 });
  const [overriding, setOverriding] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [cmp, setCmp] = useState<{ a: string; b: string }>({ a: '', b: '' });
  const [announce, setAnnounce] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ release, sliceId, overrides, log } satisfies Saved));
    } catch {
      /* storage unavailable: the desk still works for this tab */
    }
  }, [release, sliceId, overrides, log]);

  const addLog = (text: string) => {
    setLog((l) => [{ at: now(), text }, ...l].slice(0, 40));
    setAnnounce(text);
  };

  const slice = release?.slices.find((s) => s.id === sliceId) ?? release?.slices[0];
  const ev = useMemo(() => (release && slice ? evaluateSlice(slice, release.targetOrg, overrides) : null), [release, slice, overrides]);
  const evals = useMemo(
    () => new Map((release?.slices ?? []).map((s) => [s.id, evaluateSlice(s, release!.targetOrg, overrides)])),
    [release, overrides],
  );

  const loadRelease = (r: Release, msg: string) => {
    setRelease(r);
    setSliceId(r.slices[0].id);
    setOverrides([]);
    setCmp({ a: r.slices[0].id, b: r.slices[Math.min(1, r.slices.length - 1)].id });
    setView('review');
    setOverriding(null);
    setShowImport(false);
    setFocus({ tab: 'graph', nonce: 0 });
    const total = r.slices.reduce((n, s) => n + evaluateSlice(s, r.targetOrg, []).findings.length, 0);
    addLog(`${msg} Checks ran in this browser: ${total} findings across ${r.slices.length} slice(s).`);
  };

  const reset = () => {
    setRelease(null);
    setSliceId('');
    setOverrides([]);
    setLog([]);
    setView('review');
    setOverriding(null);
    setShowImport(false);
    setFocus({ tab: 'graph', nonce: 0 });
    setAnnounce('Workspace reset. No release loaded.');
    try {
      localStorage.removeItem(STORE);
    } catch {
      /* ignore */
    }
  };

  const remediation = slice ? remediationFor(slice.id) : null;
  const remediationLoaded = !!(remediation && release?.slices.some((s) => s.id === remediation.id));

  const applyRemediation = () => {
    if (!release || !slice || !remediation) return;
    if (!remediationLoaded) {
      const idx = release.slices.findIndex((s) => s.id === slice.id);
      const slices = [...release.slices];
      slices.splice(idx + 1, 0, remediation);
      setRelease({ ...release, slices });
      addLog(`Loaded revision ${remediation.revision} of "${remediation.name}" (pre-written fixture): adds missing dependencies, narrows access and adds negative and permission tests.`);
    }
    setCmp({ a: slice.id, b: remediation.id });
    setSliceId(remediation.id);
    setOverriding(null);
    setFocus({ tab: 'graph', nonce: focus.nonce + 1 });
  };

  const showEvidence = (f: Focus) => {
    setFocus(f);
    if (window.innerWidth < 1100) setTimeout(() => document.getElementById('evidence')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  };

  const saveOverride = (o: Override, f: Finding) => {
    setOverrides((list) => [...list.filter((x) => !(x.sliceId === o.sliceId && x.findingId === o.findingId)), o]);
    setOverriding(null);
    addLog(`${o.reviewer} signed off "${f.title}". Reason: ${o.reason}`);
  };
  const undoOverride = (o: Override, f: Finding) => {
    setOverrides((list) => list.filter((x) => x !== o));
    addLog(`Sign-off withdrawn for "${f.title}".`);
  };

  const exportFile = (kind: 'memo' | 'json' | 'csv') => {
    if (!release || !slice) return;
    const base = `${slice.id}-rev${slice.revision}`;
    if (kind === 'memo') download(`${base}-decision-memo.md`, decisionMemo(release, slice, overrides, now()), 'text/markdown');
    if (kind === 'json') download(`${base}-readiness-report.json`, JSON.stringify({ generatedAt: now(), ...buildReport(release, slice, overrides) }, null, 2), 'application/json');
    if (kind === 'csv') download(`${base}-change-status.csv`, reportCsv(buildReport(release, slice, overrides)), 'text/csv');
    addLog(`Exported ${kind === 'memo' ? 'decision memo (.md)' : kind === 'json' ? 'readiness report (.json)' : 'change status (.csv)'} for "${slice.name}" rev ${slice.revision}.`);
  };

  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>
      <header className="topbar">
        <img src="./brand/gearset-logo.svg" alt="Gearset" className="logo" width={132} height={30} />
        <p className="affiliation">
          Independent concept by Ayo Ahmed. Not affiliated with Gearset.
        </p>
      </header>
      <div className="productbar">
        <div className="productbar-inner">
          <div>
            <div className="eyebrow">Release review</div>
            <h1>Release Evidence Desk</h1>
          </div>
          <div className="pb-actions">
            {release?.source === 'import' && (
              <button className="btn btn-onDark" onClick={() => loadRelease(seedRelease(), 'Loaded the seed release.')}>Load seed</button>
            )}
            <button className="btn btn-onDark" onClick={() => setShowImport((v) => !v)} aria-expanded={showImport}>
              Import CSV / JSON
            </button>
            <button className="btn btn-onDark btn-quiet" onClick={reset}>Reset</button>
          </div>
        </div>
      </div>
      <div className="sim-banner" role="note">
        <strong>Simulation.</strong> Fictional metadata, people and test results. No Salesforce org is connected and nothing is
        deployed. Checks are fixed rules running in your browser.
      </div>
      <div className="visually-hidden" aria-live="polite">{announce}</div>

      <main id="main" className="main">
        {showImport && <ImportPanel onClose={() => setShowImport(false)} onImport={(r, s) => loadRelease(r, `Imported ${s}.`)} />}

        {!release && !showImport && (
          <section className="card intro" aria-labelledby="intro-h">
            <div className="intro-grid">
            <div>
            <h2 id="intro-h">Will this Salesforce release break something it did not test?</h2>
            <p className="lede">
              An AI-assisted change can pass its happy-path demo and still fail at release because it needs a component
              nobody shipped, grants more access than intended, or was never tested against a refusal case. This desk reads
              a release slice, runs four fixed checks, and shows the evidence behind every finding before anyone promotes it.
            </p>
            <ol className="steps">
              <li><strong>Load</strong> the seed release or import a small CSV/JSON change set.</li>
              <li><strong>Check</strong> for missing dependencies, destructive field changes, permission widening and incomplete tests.</li>
              <li><strong>Decide</strong>: protect blocked changes, sign off reviewable risks with a reason, compare revisions.</li>
              <li><strong>Export</strong> a deployment decision memo and a measurable readiness report.</li>
            </ol>
            <div className="row-actions">
              <button className="btn btn-primary btn-lg" onClick={() => loadRelease(seedRelease(), 'Loaded the seed release.')}>
                Load seed release
              </button>
              <button className="btn btn-secondary btn-lg" onClick={() => setShowImport(true)}>Import a change set</button>
            </div>
            </div>
            <aside className="why-care" aria-labelledby="why-h">
              <h3 id="why-h">In 30 seconds</h3>
              <p>
                Teams now ship Salesforce changes that were partly drafted by AI. The demo works, so the change looks done.
                The release then fails because an Apex class was never added, a permission set quietly grants Modify All, or
                nobody tested what happens when the agent should say no.
              </p>
              <p>
                This desk catches those four problems before promotion, shows the exact diff, graph edge, permission or test
                behind each one, and records who accepted any remaining risk and why.
              </p>
              <p><strong>Why a customer cares:</strong> fewer failed or rolled-back releases, no surprise data loss or access
                creep, and an audit-ready reason for every go/no-go call.</p>
              <p className="hint">Seed data is fictional. Nothing connects to Salesforce.</p>
            </aside>
            </div>
          </section>
        )}

        {release && slice && ev && (
          <>
            <section className="release-strip" aria-label="Release">
              <div className="rs-meta">
                <h2>{release.name}</h2>
                <p className="hint">
                  Target: {release.targetOrg.name} · Source: {release.source === 'seed' ? 'built-in synthetic seed' : 'your import (this tab only)'}
                </p>
              </div>
              <ul className="slice-list" aria-label="Release slices">
                {release.slices.map((s) => {
                  const e = evals.get(s.id)!;
                  return (
                    <li key={s.id}>
                    <button
                      className={`slice-card${s.id === slice.id ? ' active' : ''}`}
                      aria-current={s.id === slice.id}
                      onClick={() => { setSliceId(s.id); setOverriding(null); setView((v) => (v === 'compare' ? 'review' : v)); }}
                    >
                      <span className="sc-name">{s.name}</span>
                      <span className="sc-sub">Rev {s.revision} · {s.changes.length} changes{s.atomic ? ' · atomic' : ''}</span>
                      <span className={`chip chip-d-${e.decision}`}>{DECISION_LABELS[e.decision]}</span>
                    </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <nav className="views" aria-label="Workspace views">
              {(['review', 'compare', 'export'] as View[]).map((v) => (
                <button key={v} className={`view-btn${view === v ? ' active' : ''}`} aria-current={view === v ? 'page' : undefined} onClick={() => setView(v)} disabled={v === 'compare' && release.slices.length < 2}>
                  {v === 'review' ? 'Review slice' : v === 'compare' ? 'Compare slices' : 'Export decision'}
                </button>
              ))}
            </nav>

            {view === 'review' && (
              <>
                <section className={`decision decision-${ev.decision}`} aria-labelledby="dec-h">
                  <div className="dec-main">
                    <div className="eyebrow">
                      {slice.name} · revision {slice.revision}
                    </div>
                    <h2 id="dec-h">{DECISION_LABELS[ev.decision]}</h2>
                    <p>{DECISION_TEXT(slice, ev)}</p>
                    <p className="hint dec-desc">{slice.description}</p>
                    <div className="dec-counts">
                      <span><strong>{ev.deployable.length}</strong> ready</span>
                      <span><strong>{ev.review.length}</strong> need review</span>
                      <span><strong>{ev.held.length}</strong> held back</span>
                    </div>
                  </div>
                  <ul className="gates" aria-label="Release gates">
                    {(Object.keys(CHECK_LABELS) as (keyof typeof CHECK_LABELS)[]).map((c) => {
                      const all = ev.findings.filter((f) => f.check === c);
                      const open = ev.open.filter((f) => f.check === c);
                      const blockers = open.filter((f) => f.severity === 'blocker').length;
                      const state = open.length === 0 ? 'pass' : blockers ? 'fail' : 'review';
                      return (
                        <li key={c} className={`gate gate-${state}`}>
                          <span className="gate-label">{CHECK_LABELS[c]}</span>
                          <span className="gate-val">
                            {state === 'pass' ? (all.length ? `Pass · ${all.length} signed off` : 'Pass') : state === 'fail' ? `${blockers} blocker${blockers > 1 ? 's' : ''}${open.length > blockers ? ` + ${open.length - blockers} review` : ''}` : `${open.length} to review`}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {remediation && (
                    <div className="remediation">
                      <p>
                        <strong>Revision {remediation.revision} is available.</strong> A pre-written fixture that adds the missing
                        Apex service and field, narrows the agent&rsquo;s access, and adds negative and permission tests.
                      </p>
                      <button className="btn btn-cta" onClick={applyRemediation}>
                        {remediationLoaded ? `Open revision ${remediation.revision}` : `Load revision ${remediation.revision} and re-check`}
                      </button>
                    </div>
                  )}
                  {slice.parentId && (
                    <div className="remediation remediation-quiet">
                      <p>Revision of an earlier slice. See what changed side by side.</p>
                      <button className="btn btn-secondary" onClick={() => { setCmp({ a: slice.parentId!, b: slice.id }); setView('compare'); }}>
                        Compare with revision {slice.revision - 1}
                      </button>
                    </div>
                  )}
                </section>

                <div className="review-grid">
                  <div className="col">
                    <section className="card" aria-labelledby="f-h">
                      <div className="card-head">
                        <h2 id="f-h">Findings <span className="count">{ev.findings.length}</span></h2>
                        <span className="hint">{ev.open.length} open</span>
                      </div>
                      {ev.findings.length === 0 && <p className="empty">No findings. All four checks pass.</p>}
                      <ul className="findings">
                        {ev.findings.map((f) => {
                          const o = overrides.find((x) => x.sliceId === slice.id && x.findingId === f.id);
                          const accepted = !!o && f.overridable;
                          const change = slice.changes.find((c) => c.id === f.changeId);
                          return (
                            <li key={f.id} className={`finding ${accepted ? 'accepted' : f.severity}`}>
                              <div className="f-top">
                                <span className={`chip ${accepted ? 'chip-ready' : f.severity === 'blocker' ? 'chip-held' : 'chip-review'}`}>
                                  {accepted ? 'Signed off' : f.severity === 'blocker' ? 'Blocker' : 'Review'}
                                </span>
                                <span className="f-check">{CHECK_LABELS[f.check]}</span>
                                {change?.origin === 'ai-assisted' && <span className="tag">AI-assisted</span>}
                              </div>
                              <h3 className="f-title">{f.title}</h3>
                              <p className="f-why"><strong>Why it matters:</strong> {f.why}</p>
                              <p className="f-rule"><strong>Rule:</strong> {f.rule}</p>
                              <div className="f-evidence" aria-label="Evidence">
                                {f.evidence.map((e, i) => (
                                  <button key={i} className="ev-btn" onClick={() => showEvidence(focusFor(e))}>
                                    {EVIDENCE_LABEL[e.kind]}
                                  </button>
                                ))}
                              </div>
                              {accepted && o && (
                                <div className="signed">
                                  <p>
                                    Signed off by <strong>{o.reviewer}</strong> at {time(o.at)}: {o.reason}
                                  </p>
                                  <button className="btn btn-ghost btn-sm" onClick={() => undoOverride(o, f)}>Withdraw</button>
                                </div>
                              )}
                              {!accepted && f.overridable && overriding !== f.id && (
                                <button className="btn btn-secondary btn-sm" onClick={() => setOverriding(f.id)}>
                                  Sign off with reason…
                                </button>
                              )}
                              {!f.overridable && (
                                <p className="locked">Protected: cannot be signed off. Change the slice to resolve it.</p>
                              )}
                              {overriding === f.id && (
                                <OverrideForm finding={f} sliceId={slice.id} onSave={(o2) => saveOverride(o2, f)} onCancel={() => setOverriding(null)} />
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </section>

                    <section className="card" aria-labelledby="c-h">
                      <div className="card-head">
                        <h2 id="c-h">Changes in this slice <span className="count">{slice.changes.length}</span></h2>
                      </div>
                      <ul className="changes">
                        {slice.changes.map((c) => {
                          const ce = ev.changes[c.id];
                          return (
                            <li key={c.id} className={`change change-${ce.status}`}>
                              <button className="change-btn" onClick={() => showEvidence({ tab: 'diff', changeId: c.id, nonce: focus.nonce + 1 })}>
                                <span className="ch-type">{shortType[c.type]} · {c.action}</span>
                                <span className="ch-name mono">{c.apiName}</span>
                                <span className={`chip chip-${ce.status}`}>{ce.status === 'held' ? 'Held back' : ce.status === 'review' ? 'Review' : 'Ready'}</span>
                              </button>
                              {ce.reasons.length > 0 && <p className="ch-reasons">{ce.reasons.join(' · ')}</p>}
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  </div>
                  <div className="col col-sticky">
                    <EvidencePanel slice={slice} target={release.targetOrg} ev={ev} focus={focus} setFocus={setFocus} />
                  </div>
                </div>
              </>
            )}

            {view === 'compare' && (
              <ComparePanel
                release={release}
                overrides={overrides}
                aId={cmp.a || release.slices[0].id}
                bId={cmp.b || release.slices[release.slices.length - 1].id}
                setA={(a) => setCmp((c) => ({ ...c, a }))}
                setB={(b) => setCmp((c) => ({ ...c, b }))}
              />
            )}

            {view === 'export' && (() => {
              const r = buildReport(release, slice, overrides);
              const m = r.metrics;
              return (
                <section className="card export" aria-labelledby="x-h">
                  <div className="card-head">
                    <h2 id="x-h">Export decision for {slice.name} · rev {slice.revision}</h2>
                    <span className={`chip chip-d-${r.decisionCode}`}>{r.decision}</span>
                  </div>
                  <p className="hint">{DISCLAIMER} Exports describe a review decision; they do not schedule or run a deployment.</p>
                  <div className="row-actions">
                    <button className="btn btn-primary" onClick={() => exportFile('memo')}>Download decision memo (.md)</button>
                    <button className="btn btn-secondary" onClick={() => exportFile('json')}>Readiness report (.json)</button>
                    <button className="btn btn-secondary" onClick={() => exportFile('csv')}>Change status (.csv)</button>
                  </div>
                  <h3 className="sub">Readiness measures</h3>
                  <dl className="metrics">
                    <div><dt>Deployable changes</dt><dd>{fmtRatio(m.deployableChanges)}</dd></div>
                    <div><dt>Dependencies resolved</dt><dd>{fmtRatio(m.dependenciesResolved)}</dd></div>
                    <div><dt>Test evidence complete</dt><dd>{fmtRatio(m.testEvidenceComplete)}</dd></div>
                    <div><dt>Permission deltas widening access</dt><dd>{fmtRatio(m.permissionWidenings)}</dd></div>
                    <div><dt>Destructive changes held back</dt><dd>{fmtRatio(m.destructiveProtected)}</dd></div>
                    <div><dt>Findings still open</dt><dd>{fmtRatio(m.findingsOpen)}</dd></div>
                    <div><dt>AI-assisted changes</dt><dd>{fmtRatio(m.aiAssistedChanges)}</dd></div>
                    <div><dt>Human sign-offs recorded</dt><dd>{m.overrides}</dd></div>
                  </dl>
                  <h3 className="sub">Memo preview</h3>
                  <pre className="memo mono" tabIndex={0} aria-label="Decision memo preview">{decisionMemo(release, slice, overrides, '(set on download)')}</pre>
                </section>
              );
            })()}

            <section className="card log" aria-labelledby="log-h">
              <div className="card-head">
                <h2 id="log-h">Review log</h2>
                <span className="hint">This browser only</span>
              </div>
              {log.length === 0 ? <p className="empty">No actions yet.</p> : (
                <ol className="log-list">
                  {log.map((l, i) => (
                    <li key={i}><time dateTime={l.at}>{time(l.at)}</time> {l.text}</li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </main>
      <footer className="footer">
        <p>
          Independent concept by Ayo Ahmed. Not affiliated with, endorsed by or connected to Gearset. Gearset and its logo
          belong to their owner and appear here only to show the concept in context. All data is synthetic.
        </p>
        <p>
          <a href="https://github.com/CashpointSoulja/gearset-release-evidence-desk">Source and product docs</a>
        </p>
      </footer>
    </div>
  );
}


