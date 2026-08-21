import { useEffect, useState } from "react";
export function useFetch<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { let live = true; setLoading(true); setError(null); fn().then(d => { if (live) setData(d); }).catch(e => { if (live) setError(String(e)); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, loading };
}
export function useNarrow(query = "(max-width: 767px)") {
  const [n, setN] = useState(false);
  useEffect(() => { const m = window.matchMedia(query); const s = () => setN(m.matches); s(); m.addEventListener("change", s); return () => m.removeEventListener("change", s); }, [query]);
  return n;
}
