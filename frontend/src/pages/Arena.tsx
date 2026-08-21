import { useState } from "react";
import { motion } from "framer-motion";
import { Swords, HelpCircle, Target } from "lucide-react";
import { api, type ArgueOut, type Argument } from "@/lib/api";
import { Badge, Button, Card, Empty, ErrorBox, Input, PageHeader, Passages, PinButton, Select, Skeleton, Textarea } from "@/components/shell/ui";
import { Ring } from "@/components/fx/Gauge";
import { Chart, C } from "@/lib/plotly";
import { logActivity } from "@/lib/store";
const SAMPLE = `Accused A, aged 24, was seen arguing with the deceased B outside a bar at 11 pm. Witnesses say B slapped A first. A picked up a beer bottle from a table, struck B once on the head and fled. B died in hospital two days later from a skull fracture. A surrendered the next morning and has no prior record. The post-mortem notes a single injury. CCTV covers the entrance but not the spot of the incident. A claims he acted in self-defence and in the heat of the moment.`;

export default function Arena() {
  const [facts, setFacts] = useState(""); const [forum, setForum] = useState("Sessions Court"); const [side, setSide] = useState("both"); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [out, setOut] = useState<ArgueOut | null>(null);
  async function run(f = facts) { if (f.trim().length < 20) return; setBusy(true); setErr(null); try { const r = await api.post<ArgueOut>("/argue", { facts: f, side, forum }); setOut(r); logActivity("arena", "Arguments built", "/app/arena"); } catch (e) { setErr(String(e)); } finally { setBusy(false); } }
  const avg = (a: Argument[]) => a.length ? a.reduce((n, x) => n + x.strength, 0) / a.length / 5 : 0;
  const md = out ? `# Argument map\n\n## Issues\n${out.issues.map(i => "- " + i).join("\n")}\n\n## ${out.side_a.name}\n${out.side_a.arguments.map(a => `- **${a.point}** (${a.strength}/5) — ${a.basis}`).join("\n")}\n\n## ${out.side_b.name}\n${out.side_b.arguments.map(a => `- **${a.point}** (${a.strength}/5) — ${a.basis}`).join("\n")}\n\n**Likely outcome:** ${out.likely_outcome}` : "";
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Moot court" title="Argument Arena" desc="Give the facts. LawLine retrieves the governing law, then argues both sides — each point scored for strength and tied to a passage — and predicts what the bench will ask." />
      <Card className="grid gap-3 p-5 lg:grid-cols-[1fr_200px_200px_auto]">
        <Textarea rows={3} value={facts} onChange={e => setFacts(e.target.value)} placeholder="Facts of the case…" aria-label="Facts" className="text-sm lg:col-span-4" />
        <Input aria-label="Forum" value={forum} onChange={e => setForum(e.target.value)} placeholder="Forum (e.g. Sessions Court, High Court)" />
        <Select aria-label="Side" value={side} onChange={e => setSide(e.target.value)}><option value="both">Both sides</option><option value="prosecution">Prosecution focus</option><option value="defence">Defence focus</option><option value="petitioner">Petitioner focus</option><option value="respondent">Respondent focus</option></Select>
        <Button variant="primary" onClick={() => void run()} disabled={busy || facts.trim().length < 20}><Swords className="h-4 w-4" />{busy ? "Arguing…" : "Enter the arena"}</Button>
        <Button variant="ghost" onClick={() => { setFacts(SAMPLE); void run(SAMPLE); }}>Sample case</Button>
      </Card>
      {err && <ErrorBox error={err} />}
      {busy && <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-96" /><Skeleton className="h-96" /></div>}
      {!busy && !out && <Empty icon={<Swords className="h-8 w-8" />} title="No arguments yet" desc="Enter facts above — try the sample to see a full two-sided argument map with strengths and bench questions." />}
      {!busy && out && (
        <motion.div initial="h" animate="s" variants={{ s: { transition: { staggerChildren: .08 } } }} className="space-y-6">
          <motion.div variants={{ h: { opacity: 0, y: 10 }, s: { opacity: 1, y: 0 } }} className="grid gap-4 md:grid-cols-[1fr_auto_1fr]">
            <Card className="flex items-center gap-4 p-4"><Ring value={avg(out.side_a.arguments)} size={72} stroke={6} color={C.primary} /><div><div className="font-mono text-[10px] uppercase tracking-wider text-primary">{out.side_a.name}</div><div className="text-sm text-muted">{out.side_a.arguments.length} arguments · avg strength {(avg(out.side_a.arguments) * 5).toFixed(1)}/5</div></div></Card>
            <Card className="flex flex-col items-center justify-center p-4 text-center"><Ring value={out.confidence} size={84} stroke={7} color={C.warning} sub="confidence" /><div className="mt-1 max-w-[220px] text-xs text-muted">{out.likely_outcome}</div></Card>
            <Card className="flex items-center gap-4 p-4 md:flex-row-reverse md:text-right"><Ring value={avg(out.side_b.arguments)} size={72} stroke={6} color={C.danger} /><div><div className="font-mono text-[10px] uppercase tracking-wider text-danger">{out.side_b.name}</div><div className="text-sm text-muted">{out.side_b.arguments.length} arguments · avg strength {(avg(out.side_b.arguments) * 5).toFixed(1)}/5</div></div></Card>
          </motion.div>
          <div className="grid gap-4 md:grid-cols-2">
            <Side name={out.side_a.name} args={out.side_a.arguments} hue={C.primary} /><Side name={out.side_b.name} args={out.side_b.arguments} hue={C.danger} />
          </div>
          <motion.div variants={{ h: { opacity: 0, y: 10 }, s: { opacity: 1, y: 0 } }} className="grid gap-4 lg:grid-cols-3">
            <Card><div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-warning"><Target className="h-3.5 w-3.5" />Issues</div><ul className="mt-2 space-y-2 text-sm">{out.issues.map((x, i) => <li key={i}>{i + 1}. {x}</li>)}</ul></Card>
            <Card><div className="font-mono text-[10px] uppercase tracking-[0.14em] text-success">Pivotal facts</div><ul className="mt-2 space-y-2 text-sm text-muted">{out.pivotal_facts.map((x, i) => <li key={i}>• {x}</li>)}</ul></Card>
            <Card><div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-secondary"><HelpCircle className="h-3.5 w-3.5" />The bench may ask</div><ul className="mt-2 space-y-2 text-sm text-muted">{out.questions_bench_may_ask.map((x, i) => <li key={i}>“{x}”</li>)}</ul></Card>
          </motion.div>
          <Card className="p-4"><div className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary/80">Strength radar</div>
            <Chart height={320} data={[radar(out.side_a.arguments, out.side_a.name, C.primary), radar(out.side_b.arguments, out.side_b.name, C.danger)]} layout={{ polar: { bgcolor: "rgba(255,255,255,.02)", radialaxis: { range: [0, 5], gridcolor: "rgba(139,155,180,.2)" }, angularaxis: { gridcolor: "rgba(139,155,180,.2)", tickfont: { size: 9 } } } }} /></Card>
          <div className="flex gap-2"><PinButton size="md" kind="argument" title="Argument map" body={md} meta={{ to: "/app/arena" }} /></div>
          <Card><div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Passages the arguments cite</div><Passages items={out.passages} compact /></Card>
        </motion.div>)}
    </div>
  );
}
function radar(a: Argument[], name: string, color: string) { const th = a.map((_, i) => `A${i + 1}`); return { type: "scatterpolar" as const, r: [...a.map(x => x.strength), a[0]?.strength ?? 0], theta: [...th, th[0] ?? ""], fill: "toself" as const, name, line: { color }, opacity: .8 }; }
function Side({ name, args, hue }: { name: string; args: Argument[]; hue: string }) {
  return <motion.div variants={{ h: { opacity: 0, y: 10 }, s: { opacity: 1, y: 0 } }}><Card className="h-full p-5" glow>
    <div className="font-display text-base tracking-wider" style={{ color: hue }}>{name}</div>
    <ul className="mt-3 space-y-3">{args.map((a, i) => <li key={i} className="rounded-[12px] border border-white/10 bg-black/20 p-3">
      <div className="flex items-start justify-between gap-2"><div className="font-semibold text-white">{a.point}</div><div className="flex shrink-0 gap-0.5">{[1, 2, 3, 4, 5].map(k => <motion.span key={k} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: .2 + k * .05 }} className="h-3 w-1.5 origin-bottom rounded-sm" style={{ background: k <= a.strength ? hue : "rgba(255,255,255,.1)", boxShadow: k <= a.strength ? `0 0 6px ${hue}` : undefined }} />)}</div></div>
      <p className="mt-1 text-sm text-muted">{a.basis}</p>{a.citations?.length > 0 && <div className="mt-2">{a.citations.map(c => <Badge key={c} kind="ok">[{c}]</Badge>)}</div>}
    </li>)}</ul></Card></motion.div>;
}
