import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Download, ExternalLink, FolderOpen, Printer, Trash2 } from "lucide-react";
import { annotate, files, unpin, type FileKind } from "@/lib/store";
import { Button, Card, Chip, Empty, Field, IconButton, Input, Page, Tag, Textarea } from "@/components/ui";
import { download, esc, printSection } from "@/lib/export";
import Md, { toHtml } from "@/components/Md";
import { cn } from "@/lib/utils";

const KINDS: { id: FileKind | "all"; label: string }[] = [{ id: "all", label: "All" }, { id: "answer", label: "Answers" }, { id: "provision", label: "Provisions" }, { id: "brief", label: "Briefs" }, { id: "draft", label: "Drafts" }, { id: "argument", label: "Arguments" }, { id: "timeline", label: "Timelines" }, { id: "comparison", label: "Comparisons" }, { id: "note", label: "Notes" }];

/** The case file: everything saved from any module. Rendered as a page and, compactly, in the header drawer. */
export default function CaseFilesPanel({ compact, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const { items, matter } = files.use(); const nav = useNavigate(); const [kind, setKind] = useState<FileKind | "all">("all"); const [openId, setOpenId] = useState<string | null>(null); const [q, setQ] = useState("");
  const list = items.filter(i => (kind === "all" || i.kind === kind) && (!q || (i.title + i.body).toLowerCase().includes(q.toLowerCase())));
  const exportAll = () => download(`${matter.replace(/\W+/g, "_")}_casefile.md`, `# ${matter}\n\n_Exported ${new Date().toLocaleString()} from LawLine AI_\n\n` + items.map(i => `## [${i.kind}] ${i.title}\n\n${i.body}\n\n${i.note ? `> Note: ${i.note}\n\n` : ""}`).join("---\n\n"));
  const printAll = () => printSection(matter, items.map(i => `<h2>${esc(i.title)}</h2>${toHtml(i.body)}${i.note ? `<p><i>Note: ${esc(i.note)}</i></p>` : ""}`).join("<hr/>"));
  const kinds = KINDS.filter(k => k.id === "all" || items.some(i => i.kind === k.id));
  const actions = items.length > 0 && <><Button size="sm" onClick={exportAll}><Download className="h-4 w-4" />Export</Button><Button size="sm" onClick={printAll}><Printer className="h-4 w-4" />Print</Button><Button size="sm" variant="danger" onClick={() => { if (confirm("Remove every saved item from this case file?")) files.set({ items: [] }); }}><Trash2 className="h-4 w-4" />Clear</Button></>;
  const body = (
    <div className="space-y-4">
      {items.length > 0 && <div className="flex flex-wrap items-center gap-2">
        {kinds.length > 2 && kinds.map(k => <Chip key={k.id} active={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</Chip>)}
        <Input aria-label="Search saved items" placeholder="Search saved items…" value={q} onChange={e => setQ(e.target.value)} className={cn("h-8 text-[13px]", compact ? "w-full" : "ml-auto w-56")} />
      </div>}
      {!items.length ? <Empty icon={<FolderOpen className="h-7 w-7" />} title="Nothing saved yet" desc="Use the bookmark on any answer, provision, brief or draft to collect it here. You can add notes, export the file as Markdown, or print it." />
        : !list.length ? <p className="py-6 text-center text-[14px] text-ink-3">No saved item matches.</p> : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {list.map(i => { const open = openId === i.id; return (
            <li key={i.id}>
              <div className="flex items-center gap-1 px-2 py-2">
                <button onClick={() => setOpenId(open ? null : i.id)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-sunken">
                  <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform", open && "rotate-90")} aria-hidden />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-medium text-ink">{i.title}</span><span className="block text-[12px] text-ink-3">{new Date(i.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}{i.note ? " · has a note" : ""}</span></span>
                  <Tag>{i.kind}</Tag>
                </button>
                {!!i.meta?.to && <IconButton label="Open where this came from" onClick={() => { nav(String(i.meta!.to)); onNavigate?.(); }}><ExternalLink className="h-4 w-4" /></IconButton>}
                <IconButton label="Remove from case file" onClick={() => unpin(i.id)}><Trash2 className="h-4 w-4" /></IconButton>
              </div>
              {open && <div className="space-y-3 border-t border-line bg-sunken p-4">
                <div className="max-h-72 overflow-auto"><Md text={i.body} /></div>
                <Field label="Note"><Textarea rows={2} placeholder="Add a note for this item…" value={i.note ?? ""} onChange={e => annotate(i.id, e.target.value)} /></Field>
              </div>}
            </li>); })}
        </ul>
      )}
      {compact && items.length > 0 && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
  if (compact) return body;
  return (
    <Page title="Case Files" desc="Everything you saved across LawLine, in one file you can annotate, export or print." actions={actions}>
      <Card className="max-w-md"><Field label="Matter name" hint="Used as the title of the export and the printout."><Input value={matter} onChange={e => files.set({ matter: e.target.value })} /></Field></Card>
      {body}
    </Page>
  );
}
