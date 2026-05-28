/**
 * DOM + meta helpers. Zero deps.
 */

export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/** A short ring buffer for capturing the last N events without leaking memory. */
export class Ring<T> {
  private buf: T[] = [];
  constructor(private max: number) {}
  push(v: T): void {
    this.buf.push(v);
    if (this.buf.length > this.max) this.buf.shift();
  }
  snapshot(): T[] {
    return this.buf.slice();
  }
  clear(): void {
    this.buf = [];
  }
}

export function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Stable, mostly-unique CSS selector for an element. Prefers data-testid /
 * id / unique tag-class combos before falling back to nth-child. */
export function selectorFor(el: Element): string {
  if (el instanceof HTMLElement) {
    const dt = el.dataset.testid ?? el.dataset.qaId ?? el.dataset.cy;
    if (dt) return `[data-testid="${cssEscape(dt)}"]`;
  }
  if (el.id) return `#${cssEscape(el.id)}`;
  // Walk up to a more identifiable ancestor (up to 4 levels)
  const parts: string[] = [];
  let cur: Element | null = el;
  let depth = 0;
  while (cur && depth < 4 && cur.nodeType === 1 && cur.tagName !== "BODY") {
    parts.unshift(localSelector(cur));
    cur = cur.parentElement;
    depth++;
  }
  return parts.join(" > ");
}

function localSelector(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (el.id) return `${tag}#${cssEscape(el.id)}`;
  if (el instanceof HTMLElement) {
    const cls = el.className && typeof el.className === "string"
      ? el.className.trim().split(/\s+/).slice(0, 2).map(cssEscape).join(".")
      : "";
    if (cls) return `${tag}.${cls}`;
  }
  // Nth-child fallback
  if (el.parentElement) {
    const idx = Array.prototype.indexOf.call(el.parentElement.children, el) + 1;
    return `${tag}:nth-child(${idx})`;
  }
  return tag;
}

/** Absolute nth-child path from <body>. Backup for when CSS selector breaks. */
export function domPathFor(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur.parentElement && cur.tagName !== "BODY") {
    const idx = Array.prototype.indexOf.call(cur.parentElement.children, cur) + 1;
    parts.unshift(`${cur.tagName.toLowerCase()}:nth-child(${idx})`);
    cur = cur.parentElement;
  }
  parts.unshift("body");
  return parts.join(" > ");
}

function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(s);
  }
  return s.replace(/([!"#$%&'()*+,./:;<=>?@\[\\\]^`{|}~])/g, "\\$1");
}

/**
 * Best-effort human label for the pinned element. Resolved in this priority:
 *   1. `data-quad-label="…"`  (explicit author hint)
 *   2. `aria-label`            (a11y already curated this for screen readers)
 *   3. `data-testid`           (test selectors are usually meaningful)
 *   4. trimmed `textContent`   (button/link text, headings…)
 *   5. `title` / placeholder
 * Walks one ancestor up if the clicked element itself has nothing (e.g.
 * clicking an <svg> inside a labelled <button>).
 */
export function labelFor(el: Element, max = 80): string | undefined {
  let cur: Element | null = el;
  for (let i = 0; i < 2 && cur; i++) {
    const v = readLabelAttrs(cur, max);
    if (v) return v;
    cur = cur.parentElement;
  }
  return undefined;
}

function readLabelAttrs(el: Element, max: number): string | undefined {
  if (el instanceof HTMLElement) {
    const explicit = el.dataset.quadLabel;
    if (explicit) return clip(explicit, max);
  }
  const aria = el.getAttribute("aria-label");
  if (aria && aria.trim()) return clip(aria, max);
  if (el instanceof HTMLElement && el.dataset.testid) {
    return clip(el.dataset.testid, max);
  }
  const tag = el.tagName.toLowerCase();
  if (
    tag === "button" || tag === "a" || tag === "summary" ||
    /^h[1-6]$/.test(tag) || tag === "label"
  ) {
    const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
    if (text) return clip(text, max);
  }
  if (el instanceof HTMLInputElement) {
    if (el.placeholder) return clip(`placeholder “${el.placeholder}”`, max);
    if (el.name) return clip(`input[name=${el.name}]`, max);
  }
  const title = el.getAttribute("title");
  if (title && title.trim()) return clip(title, max);
  return undefined;
}

function clip(s: string, max: number): string {
  s = s.trim();
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

/** outerHTML truncated to a preview. */
export function outerHtmlPreview(el: Element, max = 200): string {
  const html = (el as HTMLElement).outerHTML ?? "";
  return html.length <= max ? html : `${html.slice(0, max)}…`;
}

export function bboxOf(el: Element): { x: number; y: number; w: number; h: number } {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
}

export function timezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}
