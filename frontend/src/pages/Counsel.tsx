import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Download, Eraser, Languages, Scale, Send, User } from "lucide-react";
import { api, type ChatOut, type Passage } from "@/lib/api";
import { Button, Card, Eyebrow, Passages, Select, Textarea } from "@/components/shell/ui";
import { Chart, C } from "@/lib/plotly";

type Msg = { role: "user" | "assistant"; content: string; data?: ChatOut };
const STYLES = ["Plain English", "Formal legal memo", "Law student", "One-line answer"];
const LANGS = ["—", "Hindi", "Kannada", "Tamil", "Telugu", "Marathi", "Bengali"];
const EASE = [0.2, 0.8, 0.2, 1] as const;

export default function Counsel() {
  const [params, setParams] = useSearchParams();
  const [msgs, setMsgs] = useState<Msg[]>(() => JSON.parse(sessionStorage.getItem("lawline.chat") || "[]"));
  const [q, setQ] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [style, setStyle] = useState(STYLES[0]); const [lang, setLang] = useState(LANGS[0]); const [scope, setScope] = useState("all"); const [rerank, setRerank] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { sessionStorage.setItem("lawline.chat", JSON.stringify(msgs)); endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  useEffect(() => { const pq = params.get("q"); if (pq) { setParams({}); void ask(pq); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function ask(text: string) {
    const t = text.trim(); if (!t || busy) return;
    setErr(null); setBusy(true); setQ("");
    const history = msgs.map(m => ({ role: m.role, content: m.content }));
    setMsgs(m => [...m, { role: "user", content: t }]);
    try {
      const out = await api.post<ChatOut>("/chat", { message: t, history, style, translate: lang === "—" ? null : lang, doc_types: scope === "all" ? [] : [scope], use_reranker: rerank });
      setMsgs(m => [...m, { role: "assistant", content: out.answer + (out.translated ? `\n\n**${lang}:**\n${out.translated}` : ""), data: out }]);
    } catch (e) { setErr(String(e)); setMsgs(m => m.slice(0, -1)); setQ(t); } finally { setBusy(false); }
  }
  const transcript = msgs.map(m => `**${m.role.toUpperCase()}**: ${m.content}`).join("\n\n");
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="flex min-h-[70vh] flex-col">
        <Card className="mb-4"><Eyebrow>Grounded generation · citation guard on</Eyebrow><h2 className="mt-1 font-display text-2xl tracking-[0.04em]">Counsel</h2><p className="mt-1 text-sm text-muted">Conversational legal research. Follow-ups keep context; answers are built only from the passages shown beneath each reply.</p></Card>
        <div className="flex-1 space-y-4" aria-live="polite">
          <AnimatePresence initial={false}>
            {msgs.map((m, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .22, ease: EASE }} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
                {m.role === "assistant" && <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10"><Scale className="h-4 w-4 text-primary" aria-hidden /></div>}
                <div className={`max-w-[90%] rounded-[14px] border border-[var(--border)] p-4 ${m.role === "user" ? "bg-primary/10" : "bg-[var(--glass)]"}`}>
                  <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{m.content}</div>
                  {m.data && <Sources d={m.data} onFollow={ask} />}
                </div>
                {m.role === "user" && <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-white/[.04]"><User className="h-4 w-4" aria-hidden /></div>}
              </motion.div>
            ))}
          </AnimatePresence>
          {busy && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 font-mono text-xs text-muted"><span className="inline-block h-2 w-2 animate-pulse rounded-full bg-success" />rewriting follow-up · retrieving · fusing · reranking · drafting…</motion.div>}
          {err && <div role="alert" className="rounded-[10px] border border-danger/50 bg-danger/10 p-3 text-sm">Request failed: <span className="font-mono">{err}</span></div>}
          <div ref={endRef} />
        </div>
        <form className="sticky bottom-4 mt-4 flex gap-2 rounded-[14px] border border-[var(--border)] bg-bg-elev/90 p-2 backdrop-blur" onSubmit={e => { e.preventDefault(); void ask(q); }}>
          <Textarea aria-label="Ask a legal question" rows={1} value={q} onChange={e => setQ(e.target.value)} placeholder="Ask a legal question… (Enter to send, Shift+Enter for newline)" className="min-h-11 resize-none border-0 bg-transparent"
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(q); } }} />
          <Button variant="primary" type="submit" disabled={busy || !q.trim()} aria-label="Send"><Send className="h-4 w-4" /></Button>
        </form>
      </div>
      <aside className="space-y-4">
        <Card className="space-y-3">
          <Eyebrow>Style</Eyebrow>
          <label className="block text-xs text-muted">Answer style<Select value={style} onChange={e => setStyle(e.target.value)}>{STYLES.map(s => <option key={s}>{s}</option>)}</Select></label>
          <label className="block text-xs text-muted"><span className="inline-flex items-center gap-1"><Languages className="h-3 w-3" />Also translate to</span><Select value={lang} onChange={e => setLang(e.target.value)}>{LANGS.map(s => <option key={s}>{s}</option>)}</Select></label>
          <Eyebrow>Retrieval</Eyebrow>
          <label className="block text-xs text-muted">Scope<Select value={scope} onChange={e => setScope(e.target.value)}><option value="all">All sources</option><option value="statute">Statutes only</option><option value="case">Case law only</option></Select></label>
          <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={rerank} onChange={e => setRerank(e.target.checked)} className="accent-[var(--primary)]" />Cross-encoder reranker</label>
        </Card>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => { const b = new Blob([transcript], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "lawline_transcript.md"; a.click(); }} disabled={!msgs.length}><Download className="h-4 w-4" />Transcript</Button>
          <Button onClick={() => setMsgs([])} disabled={!msgs.length} aria-label="Clear conversation"><Eraser className="h-4 w-4" /></Button>
        </div>
      </aside>
    </div>
  );
}

function Sources({ d, onFollow }: { d: ChatOut; onFollow: (q: string) => void }) {
  const [open, setOpen] = useState(false);
  const cited = d.passages.filter((p: Passage) => p.used).length;
  const conf = Math.min(1, .35 + .13 * cited + (d.passages.some(p => p.used && p.sources.includes("kg")) ? .2 : 0));
  const stages = ["embed", "faiss", "bm25", "kg", "rerank"].filter(k => d.timings_ms[k]);
  return (
    <div className="mt-3 border-t border-[var(--border)] pt-3">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => setOpen(o => !o)} className="cursor-pointer font-mono text-[11px] text-muted hover:text-fg">{open ? "▾" : "▸"} {d.passages.length} passages · {cited} cited · {Math.round(d.timings_ms.total)} ms{d.search_query && d.search_query !== d.passages[0]?.citation ? ` · searched: “${d.search_query.slice(0, 70)}”` : ""}</button>
        <span className="ml-auto font-mono text-[11px]" style={{ color: conf > .7 ? C.success : C.primary }}>grounding {Math.round(conf * 100)}%</span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/[.06]"><motion.div className="h-full" style={{ background: conf > .7 ? C.success : C.primary }} initial={{ width: 0 }} animate={{ width: `${conf * 100}%` }} transition={{ duration: .6, ease: EASE }} /></div>
      <AnimatePresence>{open && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_220px]"><Passages items={d.passages} />
          <Chart height={150} data={[{ type: "bar", orientation: "h", x: stages.map(k => d.timings_ms[k]), y: stages, marker: { color: C.primary } }]} layout={{ margin: { l: 48, r: 8, t: 8, b: 24 }, xaxis: { title: { text: "ms" } } }} /></div>
      </motion.div>}</AnimatePresence>
      {d.followups?.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{d.followups.map(f => <button key={f} onClick={() => onFollow(f)} className="cursor-pointer rounded-full border border-[var(--border)] px-3 py-1 text-xs text-muted transition-colors hover:border-primary hover:text-fg">{f}</button>)}</div>}
    </div>
  );
}
