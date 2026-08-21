import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, Siren } from "lucide-react";
import { api, type Offence } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { Badge, Button, Card, Empty, ErrorBox, Input, PageHeader, PinButton, Skeleton } from "@/components/shell/ui";
import { Arc, Meter } from "@/components/fx/Gauge";
import { Chart } from "@/lib/plotly";
const SEV = ["none", "minor", "moderate", "serious", "grave", "capital"]; const SEVC = ["#8b9bb4", "#2ee6a6", "#ffd166", "#ff9f43", "#ff4d6d", "#ff2d55"];
const QUICK = ["theft", "murder", "cheating", "rape", "dowry death", "defamation", "kidnapping", "criminal breach of trust", "hurt", "stalking", "forgery", "rioting", "extortion", "bribery", "attempt to murder"];
function Tri({ v, label }: { v: boolean | null; label: string }) { return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase ${v === null ? "border-white/10 text-muted" : v ? "border-success/60 text-success" : "border-danger/60 text-danger"}`}><span className={`h-1.5 w-1.5 rounded-full ${v === null ? "bg-muted" : v ? "bg-success" : "bg-danger"}`} />{v === null ? `${label}?` : v ? label : `non-${label}`}</span>; }

export default function OffencePage() {
  const [params, setParams] = useSearchParams(); const q0 = params.get("q") ?? ""; const [q, setQ] = useState(q0);
  const r = useFetch(() => q0 ? api.get<{ query: string; results: Offence[] }>(`/offence?q=${encodeURIComponent(q0)}`) : Promise.resolve(null), [q0]);
  const res = r.data?.results ?? [];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Criminal law" title="Offence Lookup" desc="Name an offence in plain words. LawLine finds the IPC and BNS provisions, reads the punishment clause, and classifies cognizability, bailability and compoundability (First Schedule, model-inferred — verify for filings)." />
      <Card className="p-4">
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (q.trim()) setParams({ q: q.trim() }); }}><Input aria-label="Offence" value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. theft, dowry death, cheating, stalking…" /><Button variant="primary" type="submit"><Search className="h-4 w-4" />Look up</Button></form>
        <div className="mt-3 flex flex-wrap gap-2">{QUICK.map(x => <button key={x} onClick={() => { setQ(x); setParams({ q: x }); }} className="cursor-pointer rounded-full border border-white/10 px-3 py-1 text-xs text-muted transition-all hover:border-danger hover:text-white">{x}</button>)}</div>
      </Card>
      {r.error && <ErrorBox error={r.error} />}
      {q0 && r.loading && <div className="grid gap-4 md:grid-cols-2">{[0, 1].map(i => <Skeleton key={i} className="h-72" />)}</div>}
      {!q0 && <Empty icon={<Siren className="h-8 w-8" />} title="Search an offence" desc="Try “cheating” or “section 420” style queries — both the 1860 code and the 2023 Sanhita are mapped." />}
      {r.data && !res.length && <Empty title="No offence provision matched" desc="Try a different phrasing or the offence's common name." />}
      {res.length > 0 && (
        <>
          <Card className="p-4"><div className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary/80">Severity landscape</div>
            <Chart height={260} data={[{ type: "bar", x: res.map(o => `${o.act.startsWith("Indian") ? "IPC" : "BNS"} ${o.section}`), y: res.map(o => o.punishment.max_years ?? (o.punishment.life ? 20 : 0)), marker: { color: res.map(o => SEVC[o.punishment.severity]) }, text: res.map(o => o.punishment.death ? "death" : o.punishment.life ? "life" : o.punishment.max_years ? `${o.punishment.max_years}y` : "—"), textposition: "outside", hovertemplate: "%{x}<br>max %{text}<extra></extra>" }]} layout={{ yaxis: { title: { text: "max imprisonment (years; life≈20)" } }, margin: { l: 50, r: 10, t: 20, b: 60 } }} /></Card>
          <div className="grid gap-4 md:grid-cols-2">
            {res.map((o, i) => { const sev = o.punishment.severity; const col = SEVC[sev]; const isIpc = o.act.startsWith("Indian"); return (
              <motion.div key={o.doc_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * .06 }}>
                <Card className="h-full p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div><div className="flex items-center gap-2"><Badge kind={isIpc ? "warn" : "ok"}>{isIpc ? "IPC 1860" : "BNS 2023"}</Badge>{o.concept && <Badge>{o.concept}</Badge>}</div><h3 className="mt-2 font-display text-lg text-white">Section {o.section}</h3><div className="text-sm text-muted">{o.title.split(" — ")[0].replace(/^\d+[A-Z]?\.\s*/, "")}</div></div>
                    <Arc value={sev / 5} size={120} color={col} label={SEV[sev]} sub="severity" />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-[10px] border border-white/10 p-2"><div className="font-display text-base" style={{ color: col }}>{o.punishment.death ? "Death" : o.punishment.life ? "Life" : o.punishment.max_years ? `${o.punishment.max_years} yr` : "—"}</div><div className="font-mono text-[9px] uppercase text-muted">max term</div></div>
                    <div className="rounded-[10px] border border-white/10 p-2"><div className="font-display text-base text-warning">{o.punishment.fine ? "Yes" : "No"}</div><div className="font-mono text-[9px] uppercase text-muted">fine</div></div>
                    <div className="rounded-[10px] border border-white/10 p-2"><div className="flex justify-center pt-1"><Meter value={sev} color={col} label="severity" /></div><div className="mt-1 font-mono text-[9px] uppercase text-muted">scale</div></div>
                  </div>
                  {o.classification && <div className="mt-3 flex flex-wrap gap-1"><Tri v={o.classification.cognizable} label="cognizable" /><Tri v={o.classification.bailable} label="bailable" /><Tri v={o.classification.compoundable} label="compoundable" />{o.classification.triable_by && <Badge>{o.classification.triable_by}</Badge>}</div>}
                  {o.classification?.ingredients?.length ? <div className="mt-3"><div className="font-mono text-[10px] uppercase tracking-wider text-muted">Essential ingredients</div><ul className="mt-1 space-y-1 text-sm">{o.classification.ingredients.map((g, k) => <li key={k} className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: col }} />{g}</li>)}</ul></div> : null}
                  <p className="mt-3 line-clamp-4 text-xs text-muted">{o.text.replace(/^.*?—\s*Section \S+\.\s*/, "")}</p>
                  <div className="mt-3 flex flex-wrap gap-2"><Link to={`/app/provisions?doc=${encodeURIComponent(o.doc_id)}`}><Button size="sm">Full text</Button></Link><Link to={`/app/transition?act=${isIpc ? "IPC" : "BNS"}&section=${o.section}`}><Button size="sm">{isIpc ? "BNS equivalent" : "IPC origin"}</Button></Link><Link to={`/app/counsel?q=${encodeURIComponent(`Explain Section ${o.section} ${isIpc ? "IPC" : "BNS"} with an example`)}`}><Button size="sm" variant="ghost">Ask Counsel</Button></Link><PinButton kind="provision" title={`${isIpc ? "IPC" : "BNS"} s.${o.section} — ${o.concept ?? "offence"}`} body={o.text} meta={{ to: `/app/provisions?doc=${o.doc_id}` }} /></div>
                </Card>
              </motion.div>); })}
          </div>
          <p className="font-mono text-[10px] text-muted">Severity is derived from the punishment clause; classification is inferred from the CrPC/BNSS First Schedule by the model and may be wrong for amended or state-modified provisions. Colors: {SEV.map((s, i) => <span key={s} style={{ color: SEVC[i] }}> {s}</span>)}.</p>
        </>
      )}
    </div>
  );
}
