import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeftRight, ArrowRight, Search } from "lucide-react";
import { api, type MapRow, type Transition } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { Badge, Button, Card, ErrorBox, Input, PageHeader, PinButton, Select, Skeleton, Tabs } from "@/components/shell/ui";
import { Chart, C } from "@/lib/plotly";
const CODES = [["IPC", "Indian Penal Code, 1860 → Bharatiya Nyaya Sanhita, 2023"], ["CRPC", "Code of Criminal Procedure, 1973 → Bharatiya Nagarik Suraksha Sanhita, 2023"], ["IEA", "Indian Evidence Act, 1872 → Bharatiya Sakshya Adhiniyam, 2023"], ["BNS", "BNS 2023 → IPC 1860 (reverse)"], ["BNSS", "BNSS 2023 → CrPC 1973 (reverse)"], ["BSA", "BSA 2023 → Evidence Act 1872 (reverse)"]];
const SHORT: Record<string, string> = { "Indian Penal Code, 1860": "IPC", "Bharatiya Nyaya Sanhita, 2023": "BNS", "Code of Criminal Procedure Act, 1973": "CrPC", "Bharatiya Nagarik Suraksha Sanhita, 2023": "BNSS", "Indian Evidence Act, 1872": "IEA", "Bharatiya Sakshya Adhiniyam, 2023": "BSA" };
const clean = (t: string) => t.replace(/^.*?—\s*(Section|Article) \S+\.\s*/, "").replace(/^Section \S+ of the [^.]+\.\s*/, "");

