import { useRef, useState } from 'react';
import type { ImportResult } from '../engine/importer';
import { CSV_HEADER, importCsv, importJson, SAMPLE_CSV, SAMPLE_JSON } from '../engine/importer';
import type { Release } from '../engine/types';
import { download } from './focus';

export function ImportPanel(props: { onImport: (r: Release, summary: string) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parse = (t: string, name: string) => {
    const looksJson = name.toLowerCase().endsWith('.json') || /^\s*[{[]/.test(t);
    const r = looksJson ? importJson(t) : importCsv(t, name ? name.replace(/\.[^.]+$/, '') : 'Imported release');
    setResult(r);
    return r;
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 512 * 1024) {
      setResult({ release: null, issues: [{ line: 0, level: 'error', message: 'File is larger than 512 KB. This demo is for small change sets.' }], counts: { changes: 0, permissions: 0, tests: 0, targets: 0, slices: 0 } });
      return;
    }
    const t = await f.text();
    setText(t);
    setFileName(f.name);
    parse(t, f.name);
  };

  const errors = result?.issues.filter((i) => i.level === 'error') ?? [];
  const warnings = result?.issues.filter((i) => i.level === 'warning') ?? [];

  return (
    <section className="card import-panel" aria-labelledby="import-h">
      <div className="card-head">
        <h2 id="import-h">Import a change set</h2>
        <button className="btn btn-ghost btn-sm" onClick={props.onClose}>
          Close
        </button>
      </div>
      <p>
        Load a small CSV or JSON file, or paste one below. It is parsed in this browser tab only; nothing is uploaded. The
        same four checks run on it.
      </p>
      <details className="format">
        <summary>CSV format</summary>
        <p>
          Columns: <code>{CSV_HEADER.join(',')}</code>. One row per record. <code>detail</code> holds{' '}
          <code>key=value</code> pairs separated by <code>;</code>.
        </p>
        <ul>
          <li><code>target</code>: a component already in the target org, in <code>name</code> as <code>Type:ApiName</code>.</li>
          <li><code>slice</code>: optional slice name; <code>atomic=true</code> means it ships whole or not at all.</li>
          <li><code>change</code>: metadata <code>type</code>, API <code>name</code>, <code>action</code> (add/modify/delete), <code>origin</code> (human/ai-assisted), <code>depends_on</code> as <code>Type:ApiName;…</code>. Fields can add <code>before=Text(255);after=Text(80);populated=1200</code>.</li>
          <li><code>permission</code>: <code>type</code> object/field/system, target in <code>name</code>, detail <code>set=…;before=…;after=…;assigned=…</code>.</li>
          <li><code>test</code>: <code>type</code> apex/flow/agent-conversation/prompt, components covered in <code>depends_on</code>, detail <code>scenario=happy-path|negative|permission;result=pass|fail|not-run;coverage=0-100</code>.</li>
        </ul>
        <button className="btn btn-secondary btn-sm" onClick={() => download('sample-change-set.csv', SAMPLE_CSV, 'text/csv')}>
          Download sample CSV
        </button>
      </details>
      <details className="format">
        <summary>JSON format</summary>
        <p>
          A release object with <code>targetOrg.components</code> and <code>slices[]</code>, each holding{' '}
          <code>changes</code>, <code>permissions</code> and <code>tests</code>. Field names match the CSV.
        </p>
        <button className="btn btn-secondary btn-sm" onClick={() => download('sample-change-set.json', SAMPLE_JSON, 'application/json')}>
          Download sample JSON
        </button>
      </details>
      <div className="import-actions">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          className="visually-hidden"
          id="import-file"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <label htmlFor="import-file" className="btn btn-secondary">
          Choose file…
        </label>
        <button className="btn btn-ghost" onClick={() => { setText(SAMPLE_CSV); setFileName('sample-change-set.csv'); parse(SAMPLE_CSV, 'sample-change-set.csv'); }}>
          Use sample CSV
        </button>
        {fileName && <span className="hint">{fileName}</span>}
      </div>
      <label htmlFor="import-text">Or paste CSV / JSON</label>
      <textarea
        id="import-text"
        className="mono"
        rows={7}
        value={text}
        spellCheck={false}
        onChange={(e) => { setText(e.target.value); setResult(null); }}
      />
      <div className="row-actions">
        <button className="btn btn-secondary" onClick={() => parse(text, fileName)} disabled={!text.trim()}>
          Validate
        </button>
        <button
          className="btn btn-primary"
          disabled={!result?.release}
          onClick={() => result?.release && props.onImport(result.release, `${result.counts.slices} slice(s), ${result.counts.changes} changes, ${result.counts.permissions} permission deltas, ${result.counts.tests} tests`)}
        >
          Load into desk
        </button>
      </div>
      {result && (
        <div className="import-result" role="status">
          {result.release ? (
            <p className="ok-line">
              Valid: {result.counts.slices} slice(s), {result.counts.changes} changes, {result.counts.permissions} permission
              deltas, {result.counts.tests} tests, {result.counts.targets} target components.
            </p>
          ) : (
            <p className="bad-line">Not loaded: fix {errors.length} error(s).</p>
          )}
          {[...errors, ...warnings].length > 0 && (
            <ul className="issues">
              {[...errors, ...warnings].map((i, k) => (
                <li key={k} className={i.level}>
                  <strong>{i.level === 'error' ? 'Error' : 'Warning'}</strong>
                  {i.line > 0 ? ` (line ${i.line})` : ''}: {i.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
