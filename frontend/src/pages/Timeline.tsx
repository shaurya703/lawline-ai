import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Building2, FileText, Flame, Gavel, HelpCircle, ListTree, Mail, ScrollText, Siren, type LucideIcon } from "lucide-react";
import { api, type TimelineOut } from "@/lib/api";
import { Button, Card, Empty, ErrorBox, PageHeader, PinButton, Skeleton, Textarea } from "@/components/shell/ui";
import { Chart } from "@/lib/plotly";
import { logActivity } from "@/lib/store";
const KIND: Record<string, { icon: LucideIcon; hue: string }> = { incident: { icon: Flame, hue: "#ff4d6d" }, police: { icon: Siren, hue: "#ff9f43" }, court: { icon: Gavel, hue: "#7c4dff" }, filing: { icon: FileText, hue: "#00e5ff" }, order: { icon: ScrollText, hue: "#2ee6a6" }, contract: { icon: Building2, hue: "#ffd166" }, notice: { icon: Mail, hue: "#48dbfb" }, other: { icon: HelpCircle, hue: "#8b9bb4" } };
const SAMPLE = `On 3 January 2023, Priya entered into a sale agreement with Mr. Rao for a flat in Bengaluru for Rs 85 lakh and paid Rs 10 lakh as advance. The agreement required registration of the sale deed by 30 April 2023. On 15 March 2023 Rao sent an email saying the price had gone up and demanded Rs 95 lakh. Priya sent a legal notice on 2 May 2023 calling upon him to execute the sale deed. Rao replied on 20 May 2023 refusing and claiming the agreement was cancelled. In June 2023 Priya learned that Rao had sold the flat to a third party on 10 June 2023. She filed a suit for specific performance on 12 January 2024 before the City Civil Court, along with an application for temporary injunction, which was heard on 5 February 2024 and an interim order was passed restraining further alienation. The written statement was filed on 28 March 2024.`;
const toDate = (d: string | null) => { if (!d) return null; const p = d.split("-").map(Number); return new Date(p[0], (p[1] ?? 1) - 1, p[2] ?? 1); };

export default function TimelinePage() {
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [out, setOut] = useState<TimelineOut | null>(null); const [sel, setSel] = useState<number | null>(null);
  async function run(t = text) { if (t.trim().length < 40) return; setBusy(true); setErr(null); setSel(null); try { const r = await api.post<TimelineOut>("/timeline", { text: t }); setOut(r); logActivity("timeline", `${r.events.length}-event timeline built`, "/app/timeline"); } catch (e) { setErr(String(e)); } finally { setBusy(false); } }
  const ev = out?.events ?? []; const dated = ev.map((e, i) => ({ ...e, i, d: toDate(e.date) })).filter(e => e.d);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Chronology builder" title="Case Timeline" desc="Describe what happened in plain words. LawLine extracts dated events, classifies them, flags missing facts a lawyer would ask about, and warns about limitation." />
      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        <Card className="space-y-3 p-5"><Textarea rows={14} value={text} onChange={e => setText(e.target.value)} placeholder="Tell the story with dates…" aria-label="Facts" className="text-sm" />
          <div className="flex flex-wrap gap-2"><Button variant="primary" onClick={() => void run()} disabled={busy || text.trim().length < 40}><ListTree className="h-4 w-4" />{busy ? "Extracting…" : "Build timeline"}</Button><Button variant="ghost" onClick={() => { setText(SAMPLE); void run(SAMPLE); }}>Try a sample</Button></div>
          {out && <div className="flex flex-wrap gap-2"><PinButton size="md" kind="timeline" title={`Timeline · ${ev.length} events`} body={ev.map(e => `- **${e.date ?? "undated"}** — ${e.label}: ${e.detail}`).join("\n")} meta={{ to: "/app/timeline" }} /></div>}
        </Card>
        <div className="space-y-4">
          {err && <ErrorBox error={err} />}
          {busy && <><Skeleton className="h-56" /><Skeleton className="h-80" /></>}
          {!busy && !out && <Empty icon={<ListTree className="h-8 w-8" />} title="Timeline appears here" desc="An interactive chronology plus a scatter of events by date — hover for details." />}
          {!busy && out && (<>
            {dated.length > 1 && <Card className="p-4"><div className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary/80">Events over time</div>
              <Chart height={220} data={[{ type: "scatter", mode: "text+markers", x: dated.map(e => e.d!.toISOString().slice(0, 10)), y: dated.map(e => e.kind), text: dated.map(e => e.label.slice(0, 22)), textposition: "top center", textfont: { size: 10 }, marker: { size: 14, color: dated.map(e => (KIND[e.kind] ?? KIND.other).hue), line: { color: "#fff", width: 1 } }, hovertemplate: "%{x}<br>%{text}<extra></extra>" }]} layout={{ margin: { l: 70, r: 20, t: 30, b: 40 }, yaxis: { type: "category" }, xaxis: { type: "date" } }} /></Card>}
            <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
              <Card className="p-6">
                <ol className="relative">
                  {ev.map((e, i) => { const k = KIND[e.kind] ?? KIND.other; const I = k.icon; return (
                    <motion.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * .06 }} className="relative flex gap-4 border-l border-white/10 pb-6 pl-8 last:pb-0">
                      <span className="absolute -left-[15px] flex h-[30px] w-[30px] items-center justify-center rounded-full border bg-bg" style={{ borderColor: k.hue, boxShadow: `0 0 14px ${k.hue}66` }}><I className="h-3.5 w-3.5" style={{ color: k.hue }} /></span>
                      <button onClick={() => setSel(sel === i ? null : i)} className="w-full cursor-pointer text-left">
                        <div className="flex flex-wrap items-baseline gap-2"><span className="font-mono text-[11px]" style={{ color: k.hue }}>{e.date ?? "undated"}</span><span className="font-semibold text-white">{e.label}</span><span className="font-mono text-[9px] uppercase text-muted">{e.kind}</span></div>
                        <p className="mt-1 text-sm text-muted">{e.detail}</p>
                        {sel === i && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 rounded-[10px] border border-white/10 bg-black/20 p-3 text-xs"><div className="font-mono text-[9px] uppercase text-primary">Legal significance</div>{e.legal_significance}{e.actors?.length > 0 && <div className="mt-1 text-muted">Actors: {e.actors.join(", ")}</div>}</motion.div>}
                      </button>
                    </motion.li>); })}
                </ol>
              </Card>
              <div className="space-y-4">
                {out.limitation_flags?.length > 0 && <Card className="border-danger/30 p-4"><div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-danger"><AlertTriangle className="h-3.5 w-3.5" />Limitation flags</div><ul className="mt-2 space-y-2 text-sm">{out.limitation_flags.map((f, i) => <li key={i}>• {f}</li>)}</ul></Card>}
                {out.gaps?.length > 0 && <Card className="p-4"><div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-warning"><HelpCircle className="h-3.5 w-3.5" />A lawyer would ask</div><ul className="mt-2 space-y-2 text-sm text-muted">{out.gaps.map((f, i) => <li key={i}>• {f}</li>)}</ul></Card>}
                <Card className="p-4"><div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Legend</div><div className="mt-2 grid grid-cols-2 gap-1">{Object.entries(KIND).map(([k, v]) => <div key={k} className="flex items-center gap-2 text-xs text-muted"><span className="h-2 w-2 rounded-full" style={{ background: v.hue }} />{k}</div>)}</div></Card>
              </div>
            </div>
          </>)}
        </div>
      </div>
    </div>
  );
}
