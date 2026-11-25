import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, Minus, Search, Siren, X } from "lucide-react";
import { api, type Offence } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { Bullets, Button, Caption, Card, Chip, Empty, ErrorBox, H3, Input, Meter, Page, PinButton, Section, Skeleton, Tag } from "@/components/ui";
import { Chart, C } from "@/lib/plotly";

const SEV = ["None", "Minor", "Moderate", "Serious", "Grave", "Capital"];
const tone = (s: number) => (s >= 4 ? "bad" : s >= 2 ? "warn" : "ink") as "bad" | "warn" | "ink";
const QUICK = ["theft", "murder", "cheating", "rape", "dowry death", "defamation", "kidnapping", "criminal breach of trust", "hurt", "stalking", "forgery", "rioting", "extortion", "bribery", "attempt to murder"];
const maxTerm = (o: Offence) => o.punishment.death ? "Death" : o.punishment.life ? "Life" : o.punishment.max_years ? `${o.punishment.max_years} years` : "Not stated";

/** Yes / no / unknown fact, stated in words with an icon so it never relies on colour. */
function Tri({ v, yes, no }: { v: boolean | null; yes: string; no: string }) {
  const I = v === null ? Minus : v ? Check : X;
  return <span className="inline-flex items-center gap-1.5 text-[13.5px] text-ink"><I className="h-3.5 w-3.5 text-ink-3" aria-hidden />{v === null ? `${yes}: not determined` : v ? yes : no}</span>;
}

