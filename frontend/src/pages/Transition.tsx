import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowLeftRight, ArrowRight, MessageSquareText } from "lucide-react";
import { api, type MapRow, type Transition } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { Bullets, Button, Callout, Caption, Card, Chip, ErrorBox, Field, H3, Input, Page, PinButton, Section, Select, Skeleton, Tabs, Tag } from "@/components/ui";
import { Chart, C } from "@/lib/plotly";

const CODES = [["IPC", "Indian Penal Code, 1860 → Bharatiya Nyaya Sanhita, 2023"], ["CRPC", "Code of Criminal Procedure, 1973 → Bharatiya Nagarik Suraksha Sanhita, 2023"], ["IEA", "Indian Evidence Act, 1872 → Bharatiya Sakshya Adhiniyam, 2023"], ["BNS", "BNS 2023 → IPC 1860 (reverse)"], ["BNSS", "BNSS 2023 → CrPC 1973 (reverse)"], ["BSA", "BSA 2023 → Evidence Act 1872 (reverse)"]];
const QUICK = [["IPC", "302"], ["IPC", "420"], ["IPC", "498A"], ["IPC", "376"], ["IPC", "124A"], ["CRPC", "438"], ["CRPC", "154"], ["IEA", "65B"], ["BNS", "103"]];
const SHORT: Record<string, string> = { "Indian Penal Code, 1860": "IPC", "Bharatiya Nyaya Sanhita, 2023": "BNS", "Code of Criminal Procedure Act, 1973": "CrPC", "Bharatiya Nagarik Suraksha Sanhita, 2023": "BNSS", "Indian Evidence Act, 1872": "IEA", "Bharatiya Sakshya Adhiniyam, 2023": "BSA" };
const clean = (t: string) => t.replace(/^.*?—\s*(Section|Article) \S+\.\s*/, "").replace(/^Section \S+ of the [^.]+\.\s*/, "");
const codeOf = (act: string) => act.startsWith("Indian Penal") ? "IPC" : act.startsWith("Code") ? "CRPC" : "IEA";

