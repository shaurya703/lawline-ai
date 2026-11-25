import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUp, ChevronRight, Download, Eraser, Mic, MicOff, Printer, RefreshCw, Volume2, VolumeX, Wand2 } from "lucide-react";
import { api, type ChatOut, type Simplified } from "@/lib/api";
import { logActivity, settings } from "@/lib/store";
import { useDictation, speak, stopSpeaking } from "@/lib/voice";
import { download, printSection } from "@/lib/export";
import { Callout, Chip, CopyButton, ErrorBox, IconButton, Page, Passages, PinButton, Progress, Tag } from "@/components/ui";
import Md, { toHtml } from "@/components/Md";
import { useTypewriter } from "@/lib/typewriter";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string; data?: ChatOut; fresh?: boolean };
const STYLES = ["Plain English", "Formal legal memo", "Law student", "One-line answer"];
const LANGS = ["—", "Hindi", "Kannada", "Tamil", "Telugu", "Marathi", "Bengali", "Gujarati", "Malayalam", "Punjabi"];
const GALLERY = [
  { t: "Everyday", items: ["My landlord refuses to return my deposit. What can I do?", "Can police arrest me without a warrant?", "What happens if my cheque bounces?", "How do I file an RTI?"] },
  { t: "Criminal", items: ["What is the punishment for cheating under Section 420 IPC?", "Is Section 498A bailable?", "IPC 302 → BNS?", "What is anticipatory bail under BNSS?"] },
  { t: "Constitution", items: ["What does Article 21 guarantee?", "Can fundamental rights be suspended during emergency?", "What is the basic structure doctrine?", "Article 32 vs Article 226?"] },
  { t: "Civil and family", items: ["Grounds for divorce under the Hindu Marriage Act?", "What makes a contract void?", "Who can claim maintenance under Section 125 CrPC?", "Is an unregistered lease valid?"] },
];
const STAGES = ["Rewriting the follow-up", "Retrieving: dense, lexical and graph", "Fusing the rankings", "Reranking passages", "Writing the cited answer"];
const opt = "h-8 cursor-pointer rounded-md border border-transparent bg-transparent pl-1.5 pr-6 text-[13px] text-ink hover:border-line-strong focus:border-accent focus:outline-none";

