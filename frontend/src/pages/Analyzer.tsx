import { useState } from "react";
import { Download, FileSearch, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { download } from "@/lib/export";
import { Button, Caption, Card, CopyButton, Empty, ErrorBox, Field, Page, PinButton, Section, Skeleton, Source, Stat, StatStrip, Tag, Textarea, UploadButton, Workbench } from "@/components/ui";
import Md from "@/components/Md";

type Out = { mentions: Record<string, string[]>; words: number; provisions: { citation: string; doc_id: string; text: string }[]; related: { citation: string; sources: string[]; text: string }[]; brief?: string };

export default function Analyzer() {
  const [text, setText] = useState(""); const [out, setOut] = useState<Out | null>(null); const [busy, setBusy] = useState<"" | "scan" | "brief">(""); const [err, setErr] = useState<string | null>(null);
  async function run(brief: boolean) { setBusy(brief ? "brief" : "scan"); setErr(null); try { setOut(await api.post<Out>("/analyze", { text, brief })); } catch (e) { setErr(String(e)); } finally { setBusy(""); } }
  async function upload(f: File) { setBusy("scan"); setErr(null); try { const o = await api.upload<Out>("/analyze/upload", f); setOut(o); setText(t => t || `(uploaded ${f.name})`); } catch (e) { setErr(String(e)); } finally { setBusy(""); } }
  const short = text.length < 20;
  return (
    <Page title="Document Analyzer" desc="Paste an FIR, a notice, a contract clause or an extract from a judgment. LawLine finds the provisions it mentions, pulls their text, retrieves related law and can write a brief grounded in those passages.">
      <Workbench input={
        <Card className="space-y-4">
          <Field label="Document text" hint="At least 20 characters, or upload a file instead.">
            <Textarea rows={12} value={text} onChange={e => setText(e.target.value)} placeholder="e.g. The accused is charged under Sections 420 and 120B IPC and Section 66D of the IT Act…" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={short || !!busy} onClick={() => run(false)}><FileSearch className="h-4 w-4" aria-hidden />{busy === "scan" ? "Scanning…" : "Scan provisions"}</Button>
            <Button disabled={short || !!busy} onClick={() => run(true)}>{busy === "brief" ? "Writing the brief…" : "Generate grounded brief"}</Button>
            <UploadButton accept=".pdf,.txt,.md" onFile={f => void upload(f)}><Upload className="h-4 w-4" aria-hidden />Upload PDF or text</UploadButton>
          </div>
        </Card>}>
        {err && <ErrorBox error={err} />}
        {busy && <><Skeleton className="h-[104px]" /><Skeleton className="h-64" /></>}
        {!busy && !out && !err && <Empty icon={<FileSearch className="h-7 w-7" />} title="The analysis will appear here" desc="A count of what the document cites, the text of each provision it names, related law from hybrid retrieval and, if you ask for it, a grounded brief." />}
        {!busy && out && (<>
          <StatStrip>
            <Stat label="Words" value={out.words.toLocaleString()} />
            <Stat label="Acts" value={out.mentions.acts.length} />
            <Stat label="Sections" value={new Set([...out.mentions.sections, ...out.mentions.bare]).size} />
            <Stat label="Articles" value={new Set(out.mentions.articles).size} />
            <Stat label="Concepts" value={out.mentions.concepts.length} />
          </StatStrip>
          {(out.mentions.acts.length > 0 || out.mentions.concepts.length > 0) && (
            <Card className="space-y-3">
              {out.mentions.acts.length > 0 && <div><Caption>Acts named</Caption><div className="mt-1.5 flex flex-wrap gap-1.5">{out.mentions.acts.map(a => <Tag key={a}>{a}</Tag>)}</div></div>}
              {out.mentions.concepts.length > 0 && <div><Caption>Legal concepts</Caption><div className="mt-1.5 flex flex-wrap gap-1.5">{out.mentions.concepts.map(c => <Tag key={c}>{c}</Tag>)}</div></div>}
            </Card>)}
          {out.brief && (
            <Section title="Grounded brief" desc="Written only from the provisions and passages listed below." actions={<><CopyButton labelled text={out.brief} /><Button size="sm" onClick={() => download("lawline_brief.md", out.brief!)}><Download className="h-4 w-4" aria-hidden />Download</Button><PinButton labelled kind="brief" title="Document brief" body={out.brief} meta={{ to: "/app/analyze" }} /></>}>
              <Md text={out.brief} />
            </Section>)}
          <Section title="Provisions referenced" desc="Each provision the document names, with its text." flush>
            {out.provisions.length ? <ul className="divide-y divide-line border-t border-line">{out.provisions.map(p => <li key={p.doc_id}><details className="group px-5 py-3"><summary className="cursor-pointer text-[14px] font-medium text-ink marker:text-ink-3">{p.citation}</summary><p className="statute-sm mt-2">{p.text}</p></details></li>)}</ul> : <p className="px-5 pb-5 text-[14px] text-ink-3">No explicit provisions were detected.</p>}
          </Section>
          <Section title="Related law" desc="Retrieved by the hybrid pipeline for this document." flush>
            <ul className="divide-y divide-line border-t border-line">{out.related.map((p, i) => <li key={i} className="px-5 py-3.5"><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="min-w-0 flex-1 text-[13px] font-semibold text-ink">{p.citation}</span><span className="flex items-center gap-2.5">{p.sources.map(s => <Source key={s} name={s} />)}</span></div><p className="statute-sm mt-1.5">{p.text}…</p></li>)}</ul>
          </Section>
        </>)}
      </Workbench>
    </Page>
  );
}
