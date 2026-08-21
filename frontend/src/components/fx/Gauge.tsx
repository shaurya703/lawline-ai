import { motion, useReducedMotion } from "framer-motion";
/** Radial SVG gauge (0..1). */
export function Ring({ value, size = 96, stroke = 8, color = "var(--primary)", label, sub }: { value: number; size?: number; stroke?: number; color?: string; label?: string; sub?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value)); const reduce = useReducedMotion();
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${label ?? "value"} ${Math.round(v * 100)}%`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.08)" strokeWidth={stroke} fill="none" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - v) }} transition={{ duration: reduce ? 0 : 1.1, ease: [0.2, 0.8, 0.2, 1] }} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-display text-lg tabular-nums" style={{ color }}>{label ?? `${Math.round(v * 100)}%`}</span>
        {sub && <span className="font-mono text-[10px] uppercase tracking-wider text-muted">{sub}</span>}
      </div>
    </div>
  );
}
/** Horizontal severity meter with segments. */
export function Meter({ value, max = 5, color = "var(--primary)", label }: { value: number; max?: number; color?: string; label?: string }) {
  return (
    <div className="flex items-center gap-1" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      {Array.from({ length: max }).map((_, i) => <motion.span key={i} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: i * 0.06 }} className="h-3 w-3 origin-bottom rounded-[2px]" style={{ background: i < value ? color : "rgba(255,255,255,.08)", boxShadow: i < value ? `0 0 8px ${color}` : undefined }} />)}
    </div>
  );
}
/** Arc gauge (semi-circle) for severity/confidence. */
export function Arc({ value, size = 160, color = "var(--primary)", label, sub }: { value: number; size?: number; color?: string; label: string; sub?: string }) {
  const r = size / 2 - 12, c = Math.PI * r, v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative" style={{ width: size, height: size / 2 + 16 }}>
      <svg width={size} height={size / 2 + 16} viewBox={`0 0 ${size} ${size / 2 + 16}`}>
        <path d={`M12 ${size / 2 + 4} A${r} ${r} 0 0 1 ${size - 12} ${size / 2 + 4}`} stroke="rgba(255,255,255,.08)" strokeWidth={10} fill="none" strokeLinecap="round" />
        <motion.path d={`M12 ${size / 2 + 4} A${r} ${r} 0 0 1 ${size - 12} ${size / 2 + 4}`} stroke={color} strokeWidth={10} fill="none" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - v) }} transition={{ duration: 1, ease: [0.2, 0.8, 0.2, 1] }} style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center"><div className="font-display text-xl" style={{ color }}>{label}</div>{sub && <div className="font-mono text-[10px] uppercase tracking-wider text-muted">{sub}</div>}</div>
    </div>
  );
}
