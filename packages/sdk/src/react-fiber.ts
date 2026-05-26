/**
 * React fiber probe. Walks up the fiber tree from a DOM node to derive:
 *  - componentPath: "Layout > Dashboard > BillingTable > PayNowButton"
 *  - sourceLocation: file/line/column/function (only available in dev builds
 *    where React keeps `_debugSource` on fibers)
 *
 * Works for React 16+ via the well-known `__reactFiber$xxx` instance key.
 * Silently degrades to undefined in non-React apps.
 */

type Fiber = {
  type?: unknown;
  elementType?: unknown;
  return?: Fiber | null;
  _debugSource?: { fileName?: string; lineNumber?: number; columnNumber?: number };
  _debugOwner?: Fiber | null;
  stateNode?: unknown;
};

function findFiber(el: Element): Fiber | null {
  const keys = Object.keys(el);
  const fiberKey = keys.find((k) => k.startsWith("__reactFiber$"));
  if (!fiberKey) return null;
  return (el as unknown as Record<string, Fiber>)[fiberKey] ?? null;
}

function nameOf(t: unknown): string | null {
  if (!t) return null;
  if (typeof t === "string") return t;
  if (typeof t === "function") {
    const fn = t as { displayName?: string; name?: string };
    return fn.displayName ?? fn.name ?? null;
  }
  if (typeof t === "object") {
    const obj = t as { displayName?: string; render?: { displayName?: string; name?: string }; type?: unknown };
    if (obj.displayName) return obj.displayName;
    if (obj.render) return obj.render.displayName ?? obj.render.name ?? null;
    if (obj.type) return nameOf(obj.type);
  }
  return null;
}

export type ReactProbeResult = {
  componentPath?: string;
  sourceLocation?: {
    file?: string;
    line?: number;
    column?: number;
    function?: string;
  };
};

export function probe(el: Element): ReactProbeResult {
  const fiber = findFiber(el);
  if (!fiber) return {};

  const path: string[] = [];
  let firstNamed: Fiber | null = null;
  let cur: Fiber | null = fiber;
  let depth = 0;
  while (cur && depth < 24) {
    const name = nameOf(cur.elementType ?? cur.type);
    if (name && /^[A-Z]/.test(name)) {
      path.unshift(name);
      if (!firstNamed) firstNamed = cur;
    }
    cur = cur.return ?? null;
    depth++;
  }

  const dbg = firstNamed?._debugSource;
  return {
    componentPath: path.length > 0 ? path.join(" > ") : undefined,
    sourceLocation: dbg
      ? {
          file: dbg.fileName,
          line: dbg.lineNumber,
          column: dbg.columnNumber,
          function: path[path.length - 1],
        }
      : path[path.length - 1]
        ? { function: path[path.length - 1] }
        : undefined,
  };
}
