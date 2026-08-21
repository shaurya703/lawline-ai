import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ShieldCheck, ShieldX } from "lucide-react";
import { api, type VerifyOut } from "@/lib/api";
import { Button, Card, Empty, ErrorBox, PageHeader, Textarea } from "@/components/shell/ui";
import { Ring } from "@/components/fx/Gauge";
const SAMPLE = `The accused is charged under Section 420 IPC and Section 120B of the Indian Penal Code, read with Section 66D of the Information Technology Act, 2000. The complainant also invokes Article 21 of the Constitution and Section 138 of the Negotiable Instruments Act, 1881. Counsel cited Section 999 BNS and Section 482 CrPC for quashing.`;
export default function Verify() {
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [out, setOut] = useState<VerifyOut | null>(null);
  async function run(t = text) { if (t.trim().length < 3) return; setBusy(true); setErr(null); try { setOut(await api.post<VerifyOut>("/verify", { text: t })); } catch (e) { setErr(String(e)); } finally { setBusy(false); } }
  const marked = useMemo(() => { if (!out) return null; let i = 0; const parts: { t: string; c?: VerifyOut["citations"][number] }[] = []; const src = text; out.citations.forEach(c => { const at = src.indexOf(c.span, i); if (at < 0) return; parts.push({ t: src.slice(i, at) }); parts.push({ t: c.span, c }); i = at + c.span.length; }); parts.push({ t: src.slice(i) }); return parts; }, [out, text]);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Hallucination guard" title="Citation Verifier" desc="Paste a draft, a memo or an AI-generated answer. Every “Section X of Y” is checked against the 36,000-provision corpus, so phantom sections are caught before they reach a filing." />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="space-y-3 p-5">
          <Textarea rows={10} value={text} onChange={e => setText(e.target.value)} placeholder="Paste text with statutory citations…" aria-label="Text" className="text-sm" />
          <div className="flex gap-2"><Button variant="primary" onClick={() => void run()} disabled={busy || text.trim().length < 3}><ShieldCheck className="h-4 w-4" />{busy ? "Checking…" : "Verify citations"}</Button><Button variant="ghost" onClick={() => { setText(SAMPLE); void run(SAMPLE); }}>Sample</Button></div>
          {err && <ErrorBox error={err} />}
          {marked && <div className="rounded-[12px] border border-white/10 bg-black/20 p-4 text-[15px] leading-relaxed">{marked.map((p, i) => p.c ? <motion.mark key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * .03 }} className="rounded px-1" style={{ background: p.c.found ? "rgba(46,230,166,.18)" : "rgba(255,77,109,.2)", color: p.c.found ? "#2ee6a6" : "#ff4d6d", outline: `1px solid ${p.c.found ? "rgba(46,230,166,.5)" : "rgba(255,77,109,.6)"}` }} title={p.c.found ? `Found: ${p.c.title ?? ""}` : "Not found in corpus"}>{p.t}</motion.mark> : <span key={i}>{p.t}</span>)}</div>}
        </Card>
        <div className="space-y-4">
          {!out ? <Empty icon={<ShieldCheck className="h-8 w-8" />} title="Verification report" desc="A score and a per-citation list will appear here." /> : (<>
            <Card className="flex items-center gap-4 p-5"><Ring value={out.total ? out.verified / out.total : 0} size={96} color={out.verified === out.total ? "#2ee6a6" : out.verified / Math.max(1, out.total) > .6 ? "#ffd166" : "#ff4d6d"} sub="verified" /><div><div className="font-display text-2xl text-white">{out.verified}/{out.total}</div><div className="text-sm text-muted">citations resolved to a real provision</div></div></Card>
            <ul className="space-y-2">{out.citations.map((c, i) => <motion.li key={i} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * .05 }} className="glass flex items-start gap-3 rounded-[12px] p-3 text-sm">{c.found ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <ShieldX className="mt-0.5 h-4 w-4 shrink-0 text-danger" />}<div className="min-w-0"><div className="truncate font-semibold text-white">{c.span}</div><div className="truncate font-mono text-[10px] text-muted">{c.act_guess ?? "act not recognised"}</div>{c.found && c.doc_id && <Link to={`/app/provisions?doc=${encodeURIComponent(c.doc_id)}`} className="font-mono text-[11px] text-primary hover:underline">{c.title?.split(" — ")[0].slice(0, 60)} →</Link>}{!c.found && <div className="text-xs text-danger/90">No such provision in the corpus — check the number or Act.</div>}</div></motion.li>)}</ul>
          </>)}
        </div>
      </div>
    </div>
  );
}
