import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Columns3, Plus, X } from "lucide-react";
import { api, type CompareOut } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { Bullets, Caption, Card, Chip, Empty, ErrorBox, Field, Input, Page, PinButton, Section, Select, Skeleton } from "@/components/ui";

type Act = { act: string; sections: number }; type Sec = { section: string; title: string; doc_id: string };
const PRESETS: [string, string[]][] = [["Cheating: IPC vs BNS", ["statute::indian-penal-code-1860::420", "statute::bharatiya-nyaya-sanhita-2023::318"]], ["Murder vs culpable homicide", ["statute::indian-penal-code-1860::302", "statute::indian-penal-code-1860::304"]], ["Writs: Art. 32 vs Art. 226", ["statute::constitution-of-india-1949::32", "statute::constitution-of-india-1949::226"]], ["Bail: regular vs anticipatory", ["statute::code-of-criminal-procedure-act-1973::437", "statute::code-of-criminal-procedure-act-1973::438"]]];
const LETTER = ["A", "B", "C"];
/** Each provision keeps one letter across the selection, the text columns and the matrix header. */
function Mark({ i }: { i: number }) { return <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-ink font-mono text-[11px] font-medium text-ink" aria-hidden>{LETTER[i]}</span>; }
const strip = (t: string) => t.replace(/^.*?—\s*(Section|Article) \S+\.\s*/, "");

export default function Compare() {
  const [params, setParams] = useSearchParams(); const ids = (params.get("ids") ?? "").split(",").filter(Boolean);
  const acts = useFetch(() => api.get<Act[]>("/acts")); const [act, setAct] = useState("Indian Penal Code, 1860"); const [q, setQ] = useState("");
  const secs = useFetch(() => q.length > 0 ? api.get<Sec[]>(`/acts/sections?act=${encodeURIComponent(act)}&q=${encodeURIComponent(q)}`) : Promise.resolve([] as Sec[]), [act, q]);
  const cmp = useFetch(() => ids.length >= 2 ? api.post<CompareOut>("/compare", { doc_ids: ids }) : Promise.resolve(null), [ids.join(",")]);
  const setIds = (x: string[]) => setParams(x.length ? { ids: x.join(",") } : {});
  const labels = useFetch(async () => Object.fromEntries(await Promise.all(ids.map(d => api.get<{ citation: string }>(`/provision?doc_id=${encodeURIComponent(d)}`).then(r => [d, r.citation] as const).catch(() => [d, d] as const)))), [ids.join(",")]);
  const c = cmp.data; const unit = act.startsWith("Constitution") ? "Art." : "s.";
  return (
    <Page title="Compare Provisions" desc="Pick two or three sections from any Acts. LawLine lines them up on scope, ingredients, consequences, who can invoke them and procedure, then explains how they interact.">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          {ids.map((d, i) => <span key={d} className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-surface py-1 pl-1.5 pr-1 text-[13px] text-ink"><Mark i={i} />{labels.data?.[d] ?? d}<button onClick={() => setIds(ids.filter(x => x !== d))} aria-label={`Remove ${labels.data?.[d] ?? d}`} className="rounded p-1 text-ink-3 hover:bg-ink/[.06] hover:text-ink"><X className="h-3.5 w-3.5" aria-hidden /></button></span>)}
          <Caption className="num">{ids.length} of 3 selected{ids.length < 2 ? `. Add ${2 - ids.length} more to compare.` : ids.length < 3 ? ". You can add one more." : "."}</Caption>
        </div>
        {ids.length < 3 && <div className="mt-4 grid gap-3 md:grid-cols-[300px_minmax(0,1fr)]">
          <Field label="Act"><Select value={act} onChange={e => setAct(e.target.value)}>{(acts.data ?? []).slice(0, 60).map(a => <option key={a.act}>{a.act}</option>)}</Select></Field>
          <Field label="Find a section"><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Section number or title in this Act…" /></Field>
        </div>}
        {q && secs.data && (secs.data.length ? <ul className="mt-2 max-h-52 divide-y divide-line overflow-auto rounded-md border border-line">{secs.data.slice(0, 30).map(s => <li key={s.doc_id}><button disabled={ids.includes(s.doc_id)} onClick={() => { setIds([...ids, s.doc_id]); setQ(""); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13.5px] hover:bg-sunken disabled:opacity-40"><Plus className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden /><span className="num w-14 shrink-0 font-mono text-[12px] text-ink">{unit} {s.section}</span><span className="truncate text-ink-2">{s.title.split(" — ")[0]}</span></button></li>)}</ul> : <Caption className="mt-2">No section in this Act matches.</Caption>)}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4"><Caption>Or start from a pair</Caption>{PRESETS.map(([l, v]) => <Chip key={l} active={v.join(",") === ids.join(",")} onClick={() => setIds(v)}>{l}</Chip>)}</div>
      </Card>

      {(cmp.error ?? acts.error ?? secs.error) && <ErrorBox error={(cmp.error ?? acts.error ?? secs.error)!} />}
      {ids.length >= 2 && cmp.loading && <Skeleton className="h-96" />}
      {ids.length < 2 && <Empty icon={<Columns3 className="h-7 w-7" />} title="Select at least two provisions" desc="Search an Act above, or start from one of the suggested pairs." />}
      {c && ids.length >= 2 && !cmp.loading && (<>
        <div className="grid gap-4 md:grid-cols-[repeat(var(--n),minmax(0,1fr))]" style={{ ["--n" as string]: c.docs.length }}>
          {c.docs.map((d, i) => (
            <Card key={d.doc_id} as="article">
              <div className="flex items-start gap-2"><span className="mt-0.5"><Mark i={i} /></span><div className="min-w-0"><h2 className="font-serif text-[18px] font-medium leading-snug text-ink">{d.citation}</h2><Caption>{d.title.split(" — ")[0]}</Caption></div></div>
              <p className="statute-sm mt-3 max-h-44 overflow-auto pr-1">{strip(d.text)}</p>
              <Link to={`/app/provisions?doc=${encodeURIComponent(d.doc_id)}`} className="link mt-3 inline-block text-[13px]">Open in Provision Explorer</Link>
            </Card>))}
        </div>
        <Section title="Comparison" desc="Written by the model from the texts above." flush
          actions={<PinButton labelled kind="comparison" title={c.docs.map(d => d.citation.split(" — ")[0]).join(" vs ")} body={`${c.analysis.overview}\n\n${c.analysis.matrix.map(r => `**${r.dimension}**: ${r.values.join(" | ")}`).join("\n")}\n\n${c.analysis.interplay}`} meta={{ to: `/app/compare?ids=${encodeURIComponent(ids.join(","))}` }} />}>
          <p className="max-w-[72ch] px-5 pb-4 text-[15px] text-ink">{c.analysis.overview}</p>
          <div className="overflow-x-auto border-t border-line"><table className="tbl"><thead><tr><th className="pl-5">Dimension</th>{c.docs.map((d, i) => <th key={d.doc_id} className="last:pr-5"><span className="inline-flex items-center gap-2 text-ink"><Mark i={i} />{d.citation.split(" — ")[0].slice(0, 40)}</span></th>)}</tr></thead>
            <tbody>{c.analysis.matrix.map(r => <tr key={r.dimension}><td className="whitespace-nowrap pl-5 font-medium text-ink">{r.dimension}</td>{r.values.map((v, i) => <td key={i} className="text-ink-2 last:pr-5">{v}</td>)}</tr>)}</tbody></table></div>
        </Section>
        <div className="grid gap-6 md:grid-cols-2">
          <Section title="When to use which"><Bullets items={c.analysis.when_to_use} /></Section>
          <Section title="How they interact"><p className="text-[14px] text-ink">{c.analysis.interplay}</p></Section>
        </div>
      </>)}
    </Page>
  );
}
