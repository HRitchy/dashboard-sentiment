"use client";

import { useEffect, useRef, useState } from "react";

// Animates from the previous value to the target on change. All setState calls
// happen inside requestAnimationFrame callbacks, never synchronously inside the
// effect body — keeps react-hooks/set-state-in-effect happy.
export function useCountUp(target: number | null, durationMs = 600): number | null {
  const [display, setDisplay] = useState<number | null>(target);
  const fromRef = useRef<number | null>(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);

    if (target == null) {
      rafRef.current = requestAnimationFrame(() => {
        setDisplay(null);
        fromRef.current = null;
      });
      return () => {
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      };
    }

    const from = fromRef.current;
    if (from == null || from === target) {
      rafRef.current = requestAnimationFrame(() => {
        setDisplay(target);
        fromRef.current = target;
      });
      return () => {
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      };
    }

    const start = performance.now();
    const startVal = from;
    const delta = target - startVal;

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(startVal + delta * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return display;
}