export default function TransitionPage() {
  const [params, setParams] = useSearchParams(); const act = params.get("act") ?? "IPC"; const section = params.get("section") ?? "302";
  const [a, setA] = useState(act); const [s, setS] = useState(section); const [tab, setTab] = useState<"bridge" | "map">("bridge"); const [filter, setFilter] = useState("");
  const t = useFetch(() => api.get<Transition>(`/transition?act=${act}&section=${encodeURIComponent(section)}`), [act, section]);
  const map = useFetch(() => api.get<MapRow[]>("/transition/map"));
  const rows = useMemo(() => (map.data ?? []).filter(r => !filter || (r.old_section + " " + r.new_sections.join(" ") + " " + r.concepts.join(" ") + " " + r.old_act).toLowerCase().includes(filter.toLowerCase())), [map.data, filter]);
  const sankey = useMemo(() => { const rs = (map.data ?? []).filter(r => r.old_act.startsWith("Indian Penal")).slice(0, 60); const labels = [...rs.map(r => `IPC ${r.old_section}`), ...Array.from(new Set(rs.flatMap(r => r.new_sections.map(n => `BNS ${n}`))))]; const idx = (l: string) => labels.indexOf(l); return { labels, source: rs.flatMap(r => r.new_sections.map(() => idx(`IPC ${r.old_section}`))), target: rs.flatMap(r => r.new_sections.map(n => idx(`BNS ${n}`))) }; }, [map.data]);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="2023 criminal codes" title="IPC → BNS Bridge" desc="India replaced the IPC, CrPC and Evidence Act on 1 July 2024. Enter any old or new section to see its counterpart, read both texts side by side, and get a model-written account of what changed." actions={<Tabs value={tab} onChange={setTab} items={[{ id: "bridge", label: "Bridge" }, { id: "map", label: "Full map" }]} />} />
      {tab === "bridge" ? (<>
        <Card className="p-4"><form className="grid gap-2 md:grid-cols-[1fr_140px_auto]" onSubmit={e => { e.preventDefault(); setParams({ act: a, section: s.trim().toUpperCase() }); }}>
          <Select aria-label="Code" value={a} onChange={e => setA(e.target.value)}>{CODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          <Input aria-label="Section" value={s} onChange={e => setS(e.target.value)} placeholder="e.g. 302" /><Button type="submit" variant="primary"><ArrowLeftRight className="h-4 w-4" />Bridge</Button></form>
          <div className="mt-3 flex flex-wrap gap-2">{[["IPC", "302"], ["IPC", "420"], ["IPC", "498A"], ["IPC", "376"], ["IPC", "124A"], ["CRPC", "438"], ["CRPC", "154"], ["IEA", "65B"], ["BNS", "103"]].map(([x, y]) => <button key={x + y} onClick={() => { setA(x); setS(y); setParams({ act: x, section: y }); }} className="cursor-pointer rounded-full border border-white/10 px-3 py-1 font-mono text-[11px] text-muted hover:border-warning hover:text-white">{x} {y}</button>)}</div></Card>
        {t.error ? <ErrorBox error={t.error} /> : t.loading || !t.data ? <div className="grid gap-4 md:grid-cols-[1fr_60px_1fr]"><Skeleton className="h-80" /><div /><Skeleton className="h-80" /></div> : (
          <>
            <div className="grid items-stretch gap-4 md:grid-cols-[1fr_64px_1fr]">
              <Panel title={t.data.old ? `${SHORT[t.data.old.act]} · Section ${t.data.old.section}` : "No old-code provision"} sub={t.data.old?.act ?? ""} text={t.data.old ? clean(t.data.old.text) : "—"} hue="#ffd166" doc={t.data.old?.doc_id} />
              <div className="relative hidden items-center justify-center md:flex"><motion.div className="absolute h-px w-full bg-[linear-gradient(90deg,#ffd166,#2ee6a6)]" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} /><motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: .3 }} className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border border-success/50 bg-bg shadow-[0_0_20px_rgba(46,230,166,.5)]"><ArrowRight className="h-4 w-4 text-success" /></motion.div></div>
              <div className="space-y-4">{t.data.new.length ? t.data.new.map(n => <Panel key={n.doc_id} title={`${SHORT[n.act]} · Section ${n.section}`} sub={n.act} text={clean(n.text)} hue="#2ee6a6" doc={n.doc_id} />) : <Panel title="No new-code counterpart recorded" sub="" text="This provision has no mapped successor in the curated table (it may have been repealed, e.g. s.377 IPC or s.309 IPC)." hue="#ff4d6d" />}</div>
            </div>
            {t.data.diff && <Card className="grid gap-6 md:grid-cols-[1fr_1fr]">
              <div><div className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary/80">What changed</div><p className="mt-2 text-sm">{t.data.diff.summary}</p>
                <ul className="mt-3 space-y-2">{t.data.diff.changes.map((c, i) => <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * .07 }} className="flex gap-2 text-sm"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-warning shadow-[0_0_8px_#ffd166]" />{c}</motion.li>)}</ul></div>
              <div><div className="font-mono text-[10px] uppercase tracking-[0.14em] text-success/80">Unchanged</div><ul className="mt-2 space-y-2">{t.data.diff.unchanged.map((c, i) => <li key={i} className="flex gap-2 text-sm text-muted"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-success" />{c}</li>)}</ul>
                <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-[10px] border border-warning/30 p-3"><div className="font-mono text-[9px] uppercase text-muted">Old punishment</div><div className="mt-1 text-sm text-warning">{t.data.diff.severity_old}</div></div><div className="rounded-[10px] border border-success/30 p-3"><div className="font-mono text-[9px] uppercase text-muted">New punishment</div><div className="mt-1 text-sm text-success">{t.data.diff.severity_new}</div></div></div>
                <div className="mt-3 flex flex-wrap gap-1">{t.data.concepts.map(c => <Badge key={c}>{c}</Badge>)}</div>
                <div className="mt-3 flex gap-2"><PinButton size="md" kind="comparison" title={`${act} ${section} → 2023 code`} body={`${t.data.diff.summary}\n\nChanges:\n${t.data.diff.changes.map(c => "- " + c).join("\n")}`} meta={{ to: `/app/transition?act=${act}&section=${section}` }} /><Link to={`/app/counsel?q=${encodeURIComponent(`What changed between ${act} section ${section} and its BNS/BNSS/BSA equivalent?`)}`}><Button size="sm" variant="ghost">Ask Counsel</Button></Link></div></div>
            </Card>}
          </>)}
      </>) : (
        <>
          <Card className="p-4"><div className="flex items-center gap-2"><Search className="h-4 w-4 text-muted" /><Input aria-label="Filter map" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by section, concept or code… e.g. 420, bail, evidence" /></div></Card>
          <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
            <Card className="overflow-hidden p-0"><div className="max-h-[640px] overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-bg-elev/95 backdrop-blur"><tr className="text-left font-mono text-[10px] uppercase tracking-wider text-muted"><th className="p-3">Old</th><th className="p-3">New</th><th className="p-3">Concepts</th></tr></thead>
              <tbody>{rows.map((r, i) => <tr key={r.old_act + r.old_section} className="cursor-pointer border-t border-white/5 transition-colors hover:bg-primary/5" onClick={() => { const k = r.old_act.startsWith("Indian Penal") ? "IPC" : r.old_act.startsWith("Code") ? "CRPC" : "IEA"; setA(k); setS(r.old_section); setParams({ act: k, section: r.old_section }); setTab("bridge"); }}>
                <td className="p-3 font-mono text-warning">{SHORT[r.old_act]} {r.old_section}</td><td className="p-3 font-mono text-success">{SHORT[r.new_act]} {r.new_sections.join(", ")}</td><td className="p-3 text-xs text-muted">{r.concepts.slice(0, 3).join(" · ")}{i < 0 ? "" : ""}</td></tr>)}</tbody></table></div>
              <div className="border-t border-white/10 p-3 font-mono text-[10px] text-muted">{rows.length} mappings · click a row to open the bridge</div></Card>
            <Card className="p-4"><div className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary/80">IPC → BNS flow (first 60)</div>
              {map.data ? <Chart height={600} data={[{ type: "sankey", arrangement: "snap", node: { pad: 6, thickness: 10, line: { width: 0 }, label: sankey.labels, color: sankey.labels.map(l => l.startsWith("IPC") ? C.warning : C.success) }, link: { source: sankey.source, target: sankey.target, value: sankey.source.map(() => 1), color: "rgba(46,230,166,.18)" } } as never]} layout={{ margin: { l: 4, r: 4, t: 8, b: 8 }, font: { size: 9 } }} /> : <Skeleton className="h-[600px]" />}</Card>
          </div>
        </>)}
    </div>
  );
}
function Panel({ title, sub, text, hue, doc }: { title: string; sub: string; text: string; hue: string; doc?: string }) {
  return <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass relative overflow-hidden rounded-[16px] p-5" style={{ borderTop: `2px solid ${hue}` }}>
    <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-2xl" style={{ background: hue + "33" }} />
    <div className="font-display text-lg text-white">{title}</div><div className="font-mono text-[10px] text-muted">{sub}</div>
    <p className="mt-3 max-h-72 overflow-auto text-sm leading-relaxed text-fg/90">{text}</p>
    {doc && <Link to={`/app/provisions?doc=${encodeURIComponent(doc)}`} className="mt-3 inline-block font-mono text-[11px] hover:underline" style={{ color: hue }}>Open in explorer →</Link>}
  </motion.div>;
}
