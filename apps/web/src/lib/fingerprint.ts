/**
 * Deterministic bug fingerprint. Same incident on the same route + same
 * element + similar first console error -> same fingerprint -> grouped as
 * occurrences of a single bug_report.
 */
import { createHash } from "node:crypto";

export type FingerprintInput = {
  projectId: string;
  route: string;
  selector?: string | null;
  domPath?: string | null;
  firstConsoleError?: string | null;
  firstNetworkError?: { method?: string; pathPattern?: string; status?: number } | null;
};

export function computeFingerprint(input: FingerprintInput): string {
  const parts = [
    input.projectId,
    normalizeRoute(input.route),
    normalizeSelector(input.selector ?? input.domPath ?? ""),
    stackSignature(input.firstConsoleError ?? ""),
    networkSignature(input.firstNetworkError),
  ];
  return createHash("sha256").update(parts.join("\x1f")).digest("hex").slice(0, 32);
}

/** /dashboard/acme-corp/billing -> /dashboard/[id]/billing */
export function normalizeRoute(route: string): string {
  if (!route) return "";
  return route
    .split("/")
    .map((seg) => {
      if (!seg) return "";
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) {
        return "[uuid]";
      }
      if (/^\d+$/.test(seg)) return "[id]";
      return seg;
    })
    .join("/");
}

function normalizeSelector(s: string): string {
  // Drop nth-child indexes so list rows of the same kind collapse together.
  return s.replace(/:nth-child\(\d+\)/g, ":nth-child(*)").slice(0, 200);
}

function stackSignature(msg: string): string {
  if (!msg) return "";
  // Keep error name + top frame's function/file:line if present.
  const firstLine = msg.split("\n")[0] ?? "";
  const m = firstLine.match(/^([A-Z][A-Za-z]*Error):\s*(.+)$/);
  if (m) return `${m[1]}:${(m[2] ?? "").slice(0, 80)}`;
  return firstLine.slice(0, 120);
}

function networkSignature(n: FingerprintInput["firstNetworkError"]): string {
  if (!n) return "";
  return `${n.method ?? ""}:${n.pathPattern ?? ""}:${n.status ?? ""}`;
}
