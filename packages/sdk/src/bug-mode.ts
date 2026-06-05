/**
 * Pointer picker controller. While armed:
 *  - the host page's cursor switches to a crosshair
 *  - hover draws a temporary outline
 *  - the next click captures that element and keeps a selected outline
 *  - elements inside the SDK's own shadow tree are ignored
 */
import type { Widget } from "./widget";

export type BugModeHandlers = {
  onPin: (el: Element, x: number, y: number) => void;
};

export class BugMode {
  private on = false;
  private hoverOutline: HTMLDivElement | null = null;
  private selectedOutline: HTMLDivElement | null = null;
  private hoverEl: Element | null = null;
  private selectedEl: Element | null = null;
  private rafId: number | null = null;

  constructor(
    private widget: Widget,
    private hostNode: HTMLElement,
    private handlers: BugModeHandlers,
  ) {
    window.addEventListener("scroll", this.schedule, { capture: true, passive: true });
    window.addEventListener("resize", this.schedule, { passive: true });
  }

  destroy(): void {
    this.setOn(false);
    this.clearSelection();
    window.removeEventListener("scroll", this.schedule, true);
    window.removeEventListener("resize", this.schedule);
  }

  setOn(on: boolean): void {
    if (on === this.on) {
      this.widget.setBugMode(on);
      return;
    }
    this.on = on;
    this.widget.setBugMode(on);
    if (on) {
      document.addEventListener("click", this.onClick, true);
      document.addEventListener("mousemove", this.onMouseMove, true);
    } else {
      document.removeEventListener("click", this.onClick, true);
      document.removeEventListener("mousemove", this.onMouseMove, true);
      this.hoverEl = null;
      this.hoverOutline?.remove();
      this.hoverOutline = null;
    }
  }

  isOn(): boolean {
    return this.on;
  }

  private onClick = (e: MouseEvent) => {
    if (!this.on) return;
    const el = this.pickElement(e);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    this.selectedEl = el;
    this.setOn(false);
    this.schedule();
    this.handlers.onPin(el, e.clientX, e.clientY);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.on) return;
    this.hoverEl = this.pickElement(e);
    this.schedule();
  };

  clearSelection(): void {
    this.selectedEl = null;
    this.selectedOutline?.remove();
    this.selectedOutline = null;
  }

  private schedule = (): void => {
    if (!this.on && !this.selectedEl) return;
    if (this.rafId != null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.renderOutlines();
    });
  };

  private renderOutlines(): void {
    this.renderOutline("hover", this.hoverEl, this.on);
    this.renderOutline("selected", this.selectedEl, Boolean(this.selectedEl));
  }

  private renderOutline(kind: "hover" | "selected", el: Element | null, show: boolean): void {
    let outline = kind === "hover" ? this.hoverOutline : this.selectedOutline;
    if (!show || !el) {
      outline?.remove();
      if (kind === "hover") this.hoverOutline = null;
      else this.selectedOutline = null;
      return;
    }
    if (!outline) {
      outline = document.createElement("div");
      outline.className = "q-pointer-outline";
      outline.dataset.kind = kind;
      this.widget.root.appendChild(outline);
      if (kind === "hover") this.hoverOutline = outline;
      else this.selectedOutline = outline;
    }
    const rect = el.getBoundingClientRect();
    outline.style.left = `${rect.left}px`;
    outline.style.top = `${rect.top}px`;
    outline.style.width = `${rect.width}px`;
    outline.style.height = `${rect.height}px`;
  }

  /** Find the element under the cursor while ignoring our own widget. */
  private pickElement(e: MouseEvent): Element | null {
    const path = (e.composedPath?.() ?? []) as EventTarget[];
    for (const node of path) {
      if (!(node instanceof Element)) continue;
      if (this.hostNode.contains(node)) continue;
      return node;
    }
    return null;
  }
}
