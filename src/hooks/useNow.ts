import { useEffect, useState } from "react";

/** The time, re-read every `stepMs` - for "in 5 min" and booked-call buttons that turn on by themselves. */
export function useNow(stepMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), stepMs);
    return () => clearInterval(id);
  }, [stepMs]);
  return now;
}
