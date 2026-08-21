import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Eraser, Languages, Lightbulb, Mic, MicOff, Printer, RefreshCw, Scale, Send, Sparkles, User, Volume2, VolumeX, Wand2 } from "lucide-react";
import { api, type ChatOut, type Passage, type Simplified } from "@/lib/api";
import { logActivity, settings } from "@/lib/store";
import { useDictation, speak, stopSpeaking } from "@/lib/voice";
import { download, printSection } from "@/lib/export";
import { Badge, Button, Card, CopyButton, Passages, PinButton, Select, Textarea } from "@/components/shell/ui";
import Md, { toHtml } from "@/components/fx/Md";
import { useTypewriter } from "@/components/fx/Typewriter";
import { Ring } from "@/components/fx/Gauge";
import { Chart, C } from "@/lib/plotly";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string; data?: ChatOut; fresh?: boolean };
const STYLES = ["Plain English", "Formal legal memo", "Law student", "One-line answer"];
const LANGS = ["—", "Hindi", "Kannada", "Tamil", "Telugu", "Marathi", "Bengali", "Gujarati", "Malayalam", "Punjabi"];
const EASE = [0.2, 0.8, 0.2, 1] as const;
const GALLERY = [
  { t: "Everyday", items: ["My landlord refuses to return my deposit. What can I do?", "Can police arrest me without a warrant?", "What happens if my cheque bounces?", "How do I file an RTI?"] },
  { t: "Criminal", items: ["What is the punishment for cheating under Section 420 IPC?", "Is Section 498A bailable?", "IPC 302 → BNS?", "What is anticipatory bail under BNSS?"] },
  { t: "Constitution", items: ["What does Article 21 guarantee?", "Can fundamental rights be suspended during emergency?", "What is the basic structure doctrine?", "Article 32 vs Article 226?"] },
  { t: "Civil & family", items: ["Grounds for divorce under the Hindu Marriage Act?", "What makes a contract void?", "Who can claim maintenance under Section 125 CrPC?", "Is an unregistered lease valid?"] },
];

