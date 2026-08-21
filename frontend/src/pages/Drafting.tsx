import { useState } from "react";
import { PenLine } from "lucide-react";
import { api } from "@/lib/api";
import { useFetch } from "@/lib/hooks";
import { Badge, Button, Card, Eyebrow, H2, Input, Select, Textarea, ErrorBox, Skeleton } from "@/components/shell/ui";

type Tpl = { id: string; name: string; fields: string[] };
type Out = { draft: string; passages: { rank: number; citation: string; sources: string[]; text: string }[] };

export default function Drafting() {
  const t = useFetch(() => api.get<Tpl[]>("/draft/templates"));
  const [id, setId] = useState("legal_notice"); const [fields, setFields] = useState<Record<string, string>>({}); const [tone, setTone] = useState("Standard"); const [lang, setLang] = useState("English");
  const [out, setOut] = useState<Out | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const tpl = t.data?.find(x => x.id === id);
  async function run() { setBusy(true); setErr(null); try { setOut(await api.post<Out>("/draft", { template: id, fields, tone, language: lang })); } catch (e) { setErr(String(e)); } finally { setBusy(false); } }
  return (
    <div className="space-y-6">
      <Card><Eyebrow>Grounded drafting</Eyebrow><H2 className="mt-1">Drafting Studio</H2><p className="mt-1 text-sm text-muted">First drafts of notices, complaints, applications and memos, grounded in the provisions LawLine retrieves for your facts. Always review with a lawyer before use.</p></Card>
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Card className="space-y-3">
          {t.loading ? <Skeleton className="h-40" /> : (<>
            <label className="block text-xs text-muted">Document type<Select value={id} onChange={e => { setId(e.target.value); setFields({}); setOut(null); }}>{t.data?.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></label>
            {tpl?.fields.map(f => <label key={f} className="block text-xs text-muted">{f}{/facts|grounds|information|sought/i.test(f) ? <Textarea rows={3} value={fields[f] ?? ""} onChange={e => setFields({ ...fields, [f]: e.target.value })} /> : <Input value={fields[f] ?? ""} onChange={e => setFields({ ...fields, [f]: e.target.value })} />}</label>)}
            <div className="grid grid-cols-2 gap-2"><label className="block text-xs text-muted">Tone<Select value={tone} onChange={e => setTone(e.target.value)}>{["Plain", "Standard", "Formal / legalese"].map(x => <option key={x}>{x}</option>)}</Select></label><label className="block text-xs text-muted">Language<Select value={lang} onChange={e => setLang(e.target.value)}>{["English", "Hindi", "English + Hindi"].map(x => <option key={x}>{x}</option>)}</Select></label></div>
            <Button variant="primary" className="w-full" disabled={busy} onClick={run}><PenLine className="h-4 w-4" />{busy ? "Drafting…" : "Draft it"}</Button>
          </>)}
        </Card>
        <div className="space-y-4">
          {err && <ErrorBox error={err} retry={run} />}
          {busy && <Skeleton className="h-96" />}
          {out && !busy && (<>
            <Card><div className="flex items-center justify-between"><H2 className="text-base">Draft</H2><Button className="h-9" onClick={() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([out.draft], { type: "text/markdown" })); a.download = `${id}.md`; a.click(); }}>Download</Button></div>
              <div className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed">{out.draft}</div></Card>
            <Card><H2 className="text-base">Provisions used</H2><div className="mt-2 space-y-2">{out.passages.map(p => <div key={p.rank} className="rounded-[10px] border border-[var(--border)] p-3 text-[13px]"><Badge>[{p.rank}]</Badge><b>{p.citation}</b> {p.sources.map(s => <Badge key={s} kind={s}>{s}</Badge>)}<p className="mt-1 text-muted">{p.text}…</p></div>)}</div></Card>
          </>)}
          {!out && !busy && !err && <Card className="text-sm text-muted">Fill in the fields and click <b>Draft it</b>. The draft cites only retrieved statutory passages; missing facts become [PLACEHOLDERS].</Card>}
        </div>
      </div>
    </div>
  );
}
