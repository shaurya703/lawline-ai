import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
/** Reveals text progressively (character chunks) — used for fresh assistant answers. */
export function useTypewriter(text: string, enabled: boolean, cps = 140) {
  const reduce = useReducedMotion(); const [n, setN] = useState(enabled && !reduce ? 0 : text.length);
  useEffect(() => {
    if (!enabled || reduce) { setN(text.length); return; }
    setN(0); let i = 0; const step = Math.max(1, Math.round(cps / 30));
    const id = setInterval(() => { i = Math.min(text.length, i + step); setN(i); if (i >= text.length) clearInterval(id); }, 33);
    return () => clearInterval(id);
  }, [text, enabled, reduce, cps]);
  return { shown: text.slice(0, n), done: n >= text.length };
}
