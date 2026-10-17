"use client";
import { useEffect, useSyncExternalStore } from "react";
import { useProgress } from "@/learning/store";

const subscribe = (notify: () => void) =>
  useProgress.persist.onFinishHydration(notify);
const hydrated = () => useProgress.persist.hasHydrated();
const server = () => false;

/** Progress lives in localStorage, so pages render only after it has been read. */
export function useReady(): boolean {
  const ready = useSyncExternalStore(subscribe, hydrated, server);
  useEffect(() => {
    if (!useProgress.persist.hasHydrated())
      void useProgress.persist.rehydrate();
  }, []);
  return ready;
}

export function Gate({ children }: { children: React.ReactNode }) {
  return useReady() ? (
    <>{children}</>
  ) : (
    <p className="p-6 text-sm opacity-60">Loading progress…</p>
  );
}
