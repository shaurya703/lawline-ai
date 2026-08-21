import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Columns3, Plus, X } from "lucide-react";
import { api, type CompareOut } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { Card, Empty, ErrorBox, Input, PageHeader, PinButton, Select, Skeleton } from "@/components/shell/ui";
type Act = { act: string; sections: number }; type Sec = { section: string; title: string; doc_id: string };
const PRESETS: [string, string[]][] = [["Cheating: IPC vs BNS", ["statute::indian-penal-code-1860::420", "statute::bharatiya-nyaya-sanhita-2023::318"]], ["Murder vs culpable homicide", ["statute::indian-penal-code-1860::302", "statute::indian-penal-code-1860::304"]], ["Writs: Art. 32 vs Art. 226", ["statute::constitution-of-india-1949::32", "statute::constitution-of-india-1949::226"]], ["Bail: regular vs anticipatory", ["statute::code-of-criminal-procedure-act-1973::437", "statute::code-of-criminal-procedure-act-1973::438"]]];
const HUES = ["#00e5ff", "#ffd166", "#2ee6a6"];
export default function Compare() {
  const [params, setParams] = useSearchParams(); const ids = (params.get("ids") ?? "").split(",").filter(Boolean);
  const acts = useFetch(() => api.get<Act[]>("/acts")); const [act, setAct] = useState("Indian Penal Code, 1860"); const [q, setQ] = useState("");
  const secs = useFetch(() => q.length > 0 ? api.get<Sec[]>(`/acts/sections?act=${encodeURIComponent(act)}&q=${encodeURIComponent(q)}`) : Promise.resolve([] as Sec[]), [act, q]);
  const cmp = useFetch(() => ids.length >= 2 ? api.post<CompareOut>("/compare", { doc_ids: ids }) : Promise.resolve(null), [ids.join(",")]);
  const setIds = (x: string[]) => setParams(x.length ? { ids: x.join(",") } : {});
  const labels = useFetch(async () => Promise.all(ids.map(d => api.get<{ citation: string }>(`/provision?doc_id=${encodeURIComponent(d)}`).then(r => r.citation).catch(() => d))), [ids.join(",")]);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Side by side" title="Compare Provisions" desc="Pick two or three sections from any Acts. LawLine lines them up on scope, ingredients, consequences, who can invoke them and procedure — and explains how they interact." />
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">{ids.map((d, i) => <span key={d} className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs" style={{ borderColor: HUES[i], color: HUES[i] }}>{labels.data?.[i] ?? d}<button onClick={() => setIds(ids.filter(x => x !== d))} aria-label="Remove" className="cursor-pointer"><X className="h-3 w-3" /></button></span>)}{ids.length < 3 && <span className="font-mono text-[10px] text-muted">{ids.length}/3 selected — add {2 - ids.length > 0 ? `${2 - ids.length} more` : "another"}</span>}</div>
        {ids.length < 3 && <div className="mt-3 grid gap-2 md:grid-cols-[300px_1fr]"><Select aria-label="Act" value={act} onChange={e => setAct(e.target.value)}>{(acts.data ?? []).slice(0, 60).map(a => <option key={a.act}>{a.act}</option>)}</Select><Input aria-label="Find section" value={q} onChange={e => setQ(e.target.value)} placeholder="Search section number or title in this Act…" /></div>}
        {q && secs.data && <ul className="mt-2 max-h-48 overflow-auto rounded-[10px] border border-white/10">{secs.data.slice(0, 30).map(s => <li key={s.doc_id}><button disabled={ids.includes(s.doc_id)} onClick={() => { setIds([...ids, s.doc_id]); setQ(""); }} className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-primary/10 disabled:opacity-40"><Plus className="h-3 w-3 text-primary" /><span className="font-mono text-primary">s.{s.section}</span><span className="truncate text-muted">{s.title.split(" — ")[0]}</span></button></li>)}</ul>}
        <div className="mt-3 flex flex-wrap gap-2">{PRESETS.map(([l, v]) => <button key={l} onClick={() => setIds(v)} className="cursor-pointer rounded-full border border-white/10 px-3 py-1 text-xs text-muted hover:border-primary hover:text-white">{l}</button>)}</div>
      </Card>
      {cmp.error && <ErrorBox error={cmp.error} />}
      {ids.length >= 2 && cmp.loading && <Skeleton className="h-96" />}
      {ids.length < 2 && <Empty icon={<Columns3 className="h-8 w-8" />} title="Select at least two provisions" desc="Use a preset or search an Act above." />}
      {cmp.data && (
        <motion.div initial="h" animate="s" variants={{ s: { transition: { staggerChildren: .08 } } }} className="space-y-4">
          <div className={`grid gap-4 md:grid-cols-${cmp.data.docs.length}`} style={{ gridTemplateColumns: `repeat(${cmp.data.docs.length}, minmax(0,1fr))` }}>
            {cmp.data.docs.map((d, i) => <motion.div key={d.doc_id} variants={{ h: { opacity: 0, y: 10 }, s: { opacity: 1, y: 0 } }}><Card className="h-full p-4" ><div className="font-display text-base" style={{ color: HUES[i] }}>{d.citation}</div><div className="text-xs text-muted">{d.title.split(" — ")[0]}</div><p className="mt-2 max-h-40 overflow-auto text-xs text-fg/80">{d.text.replace(/^.*?—\s*(Section|Article) \S+\.\s*/, "")}</p><Link to={`/app/provisions?doc=${encodeURIComponent(d.doc_id)}`} className="mt-2 inline-block font-mono text-[11px] text-primary hover:underline">Open →</Link></Card></motion.div>)}
          </div>
          <motion.div variants={{ h: { opacity: 0, y: 10 }, s: { opacity: 1, y: 0 } }}><Card><p className="text-sm">{cmp.data.analysis.overview}</p></Card></motion.div>
          <motion.div variants={{ h: { opacity: 0, y: 10 }, s: { opacity: 1, y: 0 } }}><Card className="overflow-x-auto p-0"><table className="w-full text-sm"><thead><tr className="font-mono text-[10px] uppercase tracking-wider text-muted"><th className="p-3 text-left">Dimension</th>{cmp.data.docs.map((d, i) => <th key={d.doc_id} className="p-3 text-left" style={{ color: HUES[i] }}>{d.citation.split(" — ")[0].slice(0, 40)}</th>)}</tr></thead>
            <tbody>{cmp.data.analysis.matrix.map((r, k) => <motion.tr key={r.dimension} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: k * .06 }} className="border-t border-white/5 align-top hover:bg-white/[.02]"><td className="p-3 font-semibold text-white">{r.dimension}</td>{r.values.map((v, i) => <td key={i} className="p-3 text-fg/90">{v}</td>)}</motion.tr>)}</tbody></table></Card></motion.div>
          <motion.div variants={{ h: { opacity: 0, y: 10 }, s: { opacity: 1, y: 0 } }} className="grid gap-4 md:grid-cols-2">
            <Card><div className="font-mono text-[10px] uppercase tracking-[0.14em] text-success">When to use which</div><ul className="mt-2 space-y-2 text-sm">{cmp.data.analysis.when_to_use.map((w, i) => <li key={i} className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: HUES[i % 3] }} />{w}</li>)}</ul></Card>
            <Card><div className="font-mono text-[10px] uppercase tracking-[0.14em] text-secondary">Interplay</div><p className="mt-2 text-sm">{cmp.data.analysis.interplay}</p><div className="mt-3"><PinButton size="md" kind="comparison" title={cmp.data.docs.map(d => d.citation.split(" — ")[0]).join(" vs ")} body={`${cmp.data.analysis.overview}\n\n${cmp.data.analysis.matrix.map(r => `**${r.dimension}**: ${r.values.join(" | ")}`).join("\n")}\n\n${cmp.data.analysis.interplay}`} meta={{ to: `/app/compare?ids=${ids.join(",")}` }} /></div></Card>
          </motion.div>
        </motion.div>)}
    </div>
  );
}
