import { useState } from "react";
import { Swords } from "lucide-react";
import { api, type ArgueOut, type Argument } from "@/lib/api";
import { Bullets, Button, Card, Empty, ErrorBox, Field, H3, Input, Meter, Page, Passages, PinButton, Progress, Section, Select, Skeleton, Stat, StatStrip, Tag, Textarea, Workbench } from "@/components/ui";
import { Chart, C } from "@/lib/plotly";
import { logActivity } from "@/lib/store";

// Model output: JSON mode guarantees the syntax, not that every list is present.
const list = <T,>(x: T[] | undefined): T[] => Array.isArray(x) ? x : [];
const sideOf = (s: ArgueOut["side_a"] | undefined, name: string) => ({ name: s?.name || name, arguments: list(s?.arguments) });
const SAMPLE = `Accused A, aged 24, was seen arguing with the deceased B outside a bar at 11 pm. Witnesses say B slapped A first. A picked up a beer bottle from a table, struck B once on the head and fled. B died in hospital two days later from a skull fracture. A surrendered the next morning and has no prior record. The post-mortem notes a single injury. CCTV covers the entrance but not the spot of the incident. A claims he acted in self-defence and in the heat of the moment.`;

export default function Arena() {
  const [facts, setFacts] = useState(""); const [forum, setForum] = useState("Sessions Court"); const [side, setSide] = useState("both"); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [out, setOut] = useState<ArgueOut | null>(null);
  async function run(f = facts) { if (f.trim().length < 20) return; setBusy(true); setErr(null); try { const r = await api.post<ArgueOut>("/argue", { facts: f, side, forum }); setOut({ ...r, issues: list(r.issues), pivotal_facts: list(r.pivotal_facts), questions_bench_may_ask: list(r.questions_bench_may_ask), passages: list(r.passages), side_a: sideOf(r.side_a, "Side A"), side_b: sideOf(r.side_b, "Side B"), confidence: Number(r.confidence) || 0 }); logActivity("arena", "Arguments built", "/app/arena"); } catch (e) { setErr(String(e)); } finally { setBusy(false); } }
  const avg = (a: Argument[]) => a.length ? a.reduce((n, x) => n + x.strength, 0) / a.length : 0;
  const md = out ? `# Argument map\n\n## Issues\n${out.issues.map(i => "- " + i).join("\n")}\n\n## ${out.side_a.name}\n${out.side_a.arguments.map(a => `- **${a.point}** (${a.strength}/5) — ${a.basis}`).join("\n")}\n\n## ${out.side_b.name}\n${out.side_b.arguments.map(a => `- **${a.point}** (${a.strength}/5) — ${a.basis}`).join("\n")}\n\n**Likely outcome:** ${out.likely_outcome}` : "";
  return (
    <Page title="Argument Arena" desc="Give the facts. LawLine retrieves the governing law, argues both sides with each point scored for strength and tied to a passage, and lists what the bench is likely to ask.">
      <Workbench input={
        <Card className="space-y-4">
          <Field label="Facts of the case" hint="At least 20 characters."><Textarea rows={9} value={facts} onChange={e => setFacts(e.target.value)} placeholder="Who did what, when, and what each side says…" /></Field>
          <Field label="Forum"><Input value={forum} onChange={e => setForum(e.target.value)} placeholder="e.g. Sessions Court, High Court" /></Field>
          <Field label="Focus"><Select value={side} onChange={e => setSide(e.target.value)}><option value="both">Both sides</option><option value="prosecution">Prosecution</option><option value="defence">Defence</option><option value="petitioner">Petitioner</option><option value="respondent">Respondent</option></Select></Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void run()} disabled={busy || facts.trim().length < 20}><Swords className="h-4 w-4" aria-hidden />{busy ? "Arguing…" : "Argue both sides"}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => { setFacts(SAMPLE); void run(SAMPLE); }}>Try a sample case</Button>
          </div>
        </Card>}>
        {err && <ErrorBox error={err} retry={() => void run()} />}
        {busy && <><Skeleton className="h-[104px]" /><div className="grid gap-5 md:grid-cols-2"><Skeleton className="h-80" /><Skeleton className="h-80" /></div></>}
        {!busy && !out && !err && <Empty icon={<Swords className="h-7 w-7" />} title="No arguments yet" desc="Enter the facts, or try the sample case to see a full two-sided argument map with strengths and bench questions." />}
        {!busy && out && (<>
          <StatStrip>
            <Stat label={out.side_a.name} value={`${avg(out.side_a.arguments).toFixed(1)} / 5`} sub={`average strength · ${out.side_a.arguments.length} arguments`} />
            <Stat label="Confidence in the likely outcome" value={`${Math.round(out.confidence * 100)}%`} sub={<Progress value={out.confidence} className="mt-1" />} />
            <Stat label={out.side_b.name} value={`${avg(out.side_b.arguments).toFixed(1)} / 5`} sub={`average strength · ${out.side_b.arguments.length} arguments`} />
          </StatStrip>
          <Card><H3>Likely outcome</H3><p className="mt-1.5 text-[14px] leading-relaxed text-ink">{out.likely_outcome}</p><div className="mt-4 border-t border-line pt-4"><PinButton labelled kind="argument" title="Argument map" body={md} meta={{ to: "/app/arena" }} /></div></Card>
          <div className="grid gap-5 md:grid-cols-2">
            <Side name={out.side_a.name} args={out.side_a.arguments} />
            <Side name={out.side_b.name} args={out.side_b.arguments} />
          </div>
          <Card className="grid gap-6 md:grid-cols-3">
            <div><H3 className="mb-2">Issues</H3><Bullets ordered items={out.issues} /></div>
            <div><H3 className="mb-2">Pivotal facts</H3><Bullets items={out.pivotal_facts} /></div>
            <div><H3 className="mb-2">The bench may ask</H3><Bullets items={out.questions_bench_may_ask.map(x => `“${x}”`)} /></div>
          </Card>
          <Section title="Strength by argument" desc="A1, A2 and so on are each side's arguments in the order listed above, scored out of 5.">
            <Chart height={320} data={[radar(out.side_a.arguments, out.side_a.name, C.primary), radar(out.side_b.arguments, out.side_b.name, C.danger)]} layout={{ polar: { radialaxis: { range: [0, 5], gridcolor: C.grid }, angularaxis: { gridcolor: C.grid }, bgcolor: "rgba(0,0,0,0)" }, margin: { l: 40, r: 40, t: 24, b: 24 } }} />
          </Section>
          <div><H3 className="mb-2">Passages the arguments cite</H3><Passages items={out.passages} compact /></div>
        </>)}
      </Workbench>
    </Page>
  );
}

