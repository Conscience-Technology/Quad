/**
 * DOM event trail for Capture sessions. Records click / scroll / input /
 * focus / route_change with ms-offset timestamps relative to the session
 * start, plus pin markers added by the user via the floating control bar.
 *
 * Output is fed into the eventual timeline.json on the server (Phase 1g).
 */
import { selectorFor } from "./util";
import { probe } from "./react-fiber";

export type TrailEvent =
  | { tMs: number; kind: "session_start"; url: string; route: string }
  | { tMs: number; kind: "session_end" }
  | {
      tMs: number;
      kind: "click";
      selector: string;
      componentPath?: string;
      sourceLocation?: { file?: string; line?: number };
    }
  | { tMs: number; kind: "scroll"; scrollY: number }
  | { tMs: number; kind: "input"; selector: string; length: number }
  | { tMs: number; kind: "route_change"; from: string; to: string }
  | { tMs: number; kind: "voice_marker"; text: string }
  | { tMs: number; kind: "pin_added"; selector: string; note?: string };

export class EventTrail {
  private events: TrailEvent[] = [];
  private start = 0;
  private detachers: Array<() => void> = [];
  private prevPath = "";

  start_(hostNode: HTMLElement): void {
    this.start = Date.now();
    this.prevPath = location.pathname;
    this.events.push({
      tMs: 0,
      kind: "session_start",
      url: location.href,
      route: location.pathname,
    });

    const onClick = (e: MouseEvent) => {
      if (insideHost(e.target, hostNode)) return;
      const el = e.target instanceof Element ? e.target : null;
      if (!el) return;
      const info = probe(el);
      this.events.push({
        tMs: this.nowMs(),
        kind: "click",
        selector: selectorFor(el),
        componentPath: info.componentPath,
        sourceLocation: info.sourceLocation
          ? { file: info.sourceLocation.file, line: info.sourceLocation.line }
          : undefined,
      });
    };
    document.addEventListener("click", onClick, true);
    this.detachers.push(() => document.removeEventListener("click", onClick, true));

    let scrollPending = false;
    const onScroll = () => {
      if (scrollPending) return;
      scrollPending = true;
      requestAnimationFrame(() => {
        scrollPending = false;
        this.events.push({ tMs: this.nowMs(), kind: "scroll", scrollY: window.scrollY });
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    this.detachers.push(() => window.removeEventListener("scroll", onScroll));

    const onInput = (e: Event) => {
      if (insideHost(e.target, hostNode)) return;
      const el = e.target as HTMLInputElement | HTMLTextAreaElement | null;
      if (!el || el.value == null) return;
      this.events.push({
        tMs: this.nowMs(),
        kind: "input",
        selector: selectorFor(el),
        length: el.value.length,
      });
    };
    document.addEventListener("input", onInput, true);
    this.detachers.push(() => document.removeEventListener("input", onInput, true));

    // Route change (Next.js App Router) — patch history.pushState/replaceState
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    const onPathChange = () => {
      const next = location.pathname;
      if (next !== this.prevPath) {
        this.events.push({
          tMs: this.nowMs(),
          kind: "route_change",
          from: this.prevPath,
          to: next,
        });
        this.prevPath = next;
      }
    };
    history.pushState = function patchedPush(...args: Parameters<History["pushState"]>) {
      const r = origPush.apply(this, args);
      onPathChange();
      return r;
    };
    history.replaceState = function patchedReplace(...args: Parameters<History["replaceState"]>) {
      const r = origReplace.apply(this, args);
      onPathChange();
      return r;
    };
    const onPop = () => onPathChange();
    window.addEventListener("popstate", onPop);
    this.detachers.push(() => {
      history.pushState = origPush;
      history.replaceState = origReplace;
      window.removeEventListener("popstate", onPop);
    });
  }

  pin(selector: string, note?: string): void {
    this.events.push({ tMs: this.nowMs(), kind: "pin_added", selector, note });
  }

  voiceMarker(text: string): void {
    this.events.push({ tMs: this.nowMs(), kind: "voice_marker", text });
  }

  stop(): TrailEvent[] {
    this.events.push({ tMs: this.nowMs(), kind: "session_end" });
    for (const d of this.detachers) {
      try { d(); } catch { /* ignore */ }
    }
    this.detachers = [];
    return this.events;
  }

  durationMs(): number {
    return Date.now() - this.start;
  }

  private nowMs(): number {
    return Date.now() - this.start;
  }
}

function insideHost(target: EventTarget | null, host: HTMLElement): boolean {
  return target instanceof Node && host.contains(target);
}
