import { Ring, now } from "./util";
import type { ConsoleEntry } from "./types";

const LEVELS = ["log", "info", "warn", "error", "debug"] as const;

export function installConsoleTap(ring: Ring<ConsoleEntry>): () => void {
  const originals: Partial<Record<(typeof LEVELS)[number], (...args: unknown[]) => void>> = {};
  for (const level of LEVELS) {
    const orig = (console as unknown as Record<string, (...args: unknown[]) => void>)[level];
    if (typeof orig !== "function") continue;
    originals[level] = orig;
    (console as unknown as Record<string, (...args: unknown[]) => void>)[level] = (...args: unknown[]) => {
      try {
        ring.push({
          tMs: now(),
          level,
          message: args
            .map((a) => {
              if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack ?? ""}`;
              if (typeof a === "string") return a;
              try { return JSON.stringify(a); } catch { return String(a); }
            })
            .join(" ")
            .slice(0, 4_000),
        });
      } catch {
        /* never break host console */
      }
      orig(...args);
    };
  }
  return () => {
    for (const level of LEVELS) {
      const orig = originals[level];
      if (orig) (console as unknown as Record<string, (...args: unknown[]) => void>)[level] = orig;
    }
  };
}
