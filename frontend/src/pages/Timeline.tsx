import { useState } from "react";
import { Building2, ChevronRight, FileText, Flame, Gavel, HelpCircle, ListTree, Mail, ScrollText, Siren, type LucideIcon } from "lucide-react";
import { api, type TimelineOut } from "@/lib/api";
import { Bullets, Button, Callout, Card, Empty, ErrorBox, Field, Page, PinButton, Section, Skeleton, Textarea, Workbench } from "@/components/ui";
import { Chart, C } from "@/lib/plotly";
import { logActivity } from "@/lib/store";
import { cn } from "@/lib/utils";

const KIND: Record<string, LucideIcon> = { incident: Flame, police: Siren, court: Gavel, filing: FileText, order: ScrollText, contract: Building2, notice: Mail, other: HelpCircle };
const SAMPLE = `On 3 January 2023, Priya entered into a sale agreement with Mr. Rao for a flat in Bengaluru for Rs 85 lakh and paid Rs 10 lakh as advance. The agreement required registration of the sale deed by 30 April 2023. On 15 March 2023 Rao sent an email saying the price had gone up and demanded Rs 95 lakh. Priya sent a legal notice on 2 May 2023 calling upon him to execute the sale deed. Rao replied on 20 May 2023 refusing and claiming the agreement was cancelled. In June 2023 Priya learned that Rao had sold the flat to a third party on 10 June 2023. She filed a suit for specific performance on 12 January 2024 before the City Civil Court, along with an application for temporary injunction, which was heard on 5 February 2024 and an interim order was passed restraining further alienation. The written statement was filed on 28 March 2024.`;
// The model is asked for YYYY, YYYY-MM or YYYY-MM-DD but may write anything; an unparseable date is left off the chart.
const toDate = (d: string | null) => { if (!d) return null; const p = d.split("-").map(Number); const t = new Date(p[0], (p[1] ?? 1) - 1, p[2] ?? 1); return isNaN(t.getTime()) ? null : t; };
// Local calendar date: toISOString() is UTC, which puts every Indian midnight on the previous day.
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const list = <T,>(x: T[] | undefined): T[] => Array.isArray(x) ? x : [];

export default function TimelinePage() {
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [out, setOut] = useState<TimelineOut | null>(null); const [sel, setSel] = useState<number | null>(null);
  async function run(t = text) { if (t.trim().length < 40) return; setBusy(true); setErr(null); setSel(null); try { const r = await api.post<TimelineOut>("/timeline", { text: t }); const events = list(r.events); setOut({ events, gaps: list(r.gaps), limitation_flags: list(r.limitation_flags) }); logActivity("timeline", `${events.length}-event timeline built`, "/app/timeline"); } catch (e) { setErr(String(e)); } finally { setBusy(false); } }
  const ev = out?.events ?? []; const dated = ev.map((e, i) => ({ ...e, i, d: toDate(e.date) })).filter(e => e.d);
  return (
    <Page title="Case Timeline" desc="Describe what happened in plain words. LawLine extracts the dated events, classifies them, lists the facts a lawyer would still ask for, and warns where limitation may be running.">
      <Workbench input={
        <Card className="space-y-4">
          <Field label="What happened" hint="Include dates wherever you know them.">
            <Textarea rows={14} value={text} onChange={e => setText(e.target.value)} placeholder="Tell the story with dates…" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void run()} disabled={busy || text.trim().length < 40}><ListTree className="h-4 w-4" aria-hidden />{busy ? "Extracting…" : "Build timeline"}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => { setText(SAMPLE); void run(SAMPLE); }}>Try a sample</Button>
          </div>
          {out && <div className="border-t border-line pt-4"><PinButton labelled kind="timeline" title={`Timeline · ${ev.length} events`} body={ev.map(e => `- **${e.date ?? "undated"}** — ${e.label}: ${e.detail}`).join("\n")} meta={{ to: "/app/timeline" }} /></div>}
        </Card>}>
        {err && <ErrorBox error={err} retry={() => void run()} />}
        {busy && <><Skeleton className="h-56" /><Skeleton className="h-80" /></>}
        {!busy && !out && !err && <Empty icon={<ListTree className="h-7 w-7" />} title="The timeline will appear here" desc="A chart of events by date and a chronology you can open event by event for its legal significance." />}
        {!busy && out && (<>
          {out.limitation_flags?.length > 0 && <Callout tone="bad" title="Limitation flags"><Bullets items={out.limitation_flags} /></Callout>}
          {dated.length > 1 && (
            <Section title="Events over time" desc="Each dated event, by kind. Hover a point for its date.">
              <Chart height={240} data={[{ type: "scatter", mode: "text+markers", x: dated.map(e => ymd(e.d!)), y: dated.map(e => e.kind), text: dated.map(e => (e.label ?? "").slice(0, 22)), textposition: "top center", textfont: { size: 10, color: C.sub }, marker: { size: 12, color: C.primary, line: { color: C.surface, width: 2 } }, hovertemplate: "%{x}<br>%{text}<extra></extra>" }]} layout={{ margin: { l: 70, r: 20, t: 30, b: 36 }, yaxis: { type: "category" }, xaxis: { type: "date" } }} />
            </Section>)}
          <Section title="Chronology" desc={`${ev.length} events. Select one to see why it matters legally.`}>
            <ol>
              {ev.map((e, i) => { const I = KIND[e.kind] ?? KIND.other; const open = sel === i; return (
                <li key={i} className="relative flex gap-4 pb-5 last:pb-0">
                  {i < ev.length - 1 && <span className="absolute bottom-0 left-[13px] top-7 w-px bg-line" aria-hidden />}
                  <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-ink-3"><I className="h-3.5 w-3.5" aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <button onClick={() => setSel(open ? null : i)} aria-expanded={open} className="group w-full text-left">
                      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                        <span className="num font-mono text-[12px] text-ink-3">{e.date ?? "undated"}</span>
                        <span className="text-[14px] font-semibold text-ink group-hover:text-accent">{e.label}</span>
                        <span className="text-[12px] capitalize text-ink-3">{e.kind}</span>
                        <ChevronRight className={cn("ml-auto h-3.5 w-3.5 shrink-0 self-center text-ink-3 transition-transform", open && "rotate-90")} aria-hidden />
                      </div>
                      <p className="mt-1 text-[14px] text-ink-2">{e.detail}</p>
                    </button>
                    {open && <div className="mt-2 rounded-md border border-line bg-sunken p-3 text-[13.5px]"><div className="font-medium text-ink">Legal significance</div><p className="mt-0.5 text-ink-2">{e.legal_significance}</p>{e.actors?.length > 0 && <p className="mt-1.5 text-ink-3">Actors: {e.actors.join(", ")}</p>}</div>}
                  </div>
                </li>); })}
            </ol>
          </Section>
          {out.gaps?.length > 0 && <Callout tone="warn" title="A lawyer would ask"><Bullets items={out.gaps} /></Callout>}
        </>)}
      </Workbench>
    </Page>
  );
}
