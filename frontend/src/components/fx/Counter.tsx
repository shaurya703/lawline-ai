import { useEffect, useRef } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";
/** Animated number that counts up when scrolled into view. */
export default function Counter({ value, decimals = 0, prefix = "", suffix = "", duration = 1.2, className }: { value: number; decimals?: number; prefix?: string; suffix?: string; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null); const inView = useInView(ref, { once: true, margin: "-40px" }); const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const fmt = (v: number) => prefix + v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
    if (!inView || reduce) { el.textContent = fmt(value); return; }
    const c = animate(0, value, { duration, ease: [0.2, 0.8, 0.2, 1], onUpdate: v => { el.textContent = fmt(v); } });
    return () => c.stop();
  }, [value, inView, decimals, prefix, suffix, duration, reduce]);
  return <span ref={ref} className={className}>{prefix}{value.toLocaleString(undefined, { maximumFractionDigits: decimals })}{suffix}</span>;
}
