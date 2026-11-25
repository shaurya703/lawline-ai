import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BookMarked, ChevronRight } from "lucide-react";
import { api, type Gloss } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { Card, Empty, ErrorBox, Input, Page, Skeleton, Tag } from "@/components/ui";
import { cn } from "@/lib/utils";

export default function Glossary() {
  const [params, setParams] = useSearchParams(); const [q, setQ] = useState(params.get("q") ?? ""); const [letter, setLetter] = useState<string | null>(null); const [open, setOpen] = useState<string | null>(null);
  const g = useFetch(() => api.get<Gloss[]>("/glossary"));
  const rows = useMemo(() => (g.data ?? []).filter(r => (!q || (r.term + r.meaning).toLowerCase().includes(q.toLowerCase())) && (!letter || r.term[0].toUpperCase() === letter)), [g.data, q, letter]);
  const letters = useMemo(() => new Set((g.data ?? []).map(r => r.term[0].toUpperCase())), [g.data]);
  return (
    <Page narrow title="Glossary" desc="Terms you will meet in FIRs, notices and judgments, each explained in a sentence and linked to the provisions that define or use it.">
      <div>
        <Input aria-label="Search the glossary" value={q} onChange={e => { setQ(e.target.value); setParams(e.target.value ? { q: e.target.value } : {}, { replace: true }); }} placeholder="Search terms, e.g. bail, writ, decree…" />
        <div className="mt-3 flex flex-wrap gap-0.5" role="group" aria-label="Filter by first letter">{"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(L => <button key={L} disabled={!letters.has(L)} aria-pressed={letter === L} onClick={() => setLetter(letter === L ? null : L)} className={cn("h-7 w-7 rounded text-[13px] transition-colors disabled:text-line-strong", letter === L ? "bg-ink font-medium text-white" : "text-ink-2 enabled:hover:bg-ink/[.06]")}>{L}</button>)}</div>
      </div>
      {g.error ? <ErrorBox error={g.error} /> : !g.data ? <Skeleton className="h-80" /> : !rows.length ? <Empty icon={<BookMarked className="h-7 w-7" />} title="No term matches" desc={<>Try a shorter search, or <Link className="link" to={`/app/counsel?q=${encodeURIComponent(`What does "${q}" mean in Indian law?`)}`}>ask Counsel</Link>.</>} /> : (
        <Card flush as="div">
          <p className="border-b border-line px-5 py-2.5 text-[12.5px] text-ink-3"><span className="num">{rows.length}</span> {rows.length === 1 ? "term" : "terms"}</p>
          <dl className="divide-y divide-line">
            {rows.map(r => { const isOpen = open === r.term; return (
              <div key={r.term}>
                <button onClick={() => setOpen(isOpen ? null : r.term)} aria-expanded={isOpen} className="flex w-full items-start gap-3 px-5 py-3.5 text-left hover:bg-sunken">
                  <ChevronRight className={cn("mt-1.5 h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform", isOpen && "rotate-90")} aria-hidden />
                  <span className="min-w-0 flex-1"><dt className="font-serif text-[18px] font-medium text-ink">{r.term}</dt><dd className="mt-0.5 text-[14px] text-ink-2">{r.meaning}</dd></span>
                  {r.provisions.length > 0 && <span className="num mt-1 shrink-0 text-[12.5px] text-ink-3">{r.provisions.length} {r.provisions.length === 1 ? "provision" : "provisions"}</span>}
                </button>
                {isOpen && <div className="flex flex-wrap items-center gap-2 px-5 pb-4 pl-[46px] text-[13px]">
                  {r.provisions.map(p => <Link key={p.act + p.section} to={`/app/provisions?act=${encodeURIComponent(p.act)}&sec=${encodeURIComponent(p.section)}`}><Tag tone="accent" className="hover:border-accent">{p.act.split(",")[0]} s.{p.section}</Tag></Link>)}
                  <Link to={`/app/counsel?q=${encodeURIComponent(`Explain "${r.term}" with an example`)}`} className="link">Ask Counsel for an example</Link>
                </div>}
              </div>); })}
          </dl>
        </Card>)}
    </Page>
  );
}
