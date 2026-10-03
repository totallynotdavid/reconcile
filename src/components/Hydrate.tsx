"use client";
import { useEffect, useState } from "react";
import { useProgress } from "@/learning/store";

/** Progress lives in localStorage, so pages render only after it has been read. */
export function useReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (useProgress.persist.hasHydrated()) return setReady(true);
    const off = useProgress.persist.onFinishHydration(() => setReady(true));
    void useProgress.persist.rehydrate();
    return off;
  }, []);
  return ready;
}

export function Gate({ children }: { children: React.ReactNode }) {
  return useReady() ? <>{children}</> : <p className="p-6 text-sm opacity-60">Loading progress…</p>;
}
