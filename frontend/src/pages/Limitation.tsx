import { useState } from "react";
import { api, type LimRow } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { Callout, Caption, Card, ErrorBox, Field, Input, Page, Section, Skeleton, Tag } from "@/components/ui";
import { Chart, C, PALETTE } from "@/lib/plotly";

const today = () => new Date().toISOString().slice(0, 10);
type Band = { id: string; label: string; tone: "bad" | "warn" | "ok" | "neutral"; color: string };
/** Urgency bands. The table states the band in words; the chart uses the matching colour. */
const BANDS: Band[] = [
  { id: "expired", label: "Expired", tone: "bad", color: C.danger },
  { id: "soon", label: "Under 15 days", tone: "bad", color: C.warning },
  { id: "near", label: "15 to 59 days", tone: "warn", color: PALETTE[3] },
  { id: "later", label: "60 days or more", tone: "ok", color: C.success },
  { id: "none", label: "No fixed period", tone: "neutral", color: C.muted },
];
const band = (x: LimRow) => BANDS[!x.days || x.days_left === undefined ? 4 : x.days_left < 0 ? 0 : x.days_left < 15 ? 1 : x.days_left < 60 ? 2 : 3];
const left = (x: LimRow) => !x.days || x.days_left === undefined ? "No fixed period" : x.days_left < 0 ? `Expired ${-x.days_left} ${x.days_left === -1 ? "day" : "days"} ago` : x.days_left === 0 ? "Due today" : `${x.days_left} ${x.days_left === 1 ? "day" : "days"} left`;
const fmt = (d?: string) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

export default function Limitation() {
  const [start, setStart] = useState(today()); const [q, setQ] = useState("");
  const r = useFetch(() => api.get<{ today: string; rows: LimRow[] }>(`/limitation?start=${start}`), [start]);
  const rows = (r.data?.rows ?? []).filter(x => !q || (x.matter + x.basis).toLowerCase().includes(q.toLowerCase()));
  return (
    <Page title="Limitation Clock" desc="Enter the date the cause of action arose: the bank memo, the breach, the order. Every limitation period is counted from that date and compared with today.">
      <Card className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
        <Field label="Date of the cause of action"><Input type="date" value={start} onChange={e => setStart(e.target.value)} /></Field>
        <Field label="Filter matters"><Input value={q} onChange={e => setQ(e.target.value)} placeholder="cheque, appeal, RTI, consumer…" /></Field>
      </Card>
      <Callout tone="warn">Indicative only. Court holidays, condonation of delay and the exclusions in sections 4 to 15 of the Limitation Act are not applied.</Callout>
      {r.error && <ErrorBox error={r.error} />}
      {r.loading || !r.data ? !r.error && <Skeleton className="h-96" /> : !rows.length ? <Caption className="py-8 text-center">No matter matches that filter.</Caption> : (<>
        <Section title="Days remaining" desc="Counted from today. A bar to the left of zero is a period that has already run out.">
          <Chart height={Math.max(260, rows.length * 26 + 60)} data={[{ type: "bar", orientation: "h", y: rows.map(x => x.matter.slice(0, 44)), x: rows.map(x => x.days_left ?? 0), marker: { color: rows.map(x => band(x).color) }, text: rows.map(x => x.deadline ? fmt(x.deadline) : "no fixed period"), textposition: "outside", cliponaxis: false, hovertemplate: "%{y}<br>%{x} days · %{text}<extra></extra>" }]}
            layout={{ margin: { l: 280, r: 110, t: 8, b: 44 }, xaxis: { showgrid: true, title: { text: "days left" } }, yaxis: { autorange: "reversed", showgrid: false } }} />
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-3">{BANDS.map(b => <li key={b.id} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: b.color }} aria-hidden />{b.label}</li>)}</ul>
        </Section>
        <Section flush title="Deadlines" desc={`${rows.length} ${rows.length === 1 ? "matter" : "matters"}, counted from ${fmt(start)}.`}>
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th className="pl-5">Matter</th><th>Runs from</th><th className="text-right">Period</th><th>Deadline</th><th>Status</th><th className="pr-5">Basis</th></tr></thead>
            <tbody>{rows.map(x => { const b = band(x); return (
              <tr key={x.id}>
                <td className="pl-5 font-medium text-ink">{x.matter}</td>
                <td className="text-ink-2">{x.from}</td>
                <td className="mono text-right">{x.days ? `${x.days} days` : "none"}</td>
                <td className="mono whitespace-nowrap">{x.deadline ? fmt(x.deadline) : "laches applies"}</td>
                <td className="whitespace-nowrap"><Tag tone={b.tone} className="num">{left(x)}</Tag></td>
                <td className="pr-5 text-ink-3">{x.basis}</td>
              </tr>); })}</tbody></table></div>
        </Section>
      </>)}
    </Page>
  );
}
