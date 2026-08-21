import { useEffect } from "react";
/** Fixed atmospheric background: drifting gradient blobs, faint grid, film grain and a cursor spotlight. */
export default function Aurora() {
  useEffect(() => {
    let raf = 0; let x = innerWidth / 2, y = innerHeight / 3;
    const move = (e: PointerEvent) => { x = e.clientX; y = e.clientY; if (!raf) raf = requestAnimationFrame(() => { document.documentElement.style.setProperty("--mx", x + "px"); document.documentElement.style.setProperty("--my", y + "px"); raf = 0; }); };
    addEventListener("pointermove", move, { passive: true }); return () => removeEventListener("pointermove", move);
  }, []);
  return <div className="aurora" aria-hidden><div className="blob b1" /><div className="blob b2" /><div className="blob b3" /><div className="spot" /><div className="noise" /></div>;
}
