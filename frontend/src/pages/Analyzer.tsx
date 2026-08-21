import { useState } from "react";
import { Upload, FileSearch } from "lucide-react";
import { api } from "@/lib/api";
import { Badge, Button, Card, Eyebrow, H2, Kpi, Textarea, ErrorBox } from "@/components/shell/ui";

type Out = { mentions: Record<string, string[]>; words: number; provisions: { citation: string; doc_id: string; text: string }[]; related: { citation: string; sources: string[]; text: string }[]; brief?: string };

export default function Analyzer() {
  const [text, setText] = useState(""); const [out, setOut] = useState<Out | null>(null); const [busy, setBusy] = useState<"" | "scan" | "brief">(""); const [err, setErr] = useState<string | null>(null);
  async function run(brief: boolean) { setBusy(brief ? "brief" : "scan"); setErr(null); try { setOut(await api.post<Out>("/analyze", { text, brief })); } catch (e) { setErr(String(e)); } finally { setBusy(""); } }
  async function upload(f: File) { setBusy("scan"); setErr(null); try { const o = await api.upload<Out>("/analyze/upload", f); setOut(o); setText(t => t || `(uploaded ${f.name})`); } catch (e) { setErr(String(e)); } finally { setBusy(""); } }
  return (
    <div className="space-y-6">
      <Card><Eyebrow>Entity extraction · grounded brief</Eyebrow><H2 className="mt-1">Document Analyzer</H2><p className="mt-1 text-sm text-muted">Paste an FIR, notice, contract clause or judgment extract. LawLine extracts the provisions it mentions, pulls their text, retrieves related law and writes a grounded brief.</p>
        <Textarea aria-label="Document text" rows={8} value={text} onChange={e => setText(e.target.value)} placeholder="e.g. The accused is charged under Sections 420 and 120B IPC and Section 66D of the IT Act…" className="mt-4" />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" disabled={text.length < 20 || !!busy} onClick={() => run(false)}><FileSearch className="h-4 w-4" />{busy === "scan" ? "Scanning…" : "Scan provisions"}</Button>
          <Button disabled={text.length < 20 || !!busy} onClick={() => run(true)}>{busy === "brief" ? "Drafting brief…" : "Generate grounded brief"}</Button>
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-[10px] border border-[var(--border)] px-4 text-sm hover:border-primary"><Upload className="h-4 w-4" />Upload PDF / TXT<input type="file" accept=".pdf,.txt,.md" className="hidden" onChange={e => e.target.files?.[0] && upload(e.target.files[0])} /></label>
        </div></Card>
      {err && <ErrorBox error={err} />}
      {out && (<>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5"><Kpi label="Words" value={out.words.toLocaleString()} /><Kpi label="Acts" value={out.mentions.acts.length} delay={.04} /><Kpi label="Sections" value={new Set([...out.mentions.sections, ...out.mentions.bare]).size} delay={.08} /><Kpi label="Articles" value={new Set(out.mentions.articles).size} delay={.12} /><Kpi label="Concepts" value={out.mentions.concepts.length} delay={.16} /></div>
        {(out.mentions.acts.length > 0 || out.mentions.concepts.length > 0) && <Card className="text-sm"><b>Acts:</b> {out.mentions.acts.join(", ") || "—"} &nbsp;·&nbsp; <b>Concepts:</b> {out.mentions.concepts.join(", ") || "—"}</Card>}
        {out.brief && <Card><H2 className="text-base">Grounded brief</H2><div className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed">{out.brief}</div><Button className="mt-3" onClick={() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([out.brief!], { type: "text/markdown" })); a.download = "lawline_brief.md"; a.click(); }}>Download brief</Button></Card>}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><H2 className="text-base">Provisions referenced</H2><div className="mt-2 space-y-2">{out.provisions.map(p => <details key={p.doc_id} className="rounded-[10px] border border-[var(--border)] p-3 text-[13px]"><summary className="cursor-pointer font-semibold">{p.citation}</summary><p className="mt-2 text-muted">{p.text}</p></details>)}{!out.provisions.length && <p className="text-sm text-muted">No explicit provisions detected.</p>}</div></Card>
          <Card><H2 className="text-base">Related law (hybrid retrieval)</H2><div className="mt-2 space-y-2">{out.related.map((p, i) => <div key={i} className="rounded-[10px] border border-[var(--border)] p-3 text-[13px]"><b>{p.citation}</b> {p.sources.map(s => <Badge key={s} kind={s}>{s}</Badge>)}<p className="mt-1 text-muted">{p.text}…</p></div>)}</div></Card>
        </div>
      </>)}
    </div>
  );
}
