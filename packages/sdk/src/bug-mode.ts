/**
 * Bug Mode controller. While ON:
 *  - hover over any element in the host page draws an outline + selector label
 *  - Alt/Option+Click captures that element as a pin
 *  - elements inside the SDK's own shadow tree are ignored
 */
import type { Widget } from "./widget";
import { selectorFor } from "./util";
import { probe } from "./react-fiber";
import { type Combo, matchesMouse } from "./shortcuts";

export type BugModeHandlers = {
  onPin: (el: Element, x: number, y: number) => void;
};

export class BugMode {
  private on = false;
  private hovered: Element | null = null;
  private pinCombo: Combo;

  constructor(
    private widget: Widget,
    private hostNode: HTMLElement,
    pinCombo: Combo,
    private handlers: BugModeHandlers,
  ) {
    this.pinCombo = pinCombo;
    // Listeners are attached only while Bug Mode is ON so the host app
    // doesn't pay any mousemove cost when nothing is happening.
  }

  destroy(): void {
    this.setOn(false);
  }

  setOn(on: boolean): void {
    if (on === this.on) {
      this.widget.setBugMode(on);
      return;
    }
    this.on = on;
    this.widget.setBugMode(on);
    if (on) {
      document.addEventListener("mousemove", this.onMove, true);
      document.addEventListener("click", this.onClick, true);
    } else {
      document.removeEventListener("mousemove", this.onMove, true);
      document.removeEventListener("click", this.onClick, true);
      this.hovered = null;
      this.widget.hideOutline();
    }
  }

  isOn(): boolean {
    return this.on;
  }

  private onMove = (e: MouseEvent) => {
    if (!this.on) return;
    const el = this.pickElement(e);
    if (!el || el === this.hovered) return;
    this.hovered = el;
    const reactInfo = probe(el);
    const label = reactInfo.componentPath
      ? `${reactInfo.componentPath.split(" > ").pop()} · ${selectorFor(el).slice(0, 60)}`
      : selectorFor(el).slice(0, 80);
    this.widget.showOutline(el.getBoundingClientRect(), label);
  };

  private onClick = (e: MouseEvent) => {
    if (!this.on) return;
    if (!matchesMouse(this.pinCombo, e, "click")) return;
    const el = this.pickElement(e);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    this.handlers.onPin(el, e.clientX, e.clientY);
  };

  /** Find the element under the cursor while ignoring our own widget. */
  private pickElement(e: MouseEvent): Element | null {
    // composedPath includes shadow-tree ancestors when applicable. We pick the
    // first node that's NOT inside our hostNode.
    const path = (e.composedPath?.() ?? []) as EventTarget[];
    for (const node of path) {
      if (!(node instanceof Element)) continue;
      if (this.hostNode.contains(node)) continue;
      return node;
    }
    return null;
  }
}
