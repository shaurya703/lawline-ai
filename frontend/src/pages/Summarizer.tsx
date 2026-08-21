import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Gavel, Quote, Upload } from "lucide-react";
import { api, type Summary } from "@/lib/api";
import { Badge, Button, Card, CopyButton, Empty, ErrorBox, PageHeader, Passages, PinButton, Skeleton, Textarea } from "@/components/shell/ui";
import { logActivity } from "@/lib/store";
import { printSection } from "@/lib/export";
const OUT: Record<string, string> = { allowed: "#2ee6a6", "partly allowed": "#ffd166", dismissed: "#ff4d6d", remanded: "#48dbfb", acquitted: "#2ee6a6", convicted: "#ff4d6d", other: "#8b9bb4" };
const SAMPLE = `IN THE SUPREME COURT OF INDIA — Criminal Appeal No. 1234 of 2019. Appellant: Ramesh Kumar. Respondent: State of Rajasthan. The appellant was convicted by the Sessions Judge under Section 302 IPC for the murder of his neighbour on 12 March 2015 and sentenced to life imprisonment; the High Court affirmed. The prosecution relied on the dying declaration recorded by the Executive Magistrate and on the testimony of PW-3, an eyewitness who turned hostile in part. The defence argued that the dying declaration was not voluntary as the deceased was under sedation, and that the medical evidence (post-mortem showing a single stab wound) was consistent with a sudden quarrel, attracting Exception 4 to Section 300. Held: the dying declaration, corroborated by the certificate of fitness, was reliable; however, the occurrence arose from a sudden fight without premeditation, and the single blow did not show an intention to cause death. The conviction is altered to Section 304 Part I IPC and the sentence reduced to ten years' rigorous imprisonment. Appeal partly allowed.`;

