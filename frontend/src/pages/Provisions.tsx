import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { Button, Card, Eyebrow, H2, Input, Kpi, Select, Skeleton, ErrorBox } from "@/components/shell/ui";
import { Chart, C } from "@/lib/plotly";

type Act = { act: string; sections: number; year: number | null };
type Sec = { section: string; title: string; doc_id: string };
type Prov = { doc_id: string; act: string; section: string; title: string; citation: string; text: string; cites: { id: string; label: string; court: string; year: number }[]; refers_to: string[]; concepts: string[] };
const FAV = ["Indian Penal Code, 1860", "Bharatiya Nyaya Sanhita, 2023", "Constitution of India, 1949", "Code of Criminal Procedure Act, 1973", "Bharatiya Nagarik Suraksha Sanhita, 2023", "Indian Evidence Act, 1872", "Indian Contract Act, 1872", "Negotiable Instruments Act, 1881"];

export default function Provisions() {
  const [params, setParams] = useSearchParams(); const nav = useNavigate();
  const acts = useFetch(() => api.get<Act[]>("/acts"));
  const [act, setAct] = useState(FAV[0]); const [q, setQ] = useState(""); const [doc, setDoc] = useState<string | null>(params.get("doc"));
  const secs = useFetch(() => api.get<Sec[]>(`/acts/sections?act=${encodeURIComponent(act)}&q=${encodeURIComponent(q)}`), [act, q]);
  const prov = useFetch(() => doc ? api.get<Prov>(`/provision?doc_id=${encodeURIComponent(doc)}`) : Promise.resolve(null), [doc]);
  useEffect(() => { if (prov.data?.act && prov.data.act !== act) setAct(prov.data.act); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prov.data]);
  useEffect(() => { if (!doc && secs.data?.length) setDoc(secs.data[0].doc_id); }, [secs.data, doc]);
  const isConst = act.startsWith("Constitution"); const unit = isConst ? "Art." : "s.";
  const top = (acts.data ?? []).slice(0, 30);
  return (
    <div className="space-y-6">
      <Card><Eyebrow>Corpus browser</Eyebrow><H2 className="mt-1">Provision Explorer</H2><p className="mt-1 text-sm text-muted">Browse 1,000+ central Acts section by section, read the text, and see which judgments cite a provision.</p></Card>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="space-y-3">
          <label className="block text-xs text-muted">Act<Select value={act} onChange={e => { setAct(e.target.value); setDoc(null); setParams({}); }}>{[...FAV, ...(acts.data ?? []).map(a => a.act).filter(a => !FAV.includes(a))].map(a => <option key={a}>{a}</option>)}</Select></label>
          <label className="block text-xs text-muted">Search within act<Input value={q} onChange={e => setQ(e.target.value)} placeholder="title or text…" /></label>
          <div className="font-mono text-[11px] text-muted">{secs.data?.length ?? 0} provisions</div>
          <ul className="max-h-[480px] space-y-0.5 overflow-auto">{secs.loading ? <Skeleton className="h-40" /> : (secs.data ?? []).map(s => <li key={s.doc_id}><button onClick={() => { setDoc(s.doc_id); setParams({ doc: s.doc_id }); }} className={`w-full cursor-pointer rounded-[8px] px-2 py-1.5 text-left text-xs transition-colors hover:bg-white/[.04] ${s.doc_id === doc ? "bg-primary/10 text-fg" : "text-muted"}`}><span className="font-mono text-primary">{unit} {s.section}</span> — {s.title.replace(/^\d+[A-Z]*\.\s*/, "").slice(0, 60)}</button></li>)}</ul>
        </Card>
        <div className="space-y-4">
          {prov.error ? <ErrorBox error={prov.error} /> : prov.loading || !prov.data ? <Skeleton className="h-64" /> : (<>
            <Card><Eyebrow>{prov.data.act}</Eyebrow><H2 className="mt-1">{isConst ? "Article" : "Section"} {prov.data.section}</H2>
              <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed">{prov.data.text}</p>
              <div className="mt-4 flex flex-wrap gap-2">{prov.data.concepts.map(c => <span key={c} className="rounded-full border border-success px-2 py-0.5 font-mono text-[10px] text-success">{c}</span>)}</div>
              <div className="mt-4 flex gap-2"><Button variant="primary" onClick={() => nav(`/app/counsel?q=${encodeURIComponent(`Explain ${isConst ? "Article" : "Section"} ${prov.data!.section} of the ${prov.data!.act} in plain English.`)}`)}>Ask Counsel about this</Button>
                <Button onClick={() => nav(`/app/graph`)}>Open in graph</Button></div></Card>
            <div className="grid grid-cols-3 gap-3"><Kpi label="Citing judgments" value={prov.data.cites.length} /><Kpi label="Cross-references" value={prov.data.refers_to.length} delay={.04} /><Kpi label="Concepts" value={prov.data.concepts.length} delay={.08} /></div>
            {prov.data.refers_to.length > 0 && <Card><H2 className="text-base">Refers to</H2><p className="mt-1 text-sm text-muted">{prov.data.refers_to.join(" · ")}</p></Card>}
            {prov.data.cites.length > 0 && <Card><H2 className="text-base">Judgments citing this provision</H2><div className="mt-2 max-h-64 overflow-auto"><table className="w-full text-left text-xs"><thead className="font-mono text-[11px] uppercase text-muted"><tr><th className="p-2">case</th><th className="p-2">court</th><th className="p-2">year</th></tr></thead><tbody>{prov.data.cites.map(c => <tr key={c.id} className="border-t border-[var(--border)]"><td className="p-2">{c.label}</td><td className="p-2 text-muted">{c.court}</td><td className="p-2 font-mono">{c.year}</td></tr>)}</tbody></table></div></Card>}
          </>)}
        </div>
      </div>
      <Card><H2 className="text-base">Corpus overview · largest Acts</H2>
        {top.length ? <Chart height={620} data={[{ type: "bar", orientation: "h", x: top.map(a => a.sections), y: top.map(a => a.act), marker: { color: top.map(a => a.sections), colorscale: [[0, C.secondary], [1, C.primary]] }, hovertemplate: "%{y}<br>%{x} sections<extra></extra>" }]} layout={{ yaxis: { autorange: "reversed", tickfont: { size: 10 } }, margin: { l: 300, r: 10, t: 10, b: 30 } }} /> : <Skeleton className="h-64" />}</Card>
    </div>
  );
}
