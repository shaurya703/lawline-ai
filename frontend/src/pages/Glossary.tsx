import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { BookMarked } from "lucide-react";
import { api, type Gloss } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { Card, ErrorBox, Input, PageHeader, Skeleton, Empty } from "@/components/shell/ui";
import { cn } from "@/lib/utils";
export default function Glossary() {
  const [params, setParams] = useSearchParams(); const [q, setQ] = useState(params.get("q") ?? ""); const [letter, setLetter] = useState<string | null>(null); const [open, setOpen] = useState<string | null>(null);
  const g = useFetch(() => api.get<Gloss[]>("/glossary"));
  const rows = useMemo(() => (g.data ?? []).filter(r => (!q || (r.term + r.meaning).toLowerCase().includes(q.toLowerCase())) && (!letter || r.term[0].toUpperCase() === letter)), [g.data, q, letter]);
  const letters = useMemo(() => new Set((g.data ?? []).map(r => r.term[0].toUpperCase())), [g.data]);
  if (g.error) return <ErrorBox error={g.error} />;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Vocabulary" title="Legal Glossary" desc="Terms you'll meet in FIRs, notices and judgments — decoded in one line and linked to the provision that defines or uses them." />
      <Card className="p-4"><Input aria-label="Search glossary" value={q} onChange={e => { setQ(e.target.value); setParams(e.target.value ? { q: e.target.value } : {}); }} placeholder="Search terms, e.g. bail, writ, decree…" />
        <div className="mt-3 flex flex-wrap gap-1">{"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(L => <button key={L} disabled={!letters.has(L)} onClick={() => setLetter(letter === L ? null : L)} className={cn("h-7 w-7 cursor-pointer rounded-[6px] font-mono text-[11px] transition-colors disabled:cursor-default disabled:opacity-25", letter === L ? "bg-primary text-bg" : "text-muted hover:bg-white/5 hover:text-fg")}>{L}</button>)}</div></Card>
      {!g.data ? <Skeleton className="h-80" /> : !rows.length ? <Empty icon={<BookMarked className="h-8 w-8" />} title="No terms match" desc="Try a shorter query, or ask Counsel." /> : (
        <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
          <AnimatePresence>{rows.map((r, i) => (
            <motion.button layout key={r.term} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * .03 }} onClick={() => setOpen(open === r.term ? null : r.term)} className={cn("glass glow-border mb-4 block w-full cursor-pointer break-inside-avoid rounded-[14px] p-4 text-left transition-all", open === r.term && "border-primary/40")} data-active={open === r.term}>
              <div className="flex items-baseline justify-between gap-2"><h3 className="font-display text-[15px] tracking-wide text-white">{r.term}</h3><span className="font-mono text-[10px] text-muted">{r.provisions.length ? `${r.provisions.length} prov.` : ""}</span></div>
              <p className="mt-1 text-sm text-muted">{r.meaning}</p>
              <AnimatePresence>{open === r.term && r.provisions.length > 0 && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden"><div className="mt-3 flex flex-wrap gap-1">{r.provisions.map(p => <Link key={p.act + p.section} to={`/app/provisions?act=${encodeURIComponent(p.act)}&sec=${p.section}`} onClick={e => e.stopPropagation()} className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary hover:border-primary">{p.act.split(",")[0].replace("Bharatiya ", "B. ").slice(0, 28)} s.{p.section}</Link>)}</div><Link to={`/app/counsel?q=${encodeURIComponent(`Explain "${r.term}" with an example`)}`} onClick={e => e.stopPropagation()} className="mt-2 inline-block font-mono text-[11px] text-primary hover:underline">Ask Counsel →</Link></motion.div>}</AnimatePresence>
            </motion.button>))}</AnimatePresence>
        </div>)}
    </div>
  );
}
