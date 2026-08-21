import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from "framer-motion";
import type { ReactNode, PointerEvent } from "react";
import { cn } from "@/lib/utils";
/** 3D tilt wrapper with glare that follows the pointer. */
export default function Tilt({ children, className, max = 8, glare = true }: { children: ReactNode; className?: string; max?: number; glare?: boolean }) {
  const reduce = useReducedMotion();
  const px = useMotionValue(0.5), py = useMotionValue(0.5);
  const rx = useSpring(useTransform(py, [0, 1], [max, -max]), { stiffness: 200, damping: 20 });
  const ry = useSpring(useTransform(px, [0, 1], [-max, max]), { stiffness: 200, damping: 20 });
  const gx = useTransform(px, v => `${v * 100}%`), gy = useTransform(py, v => `${v * 100}%`);
  const onMove = (e: PointerEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); px.set((e.clientX - r.left) / r.width); py.set((e.clientY - r.top) / r.height); e.currentTarget.style.setProperty("--cx", `${((e.clientX - r.left) / r.width) * 100}%`); e.currentTarget.style.setProperty("--cy", `${((e.clientY - r.top) / r.height) * 100}%`); };
  const onLeave = () => { px.set(0.5); py.set(0.5); };
  return (
    <motion.div onPointerMove={onMove} onPointerLeave={onLeave} style={reduce ? undefined : { rotateX: rx, rotateY: ry, transformStyle: "preserve-3d", transformPerspective: 900 }} className={cn("relative", className)}>
      {children}
      {glare && !reduce && <motion.div aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: useTransform([gx, gy], ([x, y]) => `radial-gradient(240px circle at ${x} ${y}, rgba(255,255,255,.10), transparent 60%)`) }} />}
    </motion.div>
  );
}