export default function Counsel() {
  const [params, setParams] = useSearchParams(); const st = settings.use();
  const [msgs, setMsgs] = useState<Msg[]>(() => JSON.parse(sessionStorage.getItem("lawline.chat") || "[]"));
  const [q, setQ] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [stage, setStage] = useState(0);
  const [style, setStyle] = useState(st.style); const [lang, setLang] = useState(st.lang); const [scope, setScope] = useState("all"); const [speaking, setSpeaking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const dict = useDictation(useCallback((t: string) => setQ(t), []));
  useEffect(() => { sessionStorage.setItem("lawline.chat", JSON.stringify(msgs.map(m => ({ ...m, fresh: false })))); endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs]);
  useEffect(() => { const pq = params.get("q"); if (pq) { setParams({}); void ask(pq); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  useEffect(() => { if (!busy) { setStage(0); return; } const id = setInterval(() => setStage(s => Math.min(4, s + 1)), 900); return () => clearInterval(id); }, [busy]);
  useEffect(() => { const h = (e: KeyboardEvent) => { const tag = (e.target as HTMLElement)?.tagName; if (e.key === "m" && tag !== "INPUT" && tag !== "TEXTAREA" && st.voice && dict.supported) dict.toggle(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [dict, st.voice]);

  async function ask(text: string) {
    const t = text.trim(); if (!t || busy) return;
    setErr(null); setBusy(true); setQ(""); stopSpeaking(); setSpeaking(false);
    const history = msgs.map(m => ({ role: m.role, content: m.content }));
    setMsgs(m => [...m, { role: "user", content: t }]);
    try {
      const out = await api.post<ChatOut>("/chat", { message: t, history, style, translate: lang === "—" ? null : lang, doc_types: scope === "all" ? [] : [scope], use_reranker: st.rerank });
      const content = out.answer + (out.translated ? `\n\n**${lang}:**\n${out.translated}` : "");
      setMsgs(m => [...m, { role: "assistant", content, data: out, fresh: true }]); logActivity("counsel", t, "/app/counsel");
      if (st.autoSpeak) { speak(out.answer); setSpeaking(true); }
    } catch (e) { setErr(String(e)); setMsgs(m => m.slice(0, -1)); setQ(t); } finally { setBusy(false); }
  }
  const regenerate = () => { const lastUser = [...msgs].reverse().find(m => m.role === "user"); if (!lastUser) return; setMsgs(m => m.slice(0, m.length - (m[m.length - 1].role === "assistant" ? 2 : 1))); setTimeout(() => void ask(lastUser.content), 0); };
  const transcript = msgs.map(m => `**${m.role.toUpperCase()}**: ${m.content}`).join("\n\n");
  const STAGES = ["rewriting follow-up", "dense + lexical + graph retrieval", "reciprocal rank fusion", "cross-encoder rerank", "drafting cited answer"];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="flex min-h-[72vh] flex-col">
        <div className="flex-1 space-y-4" aria-live="polite">
          {!msgs.length && !busy && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <Card className="scan relative overflow-hidden rounded-[20px] p-8 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-primary/40 bg-primary/10 ring-pulse"><Scale className="h-7 w-7 text-primary" /></div>
                <h2 className="holo mt-4 font-display text-2xl tracking-[0.06em]">Ask anything about Indian law</h2>
                <p className="mx-auto mt-2 max-w-xl text-sm text-muted">Plain-language questions welcome. Every answer is built from retrieved statutes and judgments and cites them passage by passage. Follow-ups keep context.</p>
              </Card>
              <div className="grid gap-3 md:grid-cols-2">
                {GALLERY.map((g, gi) => <Card key={g.t} delay={gi * .05} className="p-4"><div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-primary/80">{g.t}</div><div className="flex flex-wrap gap-2">{g.items.map(x => <button key={x} onClick={() => void ask(x)} className="cursor-pointer rounded-full border border-white/10 bg-white/[.02] px-3 py-1.5 text-left text-xs text-muted transition-all hover:border-primary hover:text-white hover:shadow-[0_0_14px_rgb(var(--accent-rgb)/.25)]">{x}</button>)}</div></Card>)}
              </div>
            </motion.div>
          )}
          <AnimatePresence initial={false}>
            {msgs.map((m, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .24, ease: EASE }} className={cn("flex gap-3", m.role === "user" && "justify-end")}>
                {m.role === "assistant" && <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 shadow-[0_0_16px_rgb(var(--accent-rgb)/.3)]"><Scale className="h-4 w-4 text-primary" aria-hidden /></div>}
                <div className={cn("max-w-[92%] rounded-[16px] border p-4", m.role === "user" ? "border-primary/30 bg-[linear-gradient(135deg,rgb(var(--accent-rgb)/.18),rgba(124,77,255,.12))]" : "glass w-full")}>
                  {m.role === "assistant" ? <Answer m={m} onFollow={ask} onRegenerate={i === msgs.length - 1 ? regenerate : undefined} speaking={speaking} setSpeaking={setSpeaking} typewriter={st.typewriter && !!m.fresh} /> : <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{m.content}</div>}
                </div>
                {m.role === "user" && <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[.04]"><User className="h-4 w-4" aria-hidden /></div>}
              </motion.div>
            ))}
          </AnimatePresence>
          {busy && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass ml-12 max-w-md rounded-[14px] p-4">
            <div className="flex items-center gap-2 font-mono text-[11px] text-muted"><span className="inline-block h-2 w-2 animate-pulse rounded-full bg-success" />{STAGES[stage]}…</div>
            <div className="mt-3 flex gap-1">{STAGES.map((_, k) => <motion.span key={k} className="h-1 flex-1 rounded-full" animate={{ background: k <= stage ? "var(--primary)" : "rgba(255,255,255,.08)", boxShadow: k === stage ? "0 0 8px var(--primary)" : "none" }} />)}</div>
          </motion.div>}
          {err && <div role="alert" className="rounded-[10px] border border-danger/50 bg-danger/10 p-3 text-sm">Request failed: <span className="font-mono">{err}</span></div>}
          <div ref={endRef} />
        </div>
        <form className="glass sticky bottom-4 mt-4 flex items-end gap-2 rounded-[18px] p-2 shadow-[0_10px_40px_rgba(0,0,0,.5)]" onSubmit={e => { e.preventDefault(); void ask(q); }}>
          {st.voice && dict.supported && <Button type="button" variant={dict.listening ? "primary" : "ghost"} onClick={dict.toggle} aria-label={dict.listening ? "Stop dictation" : "Dictate"} className={cn(dict.listening && "ring-pulse")}>{dict.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</Button>}
          <Textarea aria-label="Ask a legal question" rows={1} value={q} onChange={e => setQ(e.target.value)} placeholder={dict.listening ? "Listening…" : "Ask a legal question… (Enter to send, Shift+Enter for newline, M for mic)"} className="max-h-40 min-h-11 resize-none border-0 bg-transparent shadow-none focus:shadow-none"
            onInput={e => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = Math.min(160, t.scrollHeight) + "px"; }}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(q); } }} />
          <Button variant="primary" type="submit" disabled={busy || !q.trim()} aria-label="Send"><Send className="h-4 w-4" /></Button>
        </form>
      </div>
      <aside className="space-y-4">
        <Card className="space-y-3 p-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary/80">Style</div>
          <label className="block text-xs text-muted">Answer style<Select value={style} onChange={e => setStyle(e.target.value)} className="mt-1">{STYLES.map(s => <option key={s}>{s}</option>)}</Select></label>
          <label className="block text-xs text-muted"><span className="inline-flex items-center gap-1"><Languages className="h-3 w-3" />Also translate to</span><Select value={lang} onChange={e => setLang(e.target.value)} className="mt-1">{LANGS.map(s => <option key={s}>{s}</option>)}</Select></label>
          <div className="pt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-primary/80">Retrieval</div>
          <label className="block text-xs text-muted">Scope<Select value={scope} onChange={e => setScope(e.target.value)} className="mt-1"><option value="all">All sources</option><option value="statute">Statutes only</option><option value="case">Case law only</option></Select></label>
        </Card>
        <Card className="p-5"><div className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary/80">Session</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-center"><div className="rounded-[10px] border border-white/10 p-2"><div className="font-display text-lg text-primary">{msgs.filter(m => m.role === "user").length}</div><div className="font-mono text-[10px] text-muted">questions</div></div><div className="rounded-[10px] border border-white/10 p-2"><div className="font-display text-lg text-success">{msgs.reduce((n, m) => n + (m.data?.passages.filter(p => p.used).length ?? 0), 0)}</div><div className="font-mono text-[10px] text-muted">citations</div></div></div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" className="flex-1" onClick={() => download("lawline_transcript.md", transcript)} disabled={!msgs.length}>Export</Button>
            <Button size="sm" onClick={() => printSection("LawLine consultation", msgs.map(m => `<h3>${m.role === "user" ? "You" : "LawLine"}</h3>${toHtml(m.content)}`).join(""))} disabled={!msgs.length} aria-label="Print"><Printer className="h-4 w-4" /></Button>
            <Button size="sm" onClick={() => { setMsgs([]); stopSpeaking(); }} disabled={!msgs.length} aria-label="Clear conversation"><Eraser className="h-4 w-4" /></Button>
          </div>
        </Card>
        <Card className="p-5 text-xs text-muted"><Lightbulb className="mb-1 h-4 w-4 text-warning" />Try <Link className="text-primary" to="/app/rights">Rights Guides</Link> for step-by-step playbooks, or <Link className="text-primary" to="/app/offence">Offence Lookup</Link> for punishments and bailability.</Card>
      </aside>
    </div>
  );
}

function Answer({ m, onFollow, onRegenerate, speaking, setSpeaking, typewriter }: { m: Msg; onFollow: (q: string) => void; onRegenerate?: () => void; speaking: boolean; setSpeaking: (v: boolean) => void; typewriter: boolean }) {
  const d = m.data!; const { shown, done } = useTypewriter(m.content, typewriter); const [open, setOpen] = useState(false); const [simple, setSimple] = useState<Simplified | null>(null); const [simpleBusy, setSimpleBusy] = useState(false);
  const cited = d.passages.filter((p: Passage) => p.used).length;
  const conf = Math.min(1, .35 + .13 * cited + (d.passages.some(p => p.used && p.sources.includes("kg")) ? .2 : 0));
  const stages = ["embed", "faiss", "bm25", "kg", "rerank"].filter(k => d.timings_ms[k]);
  const simplify = async () => { setSimpleBusy(true); try { setSimple(await api.post<Simplified>("/simplify", { text: d.answer, level: "12-year-old" })); } finally { setSimpleBusy(false); } };
  return (
    <div>
      <Md text={shown} className="text-[15px] leading-relaxed" />{!done && <span className="ml-1 inline-block h-4 w-[2px] animate-pulse bg-primary align-middle" />}
      {simple && <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 rounded-[12px] border border-warning/30 bg-warning/5 p-3 text-sm"><div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-warning"><Wand2 className="h-3 w-3" />Explained simply</div><p>{simple.plain}</p><p className="mt-2 text-muted"><strong className="text-fg">Example:</strong> {simple.example}</p>{simple.key_terms?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{simple.key_terms.map(k => <span key={k.term} className="rounded-full border border-white/10 px-2 py-0.5 text-[11px]" title={k.meaning}>{k.term}</span>)}</div>}</motion.div>}
      {done && (
        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setOpen(o => !o)} className="cursor-pointer font-mono text-[11px] text-muted hover:text-fg">{open ? "▾" : "▸"} {d.passages.length} passages · {cited} cited · {Math.round(d.timings_ms.total)} ms{d.search_query && d.search_query.toLowerCase() !== m.content.slice(0, 20).toLowerCase() ? ` · searched: “${d.search_query.slice(0, 60)}”` : ""}</button>
            <div className="ml-auto flex items-center gap-1">
              <Ring value={conf} size={40} stroke={4} color={conf > .7 ? C.success : C.primary} label="" />
              <span className="mr-2 font-mono text-[10px] uppercase text-muted">grounding {Math.round(conf * 100)}%</span>
              <Button size="sm" variant="ghost" onClick={simplify} disabled={simpleBusy || !!simple} aria-label="Explain simpler"><Sparkles className={cn("h-4 w-4", simpleBusy && "animate-spin")} /></Button>
              <Button size="sm" variant="ghost" onClick={() => { if (speaking) { stopSpeaking(); setSpeaking(false); } else { speak(d.answer); setSpeaking(true); } }} aria-label="Read aloud">{speaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</Button>
              <CopyButton text={d.answer} /><PinButton kind="answer" title={m.content.slice(0, 80)} body={d.answer + "\n\n" + d.passages.filter(p => p.used).map(p => `[${p.rank}] ${p.citation}`).join("\n")} meta={{ to: "/app/counsel" }} />
              {onRegenerate && <Button size="sm" variant="ghost" onClick={onRegenerate} aria-label="Regenerate"><RefreshCw className="h-4 w-4" /></Button>}
            </div>
          </div>
          <AnimatePresence>{open && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_220px]"><Passages items={d.passages} />
              <div><Chart height={150} data={[{ type: "bar", orientation: "h", x: stages.map(k => d.timings_ms[k]), y: stages, marker: { color: stages.map((_, i) => [C.primary, C.primary, C.warning, C.secondary, C.success][i]) } }]} layout={{ margin: { l: 48, r: 8, t: 8, b: 24 }, xaxis: { title: { text: "ms" } } }} /><div className="mt-1 text-center font-mono text-[10px] text-muted">model {d.model ?? "—"}</div></div></div>
          </motion.div>}</AnimatePresence>
          {d.followups?.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{d.followups.map(f => <button key={f} onClick={() => onFollow(f)} className="cursor-pointer rounded-full border border-white/10 px-3 py-1 text-xs text-muted transition-all hover:border-primary hover:text-white hover:shadow-[0_0_12px_rgb(var(--accent-rgb)/.25)]">{f}</button>)}</div>}
          <div className="mt-2 flex flex-wrap gap-1">{d.passages.filter(p => p.used && p.doc_id?.startsWith("statute::")).slice(0, 4).map(p => <Link key={p.rank} to={`/app/provisions?doc=${encodeURIComponent(p.doc_id!)}`} className="cursor-pointer"><Badge kind="ok">open {p.citation.slice(0, 40)}</Badge></Link>)}</div>
        </div>
      )}
    </div>
  );
}
