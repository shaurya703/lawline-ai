import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Passage = { rank: number; citation: string; text: string; sources: string[]; score: number };
type Answer = { answer: string; passages: Passage[]; citations: { n: number; used: boolean }[]; timings_ms: Record<string, number> };

const ease = [0.2, 0.8, 0.2, 1] as const;

export default function Counsel() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [ans, setAns] = useState<Answer | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/query", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q, final_k: 5 }) });
      if (!r.ok) throw new Error(`API ${r.status}`);
      setAns(await r.json());
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const used = new Set(ans?.citations.filter(c => c.used).map(c => c.n));
  return (
    <motion.main initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease }} style={{ maxWidth: 960, margin: "0 auto", padding: "var(--s5) var(--s5)" }}>
      <header className="card" style={{ borderRadius: "var(--r-hero)", marginBottom: "var(--s4)" }}>
        <div className="mono">RETRIEVAL CORES ONLINE · CITATION GUARD ON</div>
        <h1 style={{ marginTop: "var(--s2)" }}>LAWLINE AI · COUNSEL</h1>
        <p style={{ color: "var(--text-muted)", margin: "var(--s2) 0 0", maxWidth: "72ch" }}>Grounded answers on Indian law. Every claim is tied to a retrieved provision you can open.</p>
      </header>
      <form onSubmit={ask} style={{ display: "flex", gap: "var(--s2)", marginBottom: "var(--s4)" }}>
        <input className="input" aria-label="Legal question" placeholder="e.g. What is anticipatory bail under BNSS?" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn" disabled={busy} type="submit" style={{ minWidth: 96 }}>{busy ? "…" : "Ask"}</button>
      </form>
      <AnimatePresence mode="wait">
        {err && <motion.div key="err" className="card" style={{ borderColor: "var(--danger)" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>Request failed: {err}. <button className="btn" onClick={ask as never}>Retry</button></motion.div>}
        {busy && <motion.div key="sk" className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-busy="true"><div className="mono">retrieving · fusing · reranking · drafting…</div></motion.div>}
        {ans && !busy && (
          <motion.section key="ans" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease }} aria-live="polite">
            <article className="card" style={{ whiteSpace: "pre-wrap", marginBottom: "var(--s3)" }}>{ans.answer}</article>
            <div className="mono" style={{ marginBottom: "var(--s2)" }}>{ans.passages.length} passages · {used.size} cited · {Math.round(ans.timings_ms.total ?? 0)} ms</div>
            <motion.ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "var(--s2)" }} initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.04 } } }}>
              {ans.passages.map(p => (
                <motion.li key={p.rank} className="card" style={{ padding: "var(--s3)", borderLeft: `3px solid ${used.has(p.rank) ? "var(--success)" : "var(--primary)"}` }} variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}>
                  <span className={`chip ${used.has(p.rank) ? "used" : ""}`}>[{p.rank}]</span><strong style={{ fontSize: "var(--fs-small)" }}>{p.citation}</strong>
                  <span className="mono" style={{ marginLeft: "var(--s2)" }}>{p.sources.join(" · ")} · {p.score.toFixed(2)}</span>
                  <p style={{ margin: "var(--s2) 0 0", fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>{p.text.slice(0, 420)}{p.text.length > 420 ? "…" : ""}</p>
                </motion.li>
              ))}
            </motion.ul>
            <p className="mono" style={{ marginTop: "var(--s3)" }}>This is information, not legal advice.</p>
          </motion.section>
        )}
      </AnimatePresence>
    </motion.main>
  );
}
