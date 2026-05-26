import { Ring, now } from "./util";
import type { NetworkEntry } from "./types";

/** Captures only 4xx/5xx responses; the goal is incident context, not full HAR. */
export function installNetworkTap(ring: Ring<NetworkEntry>, ignoreUrlSubstr: string[] = []): () => void {
  if (typeof fetch !== "function") return () => {};
  const origFetch = window.fetch.bind(window);

  window.fetch = async function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const t0 = now();
    if (ignoreUrlSubstr.some((s) => url.includes(s))) {
      return origFetch(input, init);
    }
    try {
      const res = await origFetch(input, init);
      if (res.status >= 400) {
        let preview: string | undefined;
        try {
          const clone = res.clone();
          const text = await clone.text();
          preview = text.slice(0, 500);
        } catch { /* ignore */ }
        ring.push({
          tMs: t0,
          method,
          url,
          status: res.status,
          durationMs: Math.round(now() - t0),
          bodyPreview: preview,
        });
      }
      return res;
    } catch (err) {
      ring.push({
        tMs: t0,
        method,
        url,
        status: 0, // network-layer failure
        durationMs: Math.round(now() - t0),
        bodyPreview: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };

  return () => {
    window.fetch = origFetch;
  };
}