export default function Summarizer() {
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [out, setOut] = useState<Summary | null>(null);
  async function run(t = text) { if (t.trim().length < 40) return; setBusy(true); setErr(null); try { const r = await api.post<Summary>("/summarize", { text: t }); setOut(r); logActivity("summarize", r.summary.title || "Judgment summarised", "/app/summarize"); } catch (e) { setErr(String(e)); } finally { setBusy(false); } }
  async function onFile(f: File) { const t = f.name.toLowerCase().endsWith(".pdf") ? null : await f.text(); if (t) { setText(t); void run(t); } else { setBusy(true); try { const r = await api.upload<{ text?: string }>("/analyze/upload", f); if (r.text) { setText(r.text); void run(r.text); } else setErr("Could not extract text from PDF — paste it instead."); } catch (e) { setErr(String(e)); } finally { setBusy(false); } } }
  const s = out?.summary; const md = s ? `# ${s.title}\n\n**${s.court ?? ""} ${s.year ?? ""}** · ${s.parties}\n\n> ${s.one_liner}\n\n## Facts\n${s.facts.map(f => "- " + f).join("\n")}\n\n## Issues\n${s.issues.map(f => "- " + f).join("\n")}\n\n## Holding\n${s.holding}\n\n## Ratio\n${s.ratio}\n\n**Outcome:** ${s.outcome}\n\n**Provisions:** ${s.provisions.join(", ")}` : "";
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Reading assistant" title="Judgment Summarizer" desc="Paste a judgment, order or long legal document. LawLine extracts parties, facts, issues, holding, ratio, provisions and outcome — and shows the statutory passages it checked against." />
      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <Card className="space-y-3 p-5">
          <Textarea rows={14} value={text} onChange={e => setText(e.target.value)} placeholder="Paste judgment text here…" aria-label="Judgment text" className="text-sm" />
          <div className="flex flex-wrap gap-2"><Button variant="primary" onClick={() => void run()} disabled={busy || text.trim().length < 40}><Gavel className="h-4 w-4" />{busy ? "Reading…" : "Summarise"}</Button>
            <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-[10px] border border-white/10 bg-white/[.03] px-4 text-sm font-semibold hover:border-primary/60"><Upload className="h-4 w-4" />Upload .txt/.pdf<input type="file" accept=".txt,.md,.pdf" className="hidden" onChange={e => e.target.files?.[0] && void onFile(e.target.files[0])} /></label>
            <Button variant="ghost" onClick={() => { setText(SAMPLE); void run(SAMPLE); }}>Try a sample</Button></div>
          <div className="font-mono text-[10px] text-muted">{text.split(/\s+/).filter(Boolean).length.toLocaleString()} words · first ~14k characters are read</div>
        </Card>
        <div className="space-y-4">
          {err && <ErrorBox error={err} />}
          {busy && <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-56 md:col-span-2" /></div>}
          {!busy && !out && <Empty icon={<Gavel className="h-8 w-8" />} title="Your brief will appear here" desc="Structured into facts, issues, holding and ratio, with verbatim key quotes and linked provisions." />}
          {!busy && s && (
            <motion.div initial="h" animate="s" variants={{ s: { transition: { staggerChildren: .07 } } }} className="space-y-4">
              <motion.div variants={{ h: { opacity: 0, y: 10 }, s: { opacity: 1, y: 0 } }}><Card className="relative overflow-hidden">
                <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl" style={{ background: (OUT[s.outcome] ?? OUT.other) + "33" }} />
                <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary/80">{s.court ?? "Court"}{s.year ? ` · ${s.year}` : ""}</div><h3 className="mt-1 font-display text-xl text-white">{s.title}</h3><div className="text-sm text-muted">{s.parties}</div></div>
                  <div className="rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-wider" style={{ borderColor: OUT[s.outcome] ?? OUT.other, color: OUT[s.outcome] ?? OUT.other, boxShadow: `0 0 16px ${(OUT[s.outcome] ?? OUT.other)}55` }}>{s.outcome}</div></div>
                <p className="mt-3 border-l-2 border-primary pl-3 text-[15px] italic text-fg/90">{s.one_liner}</p>
                <div className="mt-3 flex flex-wrap gap-1">{s.provisions.map(p => <Link key={p} to={`/app/counsel?q=${encodeURIComponent("Explain " + p)}`}><Badge kind="ok">{p}</Badge></Link>)}</div>
                <div className="mt-3 flex flex-wrap gap-2"><PinButton size="md" kind="brief" title={s.title} body={md} meta={{ to: "/app/summarize" }} /><CopyButton size="md" text={md} /><Button size="sm" variant="ghost" onClick={() => printSection(s.title, md.replace(/\n/g, "<br/>"))}>Print</Button></div>
              </Card></motion.div>
              <div className="grid gap-4 md:grid-cols-2">
                <Sec title="Facts" items={s.facts} hue="#00e5ff" /><Sec title="Issues" items={s.issues} hue="#ffd166" />
                <motion.div variants={{ h: { opacity: 0, y: 10 }, s: { opacity: 1, y: 0 } }}><Card className="h-full"><div className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: "#2ee6a6" }}>Holding</div><p className="mt-2 text-sm">{s.holding}</p></Card></motion.div>
                <motion.div variants={{ h: { opacity: 0, y: 10 }, s: { opacity: 1, y: 0 } }}><Card className="h-full"><div className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: "#7c4dff" }}>Ratio decidendi</div><p className="mt-2 text-sm">{s.ratio}</p></Card></motion.div>
              </div>
              {s.key_quotes?.length > 0 && <motion.div variants={{ h: { opacity: 0, y: 10 }, s: { opacity: 1, y: 0 } }}><Card><div className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary/80">Key quotes</div><div className="mt-2 grid gap-3 md:grid-cols-3">{s.key_quotes.map((q, i) => <blockquote key={i} className="rounded-[12px] border border-white/10 bg-black/20 p-3 text-sm italic text-fg/90"><Quote className="mb-1 h-3 w-3 text-primary" />{q}</blockquote>)}</div></Card></motion.div>}
              {s.precedents?.length > 0 && <div className="flex flex-wrap gap-1">{s.precedents.map(p => <Badge key={p}>{p}</Badge>)}</div>}
              <Card><div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Statutory passages consulted</div><Passages items={out!.passages} compact /></Card>
            </motion.div>)}
        </div>
      </div>
    </div>
  );
}
function Sec({ title, items, hue }: { title: string; items: string[]; hue: string }) { return <motion.div variants={{ h: { opacity: 0, y: 10 }, s: { opacity: 1, y: 0 } }}><Card className="h-full"><div className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: hue }}>{title}</div><ul className="mt-2 space-y-2">{items.map((f, i) => <li key={i} className="flex gap-2 text-sm"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: hue, boxShadow: `0 0 8px ${hue}` }} />{f}</li>)}</ul></Card></motion.div>; }
