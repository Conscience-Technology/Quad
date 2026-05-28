/**
 * Bug Mode controller. While ON:
 *  - the host page's cursor switches to a crosshair (Figma-style intent)
 *  - any element click captures that element as a pin
 *  - elements inside the SDK's own shadow tree are ignored
 *
 * No hover preview, no mousemove listener, no React-fiber probe on hover.
 * All of those happen lazily on click so the host page stays as fast as
 * if Quad weren't installed.
 */
import type { Widget } from "./widget";
import { type Combo, matchesMouse } from "./shortcuts";

export type BugModeHandlers = {
  onPin: (el: Element, x: number, y: number) => void;
};

export class BugMode {
  private on = false;
  private pinCombo: Combo;

  constructor(
    private widget: Widget,
    private hostNode: HTMLElement,
    pinCombo: Combo,
    private handlers: BugModeHandlers,
  ) {
    this.pinCombo = pinCombo;
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
      document.addEventListener("click", this.onClick, true);
    } else {
      document.removeEventListener("click", this.onClick, true);
    }
  }

  isOn(): boolean {
    return this.on;
  }

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
    const path = (e.composedPath?.() ?? []) as EventTarget[];
    for (const node of path) {
      if (!(node instanceof Element)) continue;
      if (this.hostNode.contains(node)) continue;
      return node;
    }
    return null;
  }
}