export default function OffencePage() {
  const [params, setParams] = useSearchParams(); const q0 = params.get("q") ?? ""; const [q, setQ] = useState(q0);
  const [seen, setSeen] = useState(q0); if (seen !== q0) { setSeen(q0); setQ(q0); }   // Back and Forward change the query: keep the box in step with the results
  const r = useFetch(() => q0 ? api.get<{ query: string; results: Offence[] }>(`/offence?q=${encodeURIComponent(q0)}`) : Promise.resolve(null), [q0]);
  const res = r.data?.results ?? [];
  const code = (o: Offence) => o.act.startsWith("Indian") ? "IPC" : "BNS";
  return (
    <Page title="Offence Lookup" desc="Name an offence in plain words. LawLine finds the IPC and BNS provisions, reads the punishment clause, and classifies cognizability, bailability and compoundability.">
      <Card>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (q.trim()) setParams({ q: q.trim() }); }}>
          <Input aria-label="Offence" value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. theft, dowry death, cheating, stalking…" />
          <Button variant="primary" type="submit"><Search className="h-4 w-4" />Look up</Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-1.5">{QUICK.map(x => <Chip key={x} active={x === q0} onClick={() => { setQ(x); setParams({ q: x }); }}>{x}</Chip>)}</div>
      </Card>
      {r.error && <ErrorBox error={r.error} />}
      {q0 && r.loading && <div className="grid gap-5 lg:grid-cols-2">{[0, 1].map(i => <Skeleton key={i} className="h-72" />)}</div>}
      {!q0 && <Empty icon={<Siren className="h-7 w-7" />} title="Search for an offence" desc="Use its common name or a section number. Both the 1860 code and the 2023 Sanhita are covered." />}
      {r.data && !r.loading && !res.length && <Empty title="No offence provision matched" desc="Try a different phrasing or the offence's common name." />}
      {res.length > 0 && !r.loading && (<>
        <div className="grid gap-5 lg:grid-cols-2">
          {res.map(o => { const sev = o.punishment.severity; const isIpc = code(o) === "IPC"; return (
            <Card key={o.doc_id} as="article" flush className="flex flex-col">
              <header className="border-b border-line p-5">
                <div className="flex flex-wrap items-center gap-2"><Tag>{isIpc ? "IPC 1860" : "BNS 2023"}</Tag>{o.concept && <span className="text-[13px] text-ink-3">{o.concept}</span>}</div>
                <h2 className="mt-2 font-serif text-[22px] font-medium leading-tight text-ink">Section {o.section}</h2>
                <p className="text-[14px] text-ink-2">{o.title.split(" — ")[0].replace(/^(Section\s+)?\d+[A-Z]*\.\s*/, "")}</p>
              </header>
              <dl className="grid grid-cols-3 divide-x divide-line border-b border-line">
                <div className="px-5 py-3"><dt className="text-[12.5px] text-ink-3">Maximum term</dt><dd className="mt-0.5 text-[15px] font-semibold text-ink">{maxTerm(o)}</dd></div>
                <div className="px-5 py-3"><dt className="text-[12.5px] text-ink-3">Fine</dt><dd className="mt-0.5 text-[15px] font-semibold text-ink">{o.punishment.fine ? "Yes" : "No"}</dd></div>
                <div className="px-5 py-3"><dt className="text-[12.5px] text-ink-3">Severity</dt><dd className="mt-0.5 flex items-center gap-2 text-[15px] font-semibold text-ink">{SEV[sev]}<Meter value={sev} tone={tone(sev)} label={`Severity ${sev} of 5`} /></dd></div>
              </dl>
              <div className="flex-1 space-y-4 p-5">
                {o.classification && <div className="flex flex-wrap gap-x-5 gap-y-1.5"><Tri v={o.classification.cognizable} yes="Cognizable" no="Non-cognizable" /><Tri v={o.classification.bailable} yes="Bailable" no="Non-bailable" /><Tri v={o.classification.compoundable} yes="Compoundable" no="Non-compoundable" />{o.classification.triable_by && <span className="text-[13.5px] text-ink">Triable by {o.classification.triable_by}</span>}</div>}
                {o.classification?.ingredients?.length ? <div><H3 className="mb-2">Essential ingredients</H3><Bullets items={o.classification.ingredients} /></div> : null}
                <p className="statute-sm line-clamp-4">{o.text.replace(/^.*?—\s*Section \S+\.\s*/, "")}</p>
              </div>
              <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
                <Link to={`/app/provisions?doc=${encodeURIComponent(o.doc_id)}`}><Button size="sm">Full text</Button></Link>
                <Link to={`/app/transition?act=${code(o)}&section=${encodeURIComponent(o.section)}`}><Button size="sm">{isIpc ? "BNS equivalent" : "IPC origin"}</Button></Link>
                <Link to={`/app/counsel?q=${encodeURIComponent(`Explain Section ${o.section} ${code(o)} with an example`)}`}><Button size="sm" variant="ghost">Ask Counsel</Button></Link>
                <span className="ml-auto"><PinButton kind="provision" title={`${code(o)} s.${o.section} — ${o.concept ?? "offence"}`} body={o.text} meta={{ to: `/app/provisions?doc=${encodeURIComponent(o.doc_id)}` }} /></span>
              </footer>
            </Card>); })}
        </div>
        {res.length > 1 && <Section title="Maximum imprisonment compared" desc="Years of imprisonment each provision allows. Life imprisonment is drawn as 20 years.">
          <Chart height={260} data={[{ type: "bar", x: res.map(o => `${code(o)} ${o.section}`), y: res.map(o => o.punishment.max_years ?? (o.punishment.life ? 20 : 0)), marker: { color: C.primary }, text: res.map(o => o.punishment.death ? "death" : o.punishment.life ? "life" : o.punishment.max_years ? `${o.punishment.max_years} y` : "—"), textposition: "outside", cliponaxis: false, hovertemplate: "%{x}<br>maximum: %{text}<extra></extra>" }]} layout={{ bargap: 0.55, yaxis: { title: { text: "years" } }, margin: { l: 48, r: 10, t: 24, b: 36 } }} />
        </Section>}
        <Caption>Severity is derived from the punishment clause. Cognizability, bailability and compoundability are inferred by the model from the First Schedule of the CrPC and BNSS, and may be wrong for amended or state-modified provisions. Verify before relying on them in a filing.</Caption>
      </>)}
    </Page>
  );
}
