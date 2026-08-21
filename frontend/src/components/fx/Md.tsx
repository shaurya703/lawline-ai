import { Fragment, type ReactNode } from "react";
/** Minimal markdown renderer (headings, lists, bold, inline code, [n] citation chips). No external deps. */
function inline(s: string, key: number): ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\d+(?:\s*,\s*\d+)*\])/g);
  return <Fragment key={key}>{parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(p)) return <code key={i}>{p.slice(1, -1)}</code>;
    if (/^\[\d+(?:\s*,\s*\d+)*\]$/.test(p)) return <span key={i} className="cite" title="Cited passage">{p}</span>;
    return p;
  })}</Fragment>;
}
export function toHtml(md: string) { return md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/^### (.*)$/gm, "<h3>$1</h3>").replace(/^## (.*)$/gm, "<h2>$1</h2>").replace(/^# (.*)$/gm, "<h1>$1</h1>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/^\s*[-*] (.*)$/gm, "<li>$1</li>").replace(/(\[\d+(?:,\s*\d+)*\])/g, '<span class="cite">$1</span>').replace(/\n{2,}/g, "<br/><br/>"); }
export default function Md({ text, className = "" }: { text: string; className?: string }) {
  const lines = text.replace(/\r/g, "").split("\n"); const out: ReactNode[] = []; let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => { if (list) { const L = list.ordered ? "ol" : "ul"; out.push(<L key={out.length}>{list.items.map((it, i) => <li key={i}>{inline(it, i)}</li>)}</L>); list = null; } };
  lines.forEach((raw, i) => {
    const l = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(l); const b = /^\s*[-*•]\s+(.*)$/.exec(l); const n = /^\s*\d+[.)]\s+(.*)$/.exec(l);
    if (h) { flush(); const T = (`h${h[1].length}`) as "h1" | "h2" | "h3"; out.push(<T key={i}>{inline(h[2], i)}</T>); }
    else if (b) { if (!list || list.ordered) { flush(); list = { ordered: false, items: [] }; } list.items.push(b[1]); }
    else if (n) { if (!list || !list.ordered) { flush(); list = { ordered: true, items: [] }; } list.items.push(n[1]); }
    else if (!l.trim()) flush();
    else { flush(); out.push(<p key={i}>{inline(l, i)}</p>); }
  });
  flush();
  return <div className={`prose-ll ${className}`}>{out}</div>;
}
