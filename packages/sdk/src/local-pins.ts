/**
 * Local cache of pins the current browser has reported. Stored in
 * localStorage so they survive reload / cross-tab. We do NOT auto-render
 * anything on the host page — it's the panel list + eye toggle that decides
 * visibility. That keeps the host UI clean in dev (the whole point: pins
 * only show up when the reporter explicitly opens the panel and reveals one).
 */

const KEY = "quad.local_pins.v1";
const MAX = 50;

export type LocalPin = {
  id: string; // bug_report id from the server
  createdAt: number;
  route: string; // location.pathname when reported
  pageUrl: string;
  selector: string;
  domPath?: string;
  componentPath?: string;
  body: string;
};

function read(): LocalPin[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as LocalPin[]) : [];
  } catch { return []; }
}

function write(pins: LocalPin[]): void {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(pins.slice(-MAX))); } catch { /* quota */ }
}

export function list(): LocalPin[] {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

export function add(pin: LocalPin): void {
  const all = read();
  all.push(pin);
  write(all);
  notify();
}

export function remove(id: string): void {
  write(read().filter((p) => p.id !== id));
  notify();
}

export function clear(): void {
  write([]);
  notify();
}

// ---- visibility toggle (per-pin reveal in the host page) ------------------

const VKEY = "quad.local_pins.visible.v1";

function readVisible(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(VKEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { return new Set(); }
}
function writeVisible(s: Set<string>): void {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(VKEY, JSON.stringify([...s])); } catch { /* quota */ }
}

export function isVisible(id: string): boolean { return readVisible().has(id); }
export function setVisible(id: string, v: boolean): void {
  const s = readVisible();
  if (v) s.add(id); else s.delete(id);
  writeVisible(s);
  notify();
}
export function visibleIds(): string[] { return [...readVisible()]; }

// ---- listeners ------------------------------------------------------------

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  for (const fn of listeners) {
    try { fn(); } catch { /* ignore */ }
  }
}
