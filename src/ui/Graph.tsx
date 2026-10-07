import { useEffect, useMemo, useRef } from 'react';
import type { SliceEvaluation } from '../engine/checks';
import type { Slice, TargetOrg } from '../engine/types';
import { keyOf } from '../engine/types';
import { shortType, splitKey } from './focus';

type NodeState = 'ready' | 'review' | 'held' | 'in-org' | 'missing';

interface GNode {
  key: string;
  state: NodeState;
  inSlice: boolean;
  deleted: boolean;
  deps: string[];
  x: number;
  y: number;
}

const W = 178;
const H = 50;
const GX = 14;
const GY = 46;
const PAD = 16;

function buildGraph(slice: Slice, target: TargetOrg, ev: SliceEvaluation) {
  const inv = new Set(target.components);
  const byKey = new Map(slice.changes.map((c) => [keyOf(c), c]));
  const keys = new Set<string>(byKey.keys());
  for (const c of slice.changes) for (const d of c.dependsOn) keys.add(d);

  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (k: string): number => {
    if (depth.has(k)) return depth.get(k)!;
    const c = byKey.get(k);
    if (!c || visiting.has(k)) return 0;
    visiting.add(k);
    const d = c.dependsOn.length ? 1 + Math.max(...c.dependsOn.map(depthOf)) : 0;
    visiting.delete(k);
    depth.set(k, d);
    return d;
  };
  keys.forEach(depthOf);
  const max = Math.max(0, ...[...keys].map(depthOf));

  const rows: string[][] = Array.from({ length: max + 1 }, () => []);
  for (const k of [...keys].sort()) rows[max - depthOf(k)].push(k);
  const width = Math.max(...rows.map((r) => r.length)) * (W + GX) - GX + PAD * 2;

  const nodes = new Map<string, GNode>();
  rows.forEach((row, ri) => {
    const rowW = row.length * (W + GX) - GX;
    row.forEach((k, i) => {
      const c = byKey.get(k);
      const deletedInSlice = c?.action === 'delete';
      let state: NodeState;
      if (c) state = ev.changes[c.id].status;
      else state = inv.has(k) ? 'in-org' : 'missing';
      nodes.set(k, {
        key: k,
        state,
        inSlice: !!c,
        deleted: !!deletedInSlice,
        deps: c && !deletedInSlice ? c.dependsOn : [],
        x: (width - rowW) / 2 + i * (W + GX),
        y: PAD + ri * (H + GY),
      });
    });
  });
  // A dependency on something this slice deletes is effectively missing.
  for (const n of nodes.values()) for (const d of n.deps) if (nodes.get(d)?.deleted) nodes.get(d)!.state = 'missing';
  const height = PAD * 2 + rows.length * (H + GY) - GY;
  return { nodes, width, height };
}

const STATE_LABEL: Record<NodeState, string> = {
  ready: 'In slice · ready',
  review: 'In slice · needs review',
  held: 'In slice · held back',
  'in-org': 'Already in target',
  missing: 'Missing',
};

export function Graph(props: {
  slice: Slice;
  target: TargetOrg;
  ev: SliceEvaluation;
  selected?: string;
  missing?: string;
  onSelect: (key: string) => void;
}) {
  const { slice, target, ev, selected, missing, onSelect } = props;
  const g = useMemo(() => buildGraph(slice, target, ev), [slice, target, ev]);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selected || !wrap.current) return;
    const n = g.nodes.get(selected);
    if (!n) return;
    const el = wrap.current;
    el.scrollTo({ left: Math.max(0, n.x + W / 2 - el.clientWidth / 2), behavior: 'smooth' });
  }, [selected, g]);

  const edges: { from: GNode; to: GNode; bad: boolean; hot: boolean }[] = [];
  for (const n of g.nodes.values())
    for (const d of n.deps) {
      const to = g.nodes.get(d);
      if (!to) continue;
      edges.push({
        from: n,
        to,
        bad: to.state === 'missing',
        hot: !!selected && (selected === n.key || selected === d) || (!!missing && missing === d),
      });
    }

  return (
    <div className="graph-wrap" ref={wrap}>
      <svg
        className="graph"
        width={g.width}
        height={g.height}
        viewBox={`0 0 ${g.width} ${g.height}`}
        role="group"
        aria-label="Dependency graph. Arrows point from a component to what it needs. The list below the graph gives the same information as text."
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#656c79" />
          </marker>
          <marker id="arrow-bad" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#c75c5c" />
          </marker>
        </defs>
        {edges.map((e, i) => {
          const x1 = e.from.x + W / 2;
          const y1 = e.from.y + H;
          const x2 = e.to.x + W / 2;
          const y2 = e.to.y;
          const my = (y1 + y2) / 2;
          return (
            <path
              key={i}
              d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2 - 2}`}
              className={`edge${e.bad ? ' edge-bad' : ''}${e.hot ? ' edge-hot' : ''}`}
              markerEnd={`url(#${e.bad ? 'arrow-bad' : 'arrow'})`}
            />
          );
        })}
        {[...g.nodes.values()].map((n) => {
          const { type, name } = splitKey(n.key);
          const isSel = selected === n.key || missing === n.key;
          return (
            <g
              key={n.key}
              className={`node node-${n.state}${isSel ? ' node-sel' : ''}${n.inSlice ? '' : ' node-ext'}`}
              transform={`translate(${n.x},${n.y})`}
              onClick={() => onSelect(n.key)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(n.key))}
              tabIndex={0}
              role="button"
              aria-label={`${shortType[type] ?? type} ${name}: ${STATE_LABEL[n.state]}${n.deleted ? ', deleted by this slice' : ''}`}
              aria-pressed={isSel}
            >
              <rect width={W} height={H} rx={6} />
              <text x={10} y={19} className="node-type">
                {(shortType[type] ?? type).toUpperCase()}
                {n.state === 'missing' ? ' · MISSING' : n.state === 'in-org' ? ' · IN TARGET' : ''}
                {n.deleted ? ' · DELETED' : ''}
              </text>
              <text x={10} y={37} className="node-name">
                {name.length > 23 ? name.slice(0, 22) + '…' : name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function GraphLegend() {
  return (
    <ul className="legend" aria-label="Graph legend">
      <li><span className="sw sw-ready" />Ready</li>
      <li><span className="sw sw-review" />Needs review</li>
      <li><span className="sw sw-held" />Held back</li>
      <li><span className="sw sw-in-org" />Already in target</li>
      <li><span className="sw sw-missing" />Missing</li>
    </ul>
  );
}