function radar(a: Argument[], name: string, color: string) { const th = a.map((_, i) => `A${i + 1}`); return { type: "scatterpolar" as const, r: [...a.map(x => x.strength), a[0]?.strength ?? 0], theta: [...th, th[0] ?? ""], fill: "toself" as const, name, line: { color, width: 2 }, opacity: 0.75 }; }

function Side({ name, args }: { name: string; args: Argument[] }) {
  return (
    <Section title={name} desc={`${args.length} arguments`} flush>
      <ol className="divide-y divide-line border-t border-line">
        {args.map((a, i) => (
          <li key={i} className="px-5 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="text-[14px] font-medium text-ink"><span className="num mr-1.5 font-mono text-[12px] font-normal text-ink-3">A{i + 1}</span>{a.point}</div>
              <span className="flex shrink-0 items-center gap-2 pt-1"><Meter value={a.strength} label={`Strength ${a.strength} of 5`} /><span className="num text-[12px] text-ink-3">{a.strength}/5</span></span>
            </div>
            <p className="mt-1 text-[13.5px] text-ink-2">{a.basis}</p>
            {a.citations?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{a.citations.map(c => <Tag key={c} tone="accent" className="font-mono">[{c}]</Tag>)}</div>}
          </li>))}
      </ol>
    </Section>
  );
}
