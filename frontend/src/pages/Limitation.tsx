import { useState } from "react";
import { motion } from "framer-motion";
import { CalendarClock } from "lucide-react";
import { api, type LimRow } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { Card, ErrorBox, Input, PageHeader, Skeleton } from "@/components/shell/ui";
import { Chart, C } from "@/lib/plotly";
const today = () => new Date().toISOString().slice(0, 10);
export default function Limitation() {
  const [start, setStart] = useState(today()); const [q, setQ] = useState("");
  const r = useFetch(() => api.get<{ today: string; rows: LimRow[] }>(`/limitation?start=${start}`), [start]);
  const rows = (r.data?.rows ?? []).filter(x => !q || (x.matter + x.basis).toLowerCase().includes(q.toLowerCase()));
  const col = (d?: number) => d === undefined ? C.muted : d < 0 ? C.danger : d < 15 ? "#ff9f43" : d < 60 ? C.warning : C.success;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Deadlines" title="Limitation Clock" desc="Enter the date of the cause of action (the memo, the breach, the order). Every limitation period is computed from it, colour-coded by urgency. Indicative only — court holidays, condonation and s.4–s.15 exclusions are not applied." />
      <Card className="grid gap-3 p-5 md:grid-cols-[220px_1fr]"><label className="text-xs text-muted">Start / cause-of-action date<Input type="date" value={start} onChange={e => setStart(e.target.value)} className="mt-1" /></label><label className="text-xs text-muted">Filter<Input value={q} onChange={e => setQ(e.target.value)} placeholder="cheque, appeal, RTI, consumer…" className="mt-1" /></label></Card>
      {r.error && <ErrorBox error={r.error} />}
      {!r.data ? <Skeleton className="h-96" /> : (<>
        <Card className="p-4"><div className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary/80">Days remaining</div>
          <Chart height={Math.max(260, rows.length * 22)} data={[{ type: "bar", orientation: "h", y: rows.map(x => x.matter.slice(0, 42)), x: rows.map(x => x.days_left ?? 0), marker: { color: rows.map(x => col(x.days_left)) }, text: rows.map(x => x.deadline ?? "no fixed limit"), textposition: "outside", hovertemplate: "%{y}<br>%{x} days · due %{text}<extra></extra>" }]} layout={{ margin: { l: 260, r: 90, t: 10, b: 30 }, xaxis: { title: { text: "days left (negative = expired)" } }, yaxis: { autorange: "reversed" } }} /></Card>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((x, i) => <motion.div key={x.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * .04 }}>
            <Card className="h-full p-4" glow><div className="flex items-start justify-between gap-2"><div className="font-semibold text-white">{x.matter}</div><CalendarClock className="h-4 w-4 shrink-0" style={{ color: col(x.days_left) }} /></div>
              <div className="mt-2 font-display text-2xl tabular-nums" style={{ color: col(x.days_left), textShadow: `0 0 14px ${col(x.days_left)}66` }}>{x.days ? (x.days_left! < 0 ? `${-x.days_left!}d ago` : `${x.days_left}d`) : "—"}</div>
              <div className="font-mono text-[10px] text-muted">{x.days ? `${x.days} days · due ${x.deadline}` : "no fixed period (laches applies)"}</div>
              <div className="mt-2 text-xs text-muted">from {x.from}</div><div className="mt-1 font-mono text-[10px] text-primary">{x.basis}</div>
            </Card></motion.div>)}
        </div>
      </>)}
    </div>
  );
}