export default function Counsel() {
  const [params, setParams] = useSearchParams(); const st = settings.use();
  const [msgs, setMsgs] = useState<Msg[]>(() => JSON.parse(sessionStorage.getItem("lawline.chat") || "[]"));
  const [q, setQ] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [stage, setStage] = useState(0);
  const [style, setStyle] = useState(st.style); const [lang, setLang] = useState(st.lang); const [scope, setScope] = useState("all"); const [speaking, setSpeaking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null); const boxRef = useRef<HTMLTextAreaElement>(null); const sending = useRef(false);
  const dict = useDictation(useCallback((t: string) => setQ(t), []));
  useEffect(() => { sessionStorage.setItem("lawline.chat", JSON.stringify(msgs.map(m => ({ ...m, fresh: false })))); if (msgs.length) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs]);
  useEffect(() => { const pq = params.get("q"); if (pq) { setParams({}); void ask(pq); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  useEffect(() => { if (!busy) { setStage(0); return; } const id = setInterval(() => setStage(s => Math.min(4, s + 1)), 900); return () => clearInterval(id); }, [busy]);
  useEffect(() => { const h = (e: KeyboardEvent) => { const tag = (e.target as HTMLElement)?.tagName; if (e.key === "m" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT" && st.voice && dict.supported) dict.toggle(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [dict, st.voice]);

  async function ask(text: string) {
    const t = text.trim(); if (!t || sending.current) return; // a ref, not state: two calls in the same tick must not both send
    sending.current = true; setErr(null); setBusy(true); setQ(""); stopSpeaking(); setSpeaking(false); if (boxRef.current) boxRef.current.style.height = "auto";
    const history = msgs.map(m => ({ role: m.role, content: m.content }));
    setMsgs(m => [...m, { role: "user", content: t }]);
    try {
      const out = await api.post<ChatOut>("/chat", { message: t, history, style, translate: lang === "—" ? null : lang, doc_types: scope === "all" ? [] : [scope], use_reranker: st.rerank });
      const content = out.answer + (out.translated ? `\n\n**${lang}:**\n${out.translated}` : "");
      setMsgs(m => [...m, { role: "assistant", content, data: out, fresh: true }]); logActivity("counsel", t, "/app/counsel");
      if (st.autoSpeak) { speak(out.answer); setSpeaking(true); }
    } catch (e) { setErr(String(e)); setMsgs(m => m.slice(0, -1)); setQ(t); } finally { sending.current = false; setBusy(false); }
  }
  const regenerate = () => { const lastUser = [...msgs].reverse().find(m => m.role === "user"); if (!lastUser) return; setMsgs(m => m.slice(0, m.length - (m[m.length - 1].role === "assistant" ? 2 : 1))); setTimeout(() => void ask(lastUser.content), 0); };
  const transcript = msgs.map(m => `**${m.role.toUpperCase()}**: ${m.content}`).join("\n\n");
  const questions = msgs.filter(m => m.role === "user").length; const citations = msgs.reduce((n, m) => n + (m.data?.passages.filter(p => p.used).length ?? 0), 0);
  const empty = !msgs.length && !busy;

  return (
    <Page narrow title="Counsel" desc="Ask about Indian law in plain language. Each answer is written from retrieved statutes and judgments and cites them; follow-up questions keep the context."
      actions={msgs.length > 0 && <>
        <span className="num mr-1 text-[13px] text-ink-3">{questions} {questions === 1 ? "question" : "questions"} · {citations} cited</span>
        <IconButton label="Export the conversation as Markdown" onClick={() => download("lawline_transcript.md", transcript)}><Download className="h-4 w-4" /></IconButton>
        <IconButton label="Print the conversation" onClick={() => printSection("LawLine consultation", msgs.map(m => `<h3>${m.role === "user" ? "You" : "LawLine"}</h3>${toHtml(m.content)}`).join(""))}><Printer className="h-4 w-4" /></IconButton>
        <IconButton label="Clear the conversation" onClick={() => { setMsgs([]); stopSpeaking(); }}><Eraser className="h-4 w-4" /></IconButton>
      </>}>
      <div className="flex min-h-[calc(100vh-260px)] flex-col">
        <div className="flex-1" aria-live="polite">
          {empty && (
            <div className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
              {GALLERY.map(g => <div key={g.t}><h2 className="border-b border-line pb-2 text-[13px] font-semibold text-ink">{g.t}</h2><ul>{g.items.map(x => <li key={x} className="border-b border-line"><button onClick={() => void ask(x)} className="w-full py-2.5 text-left text-[14px] text-ink-2 hover:text-accent">{x}</button></li>)}</ul></div>)}
            </div>
          )}
          {msgs.map((m, i) => m.role === "user"
            ? <h2 key={i} className={cn("font-serif text-[22px] font-medium leading-snug text-ink", i > 0 && "mt-9 border-t border-line pt-9")}>{m.content}</h2>
            : <div key={i} className="mt-3"><Answer m={m} onFollow={ask} onRegenerate={i === msgs.length - 1 ? regenerate : undefined} speaking={speaking} setSpeaking={setSpeaking} typewriter={st.typewriter && !!m.fresh} /></div>)}
          {busy && <div className="mt-4 max-w-sm" role="status">
            <div className="text-[13.5px] text-ink-2">{STAGES[stage]}…</div>
            <div className="mt-2 flex gap-1">{STAGES.map((_, k) => <span key={k} className={cn("h-1 flex-1 rounded-full transition-colors", k <= stage ? "bg-ink" : "bg-line")} />)}</div>
          </div>}
          {err && <div className="mt-4"><ErrorBox error={err} /></div>}
          <div ref={endRef} className="h-6" />
        </div>

        <form className="sticky bottom-4 mt-4 rounded-lg border border-line-strong bg-surface shadow-pop focus-within:border-accent" onSubmit={e => { e.preventDefault(); void ask(q); }}>
          <textarea ref={boxRef} aria-label="Ask a legal question" rows={1} value={q} onChange={e => setQ(e.target.value)} placeholder={dict.listening ? "Listening…" : msgs.length ? "Ask a follow-up…" : "Ask a legal question…"}
            className="block max-h-40 min-h-[52px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[15px] text-ink outline-none placeholder:text-ink-3"
            onInput={e => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = Math.min(160, t.scrollHeight) + "px"; }}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(q); } }} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 pb-2.5 pt-1">
            <label className="flex items-center text-[13px] text-ink-3">Style<select value={style} onChange={e => setStyle(e.target.value)} className={opt}>{STYLES.map(s => <option key={s}>{s}</option>)}</select></label>
            <label className="flex items-center text-[13px] text-ink-3">Translate<select value={lang} onChange={e => setLang(e.target.value)} className={opt}>{LANGS.map(s => <option key={s} value={s}>{s === "—" ? "Off" : s}</option>)}</select></label>
            <label className="flex items-center text-[13px] text-ink-3">Sources<select value={scope} onChange={e => setScope(e.target.value)} className={opt}><option value="all">All</option><option value="statute">Statutes only</option><option value="case">Case law only</option></select></label>
            <span className="ml-auto flex items-center gap-1.5">
              {st.voice && dict.supported && <IconButton label={dict.listening ? "Stop dictation" : "Dictate (M)"} onClick={dict.toggle} active={dict.listening}>{dict.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</IconButton>}
              <button type="submit" disabled={busy || !q.trim()} aria-label="Send" className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-ink text-white transition-colors hover:bg-[#2b2f38] disabled:bg-line-strong"><ArrowUp className="h-4 w-4" /></button>
            </span>
          </div>
        </form>
        {empty && <p className="mt-3 text-center text-[13px] text-ink-3">For step-by-step help try <Link className="link" to="/app/rights">Rights Guides</Link>; for punishments and bailability, <Link className="link" to="/app/offence">Offence Lookup</Link>.</p>}
      </div>
    </Page>
  );
}

const TIMING: [string, string, string][] = [["embed", "Embed", "var(--ink-3)"], ["faiss", "Dense", "var(--src-faiss)"], ["bm25", "BM25", "var(--src-bm25)"], ["kg", "Graph", "var(--src-kg)"], ["rerank", "Rerank", "var(--ink)"]];
/** Where the retrieval time went, as one stacked bar with a legend. */
function Timings({ t, model }: { t: Record<string, number>; model?: string }) {
  const parts = TIMING.filter(([k]) => t[k]); const sum = parts.reduce((n, [k]) => n + t[k], 0) || 1;
  return (
    <div>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Retrieval time by stage">{parts.map(([k, , c]) => <span key={k} style={{ width: `${Math.max(1.5, (t[k] / sum) * 100)}%`, background: c }} />)}</div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-3">{parts.map(([k, l, c]) => <li key={k} className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} aria-hidden />{l} <span className="num text-ink-2">{Math.round(t[k])} ms</span></li>)}{model && <li>Model <span className="text-ink-2">{model}</span></li>}</ul>
    </div>
  );
}

function Answer({ m, onFollow, onRegenerate, speaking, setSpeaking, typewriter }: { m: Msg; onFollow: (q: string) => void; onRegenerate?: () => void; speaking: boolean; setSpeaking: (v: boolean) => void; typewriter: boolean }) {
  const d = m.data!; const { shown, done } = useTypewriter(m.content, typewriter); const [open, setOpen] = useState(false); const [simple, setSimple] = useState<Simplified | null>(null); const [simpleBusy, setSimpleBusy] = useState(false);
  const cited = d.passages.filter(p => p.used).length;
  const conf = Math.min(1, 0.35 + 0.13 * cited + (d.passages.some(p => p.used && p.sources.includes("kg")) ? 0.2 : 0));
  const simplify = async () => { setSimpleBusy(true); try { setSimple(await api.post<Simplified>("/simplify", { text: d.answer, level: "12-year-old" })); } finally { setSimpleBusy(false); } };
  const statutes = d.passages.filter(p => p.used && p.doc_id?.startsWith("statute::")).slice(0, 4);
  const rewritten = d.search_query && d.search_query.toLowerCase() !== m.content.slice(0, 20).toLowerCase();
  return (
    <div>
      <Md text={shown} />{!done && <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-ink align-middle" />}
      {simple && <Callout tone="info" title="In simpler words" className="mt-4"><p>{simple.plain}</p><p className="mt-2 text-ink-2"><span className="font-medium text-ink">Example.</span> {simple.example}</p>{simple.key_terms?.length > 0 && <dl className="mt-2 space-y-1 text-[13px]">{simple.key_terms.map(k => <div key={k.term}><dt className="inline font-medium">{k.term}: </dt><dd className="inline text-ink-2">{k.meaning}</dd></div>)}</dl>}</Callout>}
      {done && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3">
            <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex items-center gap-1.5 text-[13px] font-medium text-ink hover:text-accent"><ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} aria-hidden />Sources <span className="num font-normal text-ink-3">{d.passages.length} passages, {cited} cited</span></button>
            <span className="num text-[13px] text-ink-3">{(d.timings_ms.total / 1000).toFixed(1)} s</span>
            <span className="flex items-center gap-2 text-[13px] text-ink-3" title="An estimate from how many retrieved passages the answer cites, and whether a knowledge-graph match is among them.">Grounding <Progress value={conf} tone={conf > 0.7 ? "ok" : "ink"} className="w-14" /> <span className="num text-ink-2">{Math.round(conf * 100)}%</span></span>
            <span className="ml-auto flex items-center">
              <IconButton label="Explain in simpler words" onClick={simplify} disabled={simpleBusy || !!simple}><Wand2 className={cn("h-4 w-4", simpleBusy && "animate-pulse")} /></IconButton>
              <IconButton label={speaking ? "Stop reading" : "Read aloud"} onClick={() => { if (speaking) { stopSpeaking(); setSpeaking(false); } else { speak(d.answer); setSpeaking(true); } }}>{speaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</IconButton>
              <CopyButton text={d.answer} />
              <PinButton kind="answer" title={m.content.slice(0, 80)} body={d.answer + "\n\n" + d.passages.filter(p => p.used).map(p => `[${p.rank}] ${p.citation}`).join("\n")} meta={{ to: "/app/counsel" }} />
              {onRegenerate && <IconButton label="Answer again" onClick={onRegenerate}><RefreshCw className="h-4 w-4" /></IconButton>}
            </span>
          </div>
          {open && <div className="mt-3 space-y-3">
            {rewritten && <p className="text-[13px] text-ink-3">Searched for: <span className="text-ink-2">“{d.search_query}”</span></p>}
            <Passages items={d.passages} />
            <Timings t={d.timings_ms} model={d.model} />
          </div>}
          {statutes.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]"><span className="text-ink-3">Read the provision:</span>{statutes.map(p => <Link key={p.rank} to={`/app/provisions?doc=${encodeURIComponent(p.doc_id!)}`}><Tag tone="accent" className="hover:border-accent">{p.citation.slice(0, 44)}</Tag></Link>)}</div>}
          {d.followups?.length > 0 && <div className="mt-4"><div className="mb-2 text-[13px] text-ink-3">Related questions</div><div className="flex flex-wrap gap-2">{d.followups.map(f => <Chip key={f} onClick={() => onFollow(f)}>{f}</Chip>)}</div></div>}
        </div>
      )}
    </div>
  );
}