export default function TransitionPage() {
  const [params, setParams] = useSearchParams(); const act = params.get("act") ?? "IPC"; const section = params.get("section") ?? "302";
  const [a, setA] = useState(act); const [s, setS] = useState(section); const [tab, setTab] = useState<"bridge" | "map">("bridge"); const [filter, setFilter] = useState("");
  const t = useFetch(() => api.get<Transition>(`/transition?act=${act}&section=${encodeURIComponent(section)}`), [act, section]);
  const map = useFetch(() => api.get<MapRow[]>("/transition/map"));
  const rows = useMemo(() => (map.data ?? []).filter(r => !filter || (r.old_section + " " + r.new_sections.join(" ") + " " + r.concepts.join(" ") + " " + r.old_act).toLowerCase().includes(filter.toLowerCase())), [map.data, filter]);
  const sankey = useMemo(() => { const rs = (map.data ?? []).filter(r => r.old_act.startsWith("Indian Penal")).slice(0, 60); const labels = [...rs.map(r => `IPC ${r.old_section}`), ...Array.from(new Set(rs.flatMap(r => r.new_sections.map(n => `BNS ${n}`))))]; const idx = (l: string) => labels.indexOf(l); return { labels, source: rs.flatMap(r => r.new_sections.map(() => idx(`IPC ${r.old_section}`))), target: rs.flatMap(r => r.new_sections.map(n => idx(`BNS ${n}`))) }; }, [map.data]);
  const go = (x: string, y: string) => { setA(x); setS(y); setParams({ act: x, section: y }); };
  const d = t.data;
  return (
    <Page title="IPC → BNS Bridge" desc="India replaced the IPC, the CrPC and the Evidence Act on 1 July 2024. Enter a section of an old or a new code to see its counterpart, read both texts side by side, and see what changed.">
      <Tabs value={tab} onChange={setTab} items={[{ id: "bridge", label: "Bridge" }, { id: "map", label: "Full map", count: map.data?.length }]} />
      {tab === "bridge" ? (<>
        <Card>
          <form className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_140px_auto]" onSubmit={e => { e.preventDefault(); setParams({ act: a, section: s.trim().toUpperCase() }); }}>
            <Field label="Code"><Select value={a} onChange={e => setA(e.target.value)}>{CODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="Section"><Input value={s} onChange={e => setS(e.target.value)} placeholder="e.g. 302" /></Field>
            <Button type="submit" variant="primary"><ArrowLeftRight className="h-4 w-4" aria-hidden />Bridge</Button>
          </form>
          <div className="mt-4 flex flex-wrap items-center gap-2"><Caption>Common lookups</Caption>{QUICK.map(([x, y]) => <Chip key={x + y} active={act === x && section === y} onClick={() => go(x, y)} className="num">{x} {y}</Chip>)}</div>
        </Card>
        {t.error ? <ErrorBox error={t.error} /> : t.loading || !d ? <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)]"><Skeleton className="h-80" /><div /><Skeleton className="h-80" /></div> : (<>
          <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)]">
            {d.old ? <Panel title={`${SHORT[d.old.act] ?? d.old.act} · Section ${d.old.section}`} sub={d.old.act} text={clean(d.old.text)} doc={d.old.doc_id} /> : <Callout tone="warn" title="No source provision found">Nothing in the corpus matches that code and section number.</Callout>}
            <div className="flex items-center justify-center text-ink-3 md:pt-10" aria-hidden><ArrowRight className="hidden h-5 w-5 md:block" /><ArrowDown className="h-5 w-5 md:hidden" /></div>
            <div className="space-y-4">{d.new.length ? d.new.map(n => <Panel key={n.doc_id} title={`${SHORT[n.act] ?? n.act} · Section ${n.section}`} sub={n.act} text={clean(n.text)} doc={n.doc_id} />) : <Callout tone="warn" title="No counterpart recorded">This provision has no mapped counterpart in the curated table. It may have been repealed without replacement, as s.377 and s.309 of the IPC were.</Callout>}</div>
          </div>
          {d.diff && <Section title="What changed" desc="Written by the model from the two texts above. Check it against them before relying on it."
            actions={<><PinButton labelled kind="comparison" title={`${act} ${section} → 2023 code`} body={`${d.diff.summary}\n\nChanges:\n${d.diff.changes.map(c => "- " + c).join("\n")}`} meta={{ to: `/app/transition?act=${act}&section=${section}` }} /><Link to={`/app/counsel?q=${encodeURIComponent(`What changed between ${act} section ${section} and its BNS/BNSS/BSA equivalent?`)}`}><Button size="sm"><MessageSquareText className="h-4 w-4" aria-hidden />Ask Counsel</Button></Link></>}>
            <p className="max-w-[72ch] text-[15px] text-ink">{d.diff.summary}</p>
            <div className="mt-5 grid gap-x-10 gap-y-6 md:grid-cols-2">
              <div><H3 className="mb-2">Changed</H3>{d.diff.changes.length ? <Bullets items={d.diff.changes} /> : <Caption>Nothing of substance.</Caption>}</div>
              <div><H3 className="mb-2">Unchanged</H3>{d.diff.unchanged.length ? <Bullets items={d.diff.unchanged} className="text-ink-2" /> : <Caption>Nothing listed.</Caption>}</div>
            </div>
            <dl className="mt-5 grid overflow-hidden rounded-lg border border-line sm:grid-cols-2">
              <div className="border-b border-line p-4 sm:border-b-0 sm:border-r"><dt className="text-[12.5px] text-ink-3">Punishment before</dt><dd className="mt-1 text-[14px] text-ink">{d.diff.severity_old || "Not stated"}</dd></div>
              <div className="p-4"><dt className="text-[12.5px] text-ink-3">Punishment now</dt><dd className="mt-1 text-[14px] text-ink">{d.diff.severity_new || "Not stated"}</dd></div>
            </dl>
            {d.concepts.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{d.concepts.map(c => <Tag key={c}>{c}</Tag>)}</div>}
          </Section>}
        </>)}
      </>) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          <Section flush title="Every recorded mapping" desc="Select a row to open it in the bridge." actions={<Input aria-label="Filter the map" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter: 420, bail, evidence…" className="h-8 w-56 text-[13px]" />}>
            {map.error ? <div className="px-5 pb-5"><ErrorBox error={map.error} /></div> : !map.data ? <div className="px-5 pb-5"><Skeleton className="h-96" /></div> : (<>
              <div className="max-h-[620px] overflow-auto"><table className="tbl"><thead className="sticky"><tr><th className="pl-5">Old code</th><th>2023 code</th><th className="pr-5">Concepts</th></tr></thead>
                <tbody>{rows.map(r => <tr key={r.old_act + r.old_section} className="row-link" onClick={() => { go(codeOf(r.old_act), r.old_section); setTab("bridge"); }}>
                  <td className="mono pl-5 text-ink">{SHORT[r.old_act]} {r.old_section}</td><td className="mono text-ink">{SHORT[r.new_act]} {r.new_sections.join(", ")}</td><td className="pr-5 text-ink-3">{r.concepts.slice(0, 3).join(" · ")}</td></tr>)}</tbody></table></div>
              <Caption className="num border-t border-line px-5 py-3">{rows.length.toLocaleString()} {rows.length === 1 ? "mapping" : "mappings"}</Caption>
            </>)}
          </Section>
          <Section title="IPC to BNS flow" desc="The first sixty IPC mappings. Several old sections often merge into one new section.">
            {map.data ? <>
              <Chart height={600} data={[{ type: "sankey", arrangement: "snap", node: { pad: 6, thickness: 10, line: { width: 0 }, label: sankey.labels, color: sankey.labels.map(l => l.startsWith("IPC") ? C.muted : C.primary) }, link: { source: sankey.source, target: sankey.target, value: sankey.source.map(() => 1), color: "rgba(107,113,124,.16)" } } as never]} layout={{ margin: { l: 4, r: 4, t: 8, b: 8 }, font: { size: 10 } }} />
              <ul className="mt-2 flex gap-4 text-[12.5px] text-ink-3"><li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: C.muted }} aria-hidden />IPC, 1860</li><li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: C.primary }} aria-hidden />BNS, 2023</li></ul>
            </> : <Skeleton className="h-[600px]" />}
          </Section>
        </div>)}
    </Page>
  );
}

function Panel({ title, sub, text, doc }: { title: string; sub: string; text: string; doc?: string }) {
  return (
    <Card as="article">
      <h2 className="font-serif text-[20px] font-medium leading-tight text-ink">{title}</h2>
      <Caption className="mt-0.5">{sub}</Caption>
      <p className="statute-sm mt-3 max-h-80 overflow-auto pr-1">{text}</p>
      {doc && <Link to={`/app/provisions?doc=${encodeURIComponent(doc)}`} className="link mt-3 inline-block text-[13px]">Open in Provision Explorer</Link>}
    </Card>
  );
}
