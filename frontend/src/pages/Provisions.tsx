import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeftRight, Columns3, MessageSquareText, Network, Wand2 } from "lucide-react";
import { api, type Simplified } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { Button, Callout, Caption, Card, CopyButton, ErrorBox, Field, Input, Page, PinButton, Section, Select, Skeleton, Tabs, Tag } from "@/components/ui";
import { Chart, C } from "@/lib/plotly";
import CorpusScatter from "@/components/CorpusScatter";
import { cn } from "@/lib/utils";

type Act = { act: string; sections: number; year: number | null };
type Sec = { section: string; title: string; doc_id: string };
type Prov = { doc_id: string; act: string; section: string; title: string; citation: string; text: string; cites: { id: string; label: string; court: string; year: number }[]; refers_to: string[]; concepts: string[] };
const FAV = ["Indian Penal Code, 1860", "Bharatiya Nyaya Sanhita, 2023", "Constitution of India, 1949", "Code of Criminal Procedure Act, 1973", "Bharatiya Nagarik Suraksha Sanhita, 2023", "Indian Evidence Act, 1872", "Indian Contract Act, 1872", "Negotiable Instruments Act, 1881"];
const CODE: Record<string, string> = { "Indian Penal Code, 1860": "IPC", "Bharatiya Nyaya Sanhita, 2023": "BNS", "Code of Criminal Procedure Act, 1973": "CRPC", "Bharatiya Nagarik Suraksha Sanhita, 2023": "BNSS", "Indian Evidence Act, 1872": "IEA", "Bharatiya Sakshya Adhiniyam, 2023": "BSA" };
/** "Section 302. Murder — Indian Penal Code, 1860" -> "Murder" */
const heading = (title: string) => title.split(" — ")[0].replace(/^(Section|Article)\s+\S+\.\s*/i, "").replace(/^\d+[A-Z]*\.\s*/, "").trim();
/** The stored text repeats "Act — Section N." in front of the provision; the pane already shows that as its heading. */
const body = (text: string) => text.replace(/^.*?—\s*(Section|Article) \S+\.\s*/, "");
const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export default function Provisions() {
  const [params, setParams] = useSearchParams(); const nav = useNavigate();
  const acts = useFetch(() => api.get<Act[]>("/acts"));
  const [act, setAct] = useState(params.get("act") ?? FAV[0]); const [q, setQ] = useState(""); const [doc, setDoc] = useState<string | null>(params.get("doc"));
  const [simple, setSimple] = useState<Simplified | null>(null); const [simpleBusy, setSimpleBusy] = useState(false); const [view, setView] = useState<"largest" | "years">("largest");
  const wantSec = params.get("sec");
  const secs = useFetch(() => api.get<Sec[]>(`/acts/sections?act=${encodeURIComponent(act)}&q=${encodeURIComponent(q)}`), [act, q]);
  const prov = useFetch(() => doc ? api.get<Prov>(`/provision?doc_id=${encodeURIComponent(doc)}`) : Promise.resolve(null), [doc]);
  useEffect(() => { if (prov.data?.act && prov.data.act !== act) setAct(prov.data.act); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prov.data]);
  useEffect(() => { if (!doc && secs.data?.length) { const hit = wantSec ? secs.data.find(x => x.section.toUpperCase() === wantSec.toUpperCase()) : null; setDoc((hit ?? secs.data[0]).doc_id); } }, [secs.data, doc, wantSec]);
  useEffect(() => { setSimple(null); }, [doc]);
  const simplify = async () => { if (!prov.data) return; setSimpleBusy(true); try { setSimple(await api.post<Simplified>("/simplify", { text: prov.data.text.slice(0, 6000), level: "layperson" })); } finally { setSimpleBusy(false); } };
  const pickAct = (a: string) => { setAct(a); setDoc(null); setParams({}); };
  const isConst = act.startsWith("Constitution"); const unit = isConst ? "Art." : "s."; const word = isConst ? "Article" : "Section";
  const top = (acts.data ?? []).slice(0, 30); const p = prov.data;
  return (
    <Page title="Provision Explorer" desc="Browse more than a thousand central Acts section by section. Read the text, get it in plain words, and see which judgments cite it.">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="space-y-4 lg:sticky lg:top-[76px]" as="aside">
          <Field label="Act"><Select value={act} onChange={e => pickAct(e.target.value)}>{[...FAV, ...(acts.data ?? []).map(a => a.act).filter(a => !FAV.includes(a))].map(a => <option key={a}>{a}</option>)}</Select></Field>
          <Field label="Search within this Act"><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Title or text…" /></Field>
          <div>
            <Caption className="num mb-1.5">{plural(secs.data?.length ?? 0, "provision", "provisions")}</Caption>
            <ul className="-mx-2 max-h-[46vh] overflow-auto">
              {secs.loading ? <li className="px-2"><Skeleton className="h-40" /></li> : (secs.data ?? []).map(s => (
                <li key={s.doc_id}><button onClick={() => { setDoc(s.doc_id); setParams({ doc: s.doc_id }); }} aria-current={s.doc_id === doc} className={cn("flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors", s.doc_id === doc ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-sunken hover:text-ink")}>
                  <span className="num w-14 shrink-0 font-mono text-[12px]">{unit} {s.section}</span><span className="min-w-0 flex-1 truncate">{s.title.replace(/^\d+[A-Z]*\.\s*/, "") || "Untitled"}</span></button></li>))}
            </ul>
          </div>
        </Card>

        <div className="min-w-0 space-y-5">
          {prov.error ? <ErrorBox error={prov.error} /> : prov.loading || !p ? <Skeleton className="h-80" /> : (<>
            <Card as="article">
              <Caption>{p.act}</Caption>
              <h2 className="mt-1 font-serif text-[24px] font-medium leading-tight text-ink">{word} {p.section}{heading(p.title) && <span className="text-ink-2">. {heading(p.title)}</span>}</h2>
              <p className="statute mt-4">{body(p.text)}</p>
              {p.concepts.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{p.concepts.map(c => <Tag key={c}>{c}</Tag>)}</div>}
              {simple && <Callout tone="info" title="In plain words" className="mt-5"><p>{simple.plain}</p><p className="mt-2 text-ink-2"><span className="font-medium text-ink">Example.</span> {simple.example}</p>{simple.do_dont?.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2">{simple.do_dont.map((d, i) => <li key={i}>{d}</li>)}</ul>}</Callout>}
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
                <Button variant="primary" onClick={() => nav(`/app/counsel?q=${encodeURIComponent(`Explain ${word} ${p.section} of the ${p.act} in plain English.`)}`)}><MessageSquareText className="h-4 w-4" aria-hidden />Ask Counsel</Button>
                <Button onClick={simplify} disabled={simpleBusy || !!simple}><Wand2 className="h-4 w-4" aria-hidden />{simpleBusy ? "Simplifying…" : "Simplify"}</Button>
                {CODE[p.act] && <Button onClick={() => nav(`/app/transition?act=${CODE[p.act]}&section=${p.section}`)}><ArrowLeftRight className="h-4 w-4" aria-hidden />2023 bridge</Button>}
                <Button onClick={() => nav(`/app/compare?ids=${encodeURIComponent(p.doc_id)}`)}><Columns3 className="h-4 w-4" aria-hidden />Compare</Button>
                <Button variant="ghost" onClick={() => nav("/app/graph")}><Network className="h-4 w-4" aria-hidden />Graph</Button>
                <span className="ml-auto flex items-center"><CopyButton text={p.text} /><PinButton kind="provision" title={p.citation} body={p.text} meta={{ to: `/app/provisions?doc=${p.doc_id}` }} /></span>
              </div>
              <p className="num mt-3 text-[13px] text-ink-3">{plural(p.cites.length, "citing judgment", "citing judgments")} · {plural(p.refers_to.length, "cross-reference", "cross-references")} · {plural(p.concepts.length, "concept", "concepts")}</p>
            </Card>
            {p.refers_to.length > 0 && <Section title="Refers to" desc="Other provisions this text points at."><p className="text-[14px] text-ink-2">{p.refers_to.join(" · ")}</p></Section>}
            {p.cites.length > 0 && <Section title="Judgments citing this provision" flush><div className="max-h-72 overflow-auto"><table className="tbl"><thead className="sticky"><tr><th className="pl-5">Case</th><th>Court</th><th className="pr-5 text-right">Year</th></tr></thead><tbody>{p.cites.map(c => <tr key={c.id}><td className="pl-5">{c.label}</td><td className="text-ink-3">{c.court}</td><td className="mono pr-5 text-right">{c.year}</td></tr>)}</tbody></table></div></Section>}
          </>)}
        </div>
      </div>

      <Section title="Corpus overview" desc={view === "largest" ? "The thirty largest Acts by number of provisions." : "Every Act by year of enactment and size. Drag to rotate; click a point to open that Act."}>
        <Tabs value={view} onChange={setView} items={[{ id: "largest", label: "Largest Acts" }, { id: "years", label: "Acts by year" }]} className="mb-3" />
        {!acts.data ? <Skeleton className="h-64" /> : view === "largest"
          ? <Chart height={640} data={[{ type: "bar", orientation: "h", x: top.map(a => a.sections), y: top.map(a => a.act), marker: { color: C.primary }, hovertemplate: "%{y}<br>%{x} provisions<extra></extra>" }]} layout={{ xaxis: { showgrid: true, title: { text: "provisions" } }, yaxis: { autorange: "reversed", showgrid: false, tickfont: { size: 11 } }, margin: { l: 300, r: 16, t: 8, b: 40 } }} />
          : <CorpusScatter acts={acts.data} onPick={a => { pickAct(a); window.scrollTo({ top: 0, behavior: "smooth" }); }} />}
      </Section>
    </Page>
  );
}
