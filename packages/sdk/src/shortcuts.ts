/**
 * Minimal shortcut parser. Format: "mod+shift+b", "alt+click".
 * `mod` resolves to Cmd on Mac, Ctrl elsewhere.
 */

export type Combo = {
  alt: boolean;
  shift: boolean;
  ctrl: boolean;
  meta: boolean;
  key: string; // lowercased; for non-key combos: "click", "dblclick"
};

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function parse(combo: string): Combo {
  const parts = combo.toLowerCase().split("+").map((s) => s.trim());
  const out: Combo = { alt: false, shift: false, ctrl: false, meta: false, key: "" };
  for (const p of parts) {
    if (p === "alt" || p === "option") out.alt = true;
    else if (p === "shift") out.shift = true;
    else if (p === "ctrl" || p === "control") out.ctrl = true;
    else if (p === "cmd" || p === "command" || p === "meta") out.meta = true;
    else if (p === "mod") {
      if (IS_MAC) out.meta = true;
      else out.ctrl = true;
    } else {
      out.key = p;
    }
  }
  return out;
}

export function matchesKey(combo: Combo, e: KeyboardEvent): boolean {
  if (!isComboKey(combo)) return false;
  if (combo.alt !== e.altKey) return false;
  if (combo.shift !== e.shiftKey) return false;
  if (combo.ctrl !== e.ctrlKey) return false;
  if (combo.meta !== e.metaKey) return false;
  const k = e.key.toLowerCase();
  return k === combo.key;
}

export function matchesMouse(combo: Combo, e: MouseEvent, kind: "click" | "dblclick" = "click"): boolean {
  if (combo.key !== kind) return false;
  if (combo.alt !== e.altKey) return false;
  if (combo.shift !== e.shiftKey) return false;
  if (combo.ctrl !== e.ctrlKey) return false;
  if (combo.meta !== e.metaKey) return false;
  return true;
}

function isComboKey(c: Combo): boolean {
  return c.key !== "" && c.key !== "click" && c.key !== "dblclick";
}
