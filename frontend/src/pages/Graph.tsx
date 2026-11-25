import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import { api } from "@/lib/api";
import { esc } from "@/lib/export";
import { useFetch } from "@/lib/hooks";
import { Button, Caption, Card, ErrorBox, Field, Input, Page, Section, Select, Skeleton, Stat, StatStrip } from "@/components/ui";
import { C } from "@/lib/plotly";
import { cn } from "@/lib/utils";

type Node = { id: string; label: string; kind: string; degree: number; doc_id?: string | null };
type Graph = { nodes: Node[]; edges: { source: string; target: string; rel: string }[] };
type Concept = { concept: string; provisions: { act: string; section: string }[]; ipc: string[]; bns: string[] };
/** One colour per kind of node, shared by the graph, the search results and the legend. */
const KIND: Record<string, [string, string]> = { act: ["Act", C.warning], section: ["Provision", C.primary], case: ["Judgment", C.secondary], concept: ["Concept", C.success], topic: ["Topic", C.muted] };
const kindColor = (k: string) => KIND[k]?.[1] ?? C.muted;
const kindLabel = (k: string) => KIND[k]?.[0] ?? k;
const Dot = ({ kind }: { kind: string }) => <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: kindColor(kind) }} aria-hidden />;
// The force-graph tooltip renders this string as HTML, and labels are judgment and section titles from the corpus.
const tooltip = (n: Node) => `<div style="font:13px 'IBM Plex Sans',system-ui,sans-serif;color:${C.fg};background:${C.surface};border:1px solid ${C.grid};padding:6px 9px;border-radius:6px;max-width:280px">${esc(n.label)}<br/><span style="color:${C.sub};font-size:12px">${esc(kindLabel(n.kind))} · ${n.degree} links</span></div>`;

