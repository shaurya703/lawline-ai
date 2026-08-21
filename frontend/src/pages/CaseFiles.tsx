import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Download, FileText, FolderKanban, Printer, Trash2 } from "lucide-react";
import { annotate, files, unpin, type FileKind } from "@/lib/store";
import { Button, Card, Empty, Input, PageHeader, Tabs, Textarea, Badge } from "@/components/shell/ui";
import { download, printSection } from "@/lib/export";
import { toHtml } from "@/components/fx/Md";
import Md from "@/components/fx/Md";
import { cn } from "@/lib/utils";

const KINDS: { id: FileKind | "all"; label: string }[] = [{ id: "all", label: "All" }, { id: "answer", label: "Answers" }, { id: "provision", label: "Provisions" }, { id: "brief", label: "Briefs" }, { id: "draft", label: "Drafts" }, { id: "argument", label: "Arguments" }, { id: "timeline", label: "Timelines" }, { id: "comparison", label: "Comparisons" }, { id: "note", label: "Notes" }];
const COLOR: Record<string, string> = { answer: "#00e5ff", provision: "#ffd166", brief: "#7c4dff", draft: "#2ee6a6", argument: "#ff9f43", timeline: "#48dbfb", comparison: "#b39dff", note: "#8b9bb4", quiz: "#ffd166" };

export default function CaseFilesPanel({ compact, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const { items, matter } = files.use(); const nav = useNavigate(); const [kind, setKind] = useState<FileKind | "all">("all"); const [openId, setOpenId] = useState<string | null>(null); const [q, setQ] = useState("");
  const list = items.filter(i => (kind === "all" || i.kind === kind) && (!q || (i.title + i.body).toLowerCase().includes(q.toLowerCase())));
  const exportAll = () => download(`${matter.replace(/\W+/g, "_")}_casefile.md`, `# ${matter}\n\n_Exported ${new Date().toLocaleString()} from LawLine AI_\n\n` + items.map(i => `## [${i.kind}] ${i.title}\n\n${i.body}\n\n${i.note ? `> Note: ${i.note}\n\n` : ""}`).join("---\n\n"));
  const printAll = () => printSection(matter, items.map(i => `<h2>${i.title}</h2>${toHtml(i.body)}${i.note ? `<p><i>Note: ${i.note}</i></p>` : ""}`).join("<hr/>"));
  const body = (
    <div className="space-y-4">
      {!compact && <div className="flex flex-wrap items-center gap-3"><Input aria-label="Matter name" value={matter} onChange={e => files.set({ matter: e.target.value })} className="max-w-xs font-display tracking-wider" /><Input aria-label="Search files" placeholder="Search pinned items…" value={q} onChange={e => setQ(e.target.value)} className="max-w-xs" /></div>}
      <div className="flex flex-wrap items-center gap-2"><Tabs value={kind} onChange={setKind} items={KINDS.filter(k => k.id === "all" || items.some(i => i.kind === k.id))} />{compact && <Input aria-label="Search files" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} className="h-9 max-w-[160px]" />}</div>
      {!list.length ? <Empty icon={<FolderKanban className="h-8 w-8" />} title="Nothing pinned yet" desc="Use the bookmark icon on any answer, provision, draft or brief to collect it here. Add notes, export as Markdown, or print a dossier." /> : (
        <ul className="grid gap-2">
          <AnimatePresence initial={false}>
            {list.map(i => (
              <motion.li key={i.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} className="glass rounded-[12px] p-3" style={{ borderLeft: `3px solid ${COLOR[i.kind] ?? "#8b9bb4"}` }}>
                <div className="flex items-start gap-2">
                  <button onClick={() => setOpenId(openId === i.id ? null : i.id)} className="min-w-0 flex-1 cursor-pointer text-left"><div className="flex items-center gap-2"><Badge className="mr-0" kind={i.kind === "answer" ? "ok" : undefined}>{i.kind}</Badge><span className="truncate text-sm font-semibold text-white">{i.title}</span></div><div className="mt-0.5 font-mono text-[10px] text-muted">{new Date(i.at).toLocaleString()}{i.note ? " · has note" : ""}</div></button>
                  {!!i.meta?.to && <Button size="sm" variant="ghost" onClick={() => { nav(String(i.meta!.to)); onNavigate?.(); }} aria-label="Open source"><FileText className="h-4 w-4" /></Button>}
                  <Button size="sm" variant="ghost" onClick={() => unpin(i.id)} aria-label="Remove"><Trash2 className="h-4 w-4 text-danger/80" /></Button>
                </div>
                <AnimatePresence>{openId === i.id && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className={cn("mt-3 max-h-72 overflow-auto rounded-[10px] border border-white/10 bg-black/20 p-3 text-[13px]")}><Md text={i.body} /></div>
                  <Textarea rows={2} className="mt-2 text-sm" placeholder="Add a note for this item…" value={i.note ?? ""} onChange={e => annotate(i.id, e.target.value)} />
                </motion.div>}</AnimatePresence>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {items.length > 0 && <div className="flex flex-wrap gap-2"><Button size="sm" onClick={exportAll}><Download className="h-4 w-4" />Export Markdown</Button><Button size="sm" onClick={printAll}><Printer className="h-4 w-4" />Print dossier</Button><Button size="sm" variant="danger" onClick={() => { if (confirm("Clear all pinned items?")) files.set({ items: [] }); }}><Trash2 className="h-4 w-4" />Clear</Button></div>}
    </div>
  );
  if (compact) return body;
  return <div className="space-y-6"><PageHeader eyebrow="Workspace" title="Case Files" desc="Everything you pinned across LawLine — answers, provisions, briefs, drafts and arguments — in one dossier you can annotate, export or print." /><Card>{body}</Card></div>;
}
