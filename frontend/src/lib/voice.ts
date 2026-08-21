import { useCallback, useEffect, useRef, useState } from "react";
/** Web Speech API wrappers: dictation (SpeechRecognition) and read-aloud (speechSynthesis). */
type Rec = { start(): void; stop(): void; abort(): void; lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
type RecCtor = new () => Rec;
const Ctor = (): RecCtor | null => (globalThis as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor }).SpeechRecognition ?? (globalThis as unknown as { webkitSpeechRecognition?: RecCtor }).webkitSpeechRecognition ?? null;
export function useDictation(onText: (t: string) => void, lang = "en-IN") {
  const [listening, setListening] = useState(false); const ref = useRef<Rec | null>(null); const supported = !!Ctor();
  const stop = useCallback(() => { ref.current?.stop(); setListening(false); }, []);
  const start = useCallback(() => {
    const C = Ctor(); if (!C) return; const r = new C(); ref.current = r; r.lang = lang; r.interimResults = true; r.continuous = false;
    r.onresult = e => { const t = Array.from(e.results).map(x => x[0].transcript).join(" "); onText(t); };
    r.onend = () => setListening(false); r.onerror = () => setListening(false); r.start(); setListening(true);
  }, [onText, lang]);
  useEffect(() => () => ref.current?.abort(), []);
  return { supported, listening, start, stop, toggle: () => (listening ? stop() : start()) };
}
export function speak(text: string, lang = "en-IN") {
  if (!("speechSynthesis" in globalThis)) return false;
  speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text.replace(/\[\d+(,\s*\d+)*\]/g, "").replace(/[*#_`]/g, "")); u.lang = lang; u.rate = 1.02; speechSynthesis.speak(u); return true;
}
export const stopSpeaking = () => { if ("speechSynthesis" in globalThis) speechSynthesis.cancel(); };