export default function GraphPage() {
  const nav = useNavigate();
  const [query, setQuery] = useState("anticipatory bail"); const [hits, setHits] = useState<Node[]>([]); const [start, setStart] = useState("concept:anticipatory-bail");
  const [hops, setHops] = useState(2); const [maxNodes, setMaxNodes] = useState(80); const [maxQ, setMaxQ] = useState(80); const [adj, setAdj] = useState(false); const [sel, setSel] = useState<Node | null>(null);
  const g = useFetch(() => api.get<Graph>(`/kg/neighborhood?node=${encodeURIComponent(start)}&hops=${hops}&max_nodes=${maxQ}`), [start, hops, maxQ]);
  const concepts = useFetch(() => api.get<Concept[]>("/kg/concepts")); const stats = useFetch(() => api.get<{ kg: { nodes: Record<string, number>; edges: Record<string, number> } }>("/stats"));
  const [cf, setCf] = useState(""); const fg = useRef<any>(null); const box = useRef<HTMLDivElement>(null); const [w, setW] = useState(800);
  useEffect(() => { const ro = new ResizeObserver(() => setW(box.current?.clientWidth ?? 800)); if (box.current) ro.observe(box.current); return () => ro.disconnect(); }, []);
  // Dragging the slider would otherwise fetch a neighbourhood for every value it passes.
  useEffect(() => { const h = setTimeout(() => setMaxQ(maxNodes), 300); return () => clearTimeout(h); }, [maxNodes]);
  useEffect(() => { let live = true; const h = setTimeout(() => { if (query.trim().length > 1) api.get<Node[]>(`/kg/search?q=${encodeURIComponent(query)}&limit=12`).then(r => { if (live) setHits(r); }, () => { if (live) setHits([]); }); }, 250); return () => { live = false; clearTimeout(h); }; }, [query]);
  const data = useMemo(() => ({ nodes: (g.data?.nodes ?? []).map(n => ({ ...n })), links: (g.data?.edges ?? []).map(e => ({ ...e })) }), [g.data]);
  const adjacency = useMemo(() => { const m = new Map<string, string[]>(); const lab = new Map(data.nodes.map(n => [n.id, n.label])); for (const e of data.links) { m.set(e.source, [...(m.get(e.source) ?? []), `${e.rel} → ${lab.get(e.target)}`]); } return [...m.entries()].map(([k, v]) => ({ from: lab.get(k) ?? k, to: v })); }, [data]);
  const kg = stats.data?.kg;
  return (
    <Page title="Knowledge Graph" desc="Acts, provisions, judgments, topics and curated legal concepts, linked by cross-references and citations. Search for a node, then explore what it connects to.">
      {stats.error ? <ErrorBox error={stats.error} /> : kg ? <StatStrip>{Object.entries(kg.nodes).map(([k, v]) => <Stat key={k} label={<span className="inline-flex items-center gap-1.5"><Dot kind={k} />{kindLabel(k)}s</span>} value={v.toLocaleString()} />)}<Stat label="Links" value={Object.values(kg.edges).reduce((a, b) => a + b, 0).toLocaleString()} /></StatStrip> : <Skeleton className="h-[88px]" />}

      <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="space-y-4" as="aside">
          <Field label="Find a node"><Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Concept, section, case…" /></Field>
          {hits.length > 0 && <ul className="-mx-2 max-h-48 overflow-auto">{hits.map(h => <li key={h.id}><button onClick={() => setStart(h.id)} aria-current={h.id === start} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors", h.id === start ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-sunken hover:text-ink")}><Dot kind={h.kind} /><span className="min-w-0 flex-1 truncate">{h.label}</span><span className="num shrink-0 text-[12px] text-ink-3">{h.degree}</span></button></li>)}</ul>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hops"><Select value={hops} onChange={e => setHops(Number(e.target.value))}><option value={1}>1</option><option value={2}>2</option></Select></Field>
            <Field label={<>Max nodes <span className="num font-normal text-ink-3">{maxNodes}</span></>}><input type="range" min={20} max={200} value={maxNodes} onChange={e => setMaxNodes(Number(e.target.value))} className="mt-3 w-full accent-ink" /></Field>
          </div>
          <Button className="w-full" onClick={() => setAdj(a => !a)}>{adj ? "Show the 3D graph" : "Show as a list of links"}</Button>
          {sel && <div className="rounded-md border border-line bg-sunken p-3">
            <Caption className="flex items-center gap-1.5"><Dot kind={sel.kind} />{kindLabel(sel.kind)} · <span className="num">{sel.degree} links</span></Caption>
            <div className="mt-1 text-[14px] font-medium text-ink">{sel.label}</div>
            <div className="mt-3 flex gap-2"><Button size="sm" className="flex-1" onClick={() => setStart(sel.id)}>Centre here</Button>{sel.doc_id && <Button size="sm" className="flex-1" variant="primary" onClick={() => nav(`/app/provisions?doc=${encodeURIComponent(sel.doc_id!)}`)}>Open text</Button>}</div>
          </div>}
        </Card>

        <Card flush className="overflow-hidden">
          <div ref={box} className="h-[560px] w-full">
            {g.error ? <div className="p-5"><ErrorBox error={g.error} /></div> : g.loading || !g.data ? <Skeleton className="h-full rounded-none" /> : adj ? (
              <div className="h-full overflow-auto"><table className="tbl"><thead className="sticky"><tr><th className="pl-5">Node</th><th className="pr-5">Links to</th></tr></thead><tbody>{adjacency.map(r => <tr key={r.from}><td className="pl-5 font-medium text-ink">{r.from}</td><td className="pr-5 text-ink-2">{r.to.join("; ")}</td></tr>)}</tbody></table></div>
            ) : (
              <ForceGraph3D ref={fg} graphData={data} width={w} height={560} backgroundColor={C.surface} showNavInfo={false}
                nodeLabel={(n: any) => tooltip(n)}
                nodeThreeObject={(n: any) => { const size = n.id === start ? 7 : 2.5 + Math.min(6, Math.log2(1 + n.degree)); return new THREE.Mesh(new THREE.SphereGeometry(size, 16, 16), new THREE.MeshLambertMaterial({ color: n.id === start ? C.fg : kindColor(n.kind) })); }}
                linkColor={() => C.muted} linkOpacity={0.55} linkWidth={0.5}
                onNodeClick={(n: any) => { setSel(n); fg.current?.cameraPosition({ x: n.x * 1.4, y: n.y * 1.4, z: n.z * 1.4 + 60 }, n, 600); }}
                onNodeRightClick={(n: any) => setStart(n.id)} enableNodeDrag cooldownTicks={120} />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-5 py-3 text-[12.5px] text-ink-3">
            {Object.entries(KIND).map(([k, [l]]) => <span key={k} className="inline-flex items-center gap-1.5"><Dot kind={k} />{l}</span>)}
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-ink" aria-hidden />Centre</span>
            <span className="ml-auto">Drag to rotate, scroll to zoom. Click a node to select it; right-click to centre the graph on it.</span>
          </div>
        </Card>
      </div>

      <Section flush title="Concept map" desc="Curated legal concepts and the provisions that govern them, old code and new. Select a row to centre the graph on that concept." actions={<Input className="h-8 w-56 text-[13px]" placeholder="Filter concepts…" value={cf} onChange={e => setCf(e.target.value)} aria-label="Filter concepts" />}>
        {concepts.error ? <div className="px-5 pb-5"><ErrorBox error={concepts.error} /></div> : !concepts.data ? <div className="px-5 pb-5"><Skeleton className="h-64" /></div> : (
          <div className="max-h-96 overflow-auto"><table className="tbl"><thead className="sticky"><tr><th className="pl-5">Concept</th><th>IPC, 1860</th><th>BNS, 2023</th><th className="pr-5">All provisions</th></tr></thead>
            <tbody>{concepts.data.filter(c => c.concept.includes(cf.toLowerCase())).map(c => <tr key={c.concept} className="row-link" onClick={() => { setStart(`concept:${c.concept.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`); window.scrollTo({ top: 0, behavior: "smooth" }); }}><td className="pl-5 font-medium text-ink">{c.concept}</td><td className="mono">{c.ipc.join(", ")}</td><td className="mono">{c.bns.join(", ")}</td><td className="pr-5 text-ink-3">{c.provisions.map(p => `${p.act.split(",")[0]} s.${p.section}`).join("; ")}</td></tr>)}</tbody></table></div>)}
      </Section>
    </Page>
  );
}
