import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { Button, Card, Eyebrow, H2, Input, Kpi, Select, Skeleton, ErrorBox } from "@/components/shell/ui";
import { C } from "@/lib/plotly";
import { useNavigate } from "react-router-dom";

type Node = { id: string; label: string; kind: string; degree: number; doc_id?: string | null };
type Graph = { nodes: Node[]; edges: { source: string; target: string; rel: string }[] };
type Concept = { concept: string; provisions: { act: string; section: string }[]; ipc: string[]; bns: string[] };
const KIND: Record<string, string> = { act: C.warning, section: C.primary, case: C.secondary, topic: C.muted, concept: C.success };

export default function GraphPage() {
  const nav = useNavigate();
  const [query, setQuery] = useState("anticipatory bail"); const [hits, setHits] = useState<Node[]>([]); const [start, setStart] = useState("concept:anticipatory-bail");
  const [hops, setHops] = useState(2); const [maxNodes, setMaxNodes] = useState(80); const [adj, setAdj] = useState(false); const [sel, setSel] = useState<Node | null>(null);
  const g = useFetch(() => api.get<Graph>(`/kg/neighborhood?node=${encodeURIComponent(start)}&hops=${hops}&max_nodes=${maxNodes}`), [start, hops, maxNodes]);
  const concepts = useFetch(() => api.get<Concept[]>("/kg/concepts")); const stats = useFetch(() => api.get<{ kg: { nodes: Record<string, number>; edges: Record<string, number> } }>("/stats"));
  const [cf, setCf] = useState(""); const fg = useRef<any>(null); const box = useRef<HTMLDivElement>(null); const [w, setW] = useState(800);
  useEffect(() => { const ro = new ResizeObserver(() => setW(box.current?.clientWidth ?? 800)); if (box.current) ro.observe(box.current); return () => ro.disconnect(); }, []);
  useEffect(() => { const h = setTimeout(async () => { if (query.trim().length > 1) setHits(await api.get<Node[]>(`/kg/search?q=${encodeURIComponent(query)}&limit=12`)); }, 250); return () => clearTimeout(h); }, [query]);
  const data = useMemo(() => ({ nodes: (g.data?.nodes ?? []).map(n => ({ ...n })), links: (g.data?.edges ?? []).map(e => ({ ...e })) }), [g.data]);
  const adjacency = useMemo(() => { const m = new Map<string, string[]>(); const lab = new Map(data.nodes.map(n => [n.id, n.label])); for (const e of data.links) { m.set(e.source, [...(m.get(e.source) ?? []), `${e.rel} → ${lab.get(e.target)}`]); } return [...m.entries()].map(([k, v]) => ({ from: lab.get(k) ?? k, to: v })); }, [data]);
  return (
    <div className="space-y-6">
      <Card><Eyebrow>Graph engine · networkx → three.js</Eyebrow><H2 className="mt-1">Knowledge Graph</H2><p className="mt-1 text-sm text-muted">Acts, provisions, judgments, topics and curated legal concepts, linked by cross-references and citations. Drag, zoom and click nodes; double-click a provision to open it.</p></Card>
      {stats.data && <div className="grid grid-cols-3 gap-3 md:grid-cols-6">{Object.entries(stats.data.kg.nodes).map(([k, v], i) => <Kpi key={k} label={k} value={v.toLocaleString()} delay={i * .04} />)}<Kpi label="edges" value={Object.values(stats.data.kg.edges).reduce((a, b) => a + b, 0).toLocaleString()} delay={.24} /></div>}
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card className="space-y-3">
          <label className="block text-xs text-muted">Find a node<Input value={query} onChange={e => setQuery(e.target.value)} placeholder="concept, section, case…" /></label>
          <ul className="max-h-44 space-y-1 overflow-auto">{hits.map(h => <li key={h.id}><button onClick={() => setStart(h.id)} className={`w-full cursor-pointer rounded-[8px] px-2 py-1.5 text-left text-xs hover:bg-white/[.04] ${h.id === start ? "bg-primary/10" : ""}`}><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: KIND[h.kind] }} />{h.label.slice(0, 48)} <span className="font-mono text-muted">· {h.degree}</span></button></li>)}</ul>
          <label className="block text-xs text-muted">Hops<Select value={hops} onChange={e => setHops(Number(e.target.value))}><option value={1}>1</option><option value={2}>2</option></Select></label>
          <label className="block text-xs text-muted">Max nodes <span className="font-mono">{maxNodes}</span><input type="range" min={20} max={200} value={maxNodes} onChange={e => setMaxNodes(Number(e.target.value))} className="w-full accent-[var(--primary)]" /></label>
          <div className="flex flex-wrap gap-1 pt-2">{Object.entries(KIND).map(([k, c]) => <span key={k} className="rounded-full border px-2 py-0.5 font-mono text-[10px]" style={{ borderColor: c, color: c }}>{k}</span>)}</div>
          <Button className="w-full" onClick={() => setAdj(a => !a)}>{adj ? "Show 3D graph" : "View as adjacency list"}</Button>
          {sel && <div className="rounded-[10px] border border-[var(--border)] p-3 text-xs"><div className="font-mono text-[10px] uppercase text-muted">{sel.kind} · degree {sel.degree}</div><div className="mt-1 font-semibold">{sel.label}</div>
            <div className="mt-2 flex gap-2"><Button className="h-9 flex-1" onClick={() => setStart(sel.id)}>Center</Button>{sel.doc_id && <Button className="h-9 flex-1" variant="primary" onClick={() => nav(`/app/provisions?doc=${encodeURIComponent(sel.doc_id!)}`)}>Open</Button>}</div></div>}
        </Card>
        <Card className="p-0 overflow-hidden" >
          <div ref={box} className="h-[560px] w-full">
            {g.error ? <ErrorBox error={g.error} /> : g.loading || !g.data ? <Skeleton className="h-full" /> : adj ? (
              <div className="h-full overflow-auto p-4 text-xs"><table className="w-full text-left"><thead className="font-mono text-[11px] uppercase text-muted"><tr><th className="p-2">node</th><th className="p-2">relations</th></tr></thead><tbody>{adjacency.map(r => <tr key={r.from} className="border-t border-[var(--border)] align-top"><td className="p-2 font-semibold">{r.from}</td><td className="p-2 text-muted">{r.to.join("; ")}</td></tr>)}</tbody></table></div>
            ) : (
              <ForceGraph3D ref={fg} graphData={data} width={w} height={560} backgroundColor="rgba(0,0,0,0)" showNavInfo={false}
                nodeLabel={(n: any) => `<div style="font:12px Inter;color:#dfe7f5;background:#0e1628;border:1px solid #00e5ff;padding:6px 8px;border-radius:8px">${n.label}<br/><span style="color:#8b9bb4;font-family:JetBrains Mono;font-size:10px">${n.kind} · degree ${n.degree}</span></div>`}
                nodeThreeObject={(n: any) => { const size = n.id === start ? 7 : 2.5 + Math.min(6, Math.log2(1 + n.degree)); const m = new THREE.Mesh(new THREE.SphereGeometry(size, 16, 16), new THREE.MeshStandardMaterial({ color: KIND[n.kind] ?? C.muted, emissive: KIND[n.kind] ?? C.muted, emissiveIntensity: n.id === start ? 1.2 : .5, roughness: .3 })); return m; }}
                linkColor={() => "rgba(139,155,180,0.45)"} linkOpacity={0.6} linkWidth={0.6} linkDirectionalParticles={2} linkDirectionalParticleSpeed={0.006} linkDirectionalParticleColor={() => C.primary} linkDirectionalParticleWidth={1.2}
                onNodeClick={(n: any) => { setSel(n); fg.current?.cameraPosition({ x: n.x * 1.4, y: n.y * 1.4, z: n.z * 1.4 + 60 }, n, 600); }}
                onNodeRightClick={(n: any) => setStart(n.id)} enableNodeDrag cooldownTicks={120} />
            )}
          </div>
        </Card>
      </div>
      <Card><div className="flex flex-wrap items-end justify-between gap-3"><div><H2 className="text-base">Concept map · IPC → BNS transition</H2><p className="text-xs text-muted">214 curated legal concepts mapped to their governing provisions.</p></div><Input className="max-w-xs" placeholder="filter concepts…" value={cf} onChange={e => setCf(e.target.value)} aria-label="Filter concepts" /></div>
        <div className="mt-3 max-h-80 overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-bg-elev font-mono text-[11px] uppercase text-muted"><tr><th className="p-2">concept</th><th className="p-2">IPC 1860</th><th className="p-2">BNS 2023</th><th className="p-2">all provisions</th></tr></thead>
          <tbody>{(concepts.data ?? []).filter(c => c.concept.includes(cf.toLowerCase())).map(c => <tr key={c.concept} className="cursor-pointer border-t border-[var(--border)] hover:bg-white/[.03]" onClick={() => setStart(`concept:${c.concept.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`)}><td className="p-2 font-semibold">{c.concept}</td><td className="p-2 font-mono">{c.ipc.join(", ")}</td><td className="p-2 font-mono text-primary">{c.bns.join(", ")}</td><td className="p-2 text-muted">{c.provisions.map(p => `${p.act.split(",")[0]} s.${p.section}`).join("; ")}</td></tr>)}</tbody></table></div></Card>
    </div>
  );
}
