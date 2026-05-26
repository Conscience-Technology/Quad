/**
 * Stylesheet for the shadow-DOM widget. Inline `<style>` content so it can be
 * adopted via a single <style> element (avoids inline-style CSP issues).
 * The host page never sees these tokens.
 */
export const WIDGET_CSS = /* css */ `
:host {
  all: initial;
  contain: layout style paint;
  --void: #06070c;
  --bg: #0a0c14;
  --surface: #11141d;
  --elevated: #181c27;
  --border: #1f2433;
  --star-100: #f5f7ff;
  --star-300: #c8cde0;
  --star-500: #8a90a8;
  --violet: #8b7cf6;
  --cyan: #67e8f9;
  --rose: #fb7185;
  --amber: #fbbf24;
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  font-family: ui-sans-serif, system-ui, sans-serif;
  color: var(--star-100);
  font-size: 14px;
  line-height: 1.55;
}

/* Right-edge toggle: 4 dots, the brand mark */
.q-toggle {
  position: fixed;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  background: var(--elevated);
  border-left: 1px solid var(--border);
  padding: 14px 8px;
  border-radius: 6px 0 0 6px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  cursor: pointer;
  z-index: 2147483600;
  transition: box-shadow 200ms var(--ease), background 200ms var(--ease);
}
.q-toggle:hover {
  background: var(--surface);
  box-shadow: 0 0 24px rgba(139, 124, 246, 0.25);
}
.q-toggle .dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--violet);
}
.q-toggle .dot:nth-child(2) { background: var(--cyan); }
.q-toggle .dot:nth-child(4) { background: var(--cyan); }
.q-toggle[data-bug-mode="on"] {
  background: rgba(139, 124, 246, 0.15);
  box-shadow: 0 0 24px rgba(139, 124, 246, 0.4);
}

/* Overlay panel */
.q-panel {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: 380px;
  background: var(--elevated);
  border-left: 1px solid var(--border);
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.4);
  z-index: 2147483601;
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform 200ms var(--ease);
}
.q-panel[data-open="true"] {
  transform: translateX(0);
}
.q-panel header {
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.q-panel header h1 {
  margin: 0;
  font-size: 14px;
  letter-spacing: 0.02em;
  color: var(--star-300);
}
.q-panel header button {
  background: none;
  border: none;
  color: var(--star-500);
  cursor: pointer;
  font-size: 18px;
  padding: 0 4px;
}
.q-panel header button:hover { color: var(--star-100); }
.q-panel .body {
  flex: 1;
  overflow-y: auto;
  padding: 18px;
}
.q-panel .body p {
  margin: 0 0 12px;
  color: var(--star-300);
  font-size: 13px;
}
.q-panel .body small {
  color: var(--star-500);
  font-size: 11px;
}
.q-panel .drop {
  margin: 14px 0;
  padding: 24px 14px;
  border: 1px dashed var(--border);
  border-radius: 6px;
  text-align: center;
  color: var(--star-500);
  font-size: 12px;
  transition: border 160ms var(--ease), background 160ms var(--ease);
}
.q-panel .drop[data-over="true"] {
  border-color: var(--violet);
  background: rgba(139, 124, 246, 0.06);
  color: var(--star-300);
}
.q-panel textarea {
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--star-100);
  font-family: inherit;
  font-size: 13px;
  padding: 10px 12px;
  resize: vertical;
  min-height: 90px;
  outline: none;
}
.q-panel textarea:focus { border-color: var(--violet); }
.q-panel .primary {
  margin-top: 14px;
  width: 100%;
  background: var(--violet);
  color: var(--void);
  border: 0;
  border-radius: 4px;
  padding: 10px;
  font-size: 13px;
  cursor: pointer;
  transition: opacity 160ms var(--ease);
}
.q-panel .primary:disabled { opacity: 0.4; cursor: not-allowed; }
.q-panel .primary:hover:not(:disabled) { opacity: 0.9; }

/* Hover outline (bug mode) */
.q-outline {
  position: fixed;
  pointer-events: none;
  z-index: 2147483599;
  border: 2px solid var(--violet);
  border-radius: 2px;
  box-shadow: 0 0 12px rgba(139, 124, 246, 0.35);
  transition: all 80ms linear;
}
.q-outline-label {
  position: fixed;
  pointer-events: none;
  z-index: 2147483599;
  background: var(--violet);
  color: var(--void);
  padding: 3px 8px;
  font-size: 11px;
  font-family: ui-monospace, monospace;
  border-radius: 2px;
  white-space: nowrap;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Floating pin form */
.q-pin-form {
  position: fixed;
  z-index: 2147483602;
  background: var(--elevated);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 14px;
  width: 280px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 0 24px rgba(139, 124, 246, 0.15);
}
.q-pin-form .selector {
  font-family: ui-monospace, monospace;
  font-size: 10px;
  color: var(--star-500);
  margin-bottom: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.q-pin-form textarea {
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 3px;
  color: var(--star-100);
  font-family: inherit;
  font-size: 13px;
  padding: 8px;
  resize: vertical;
  min-height: 60px;
  outline: none;
}
.q-pin-form textarea:focus { border-color: var(--violet); }
.q-pin-form .actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.q-pin-form button {
  flex: 1;
  background: var(--violet);
  color: var(--void);
  border: 0;
  border-radius: 3px;
  padding: 7px;
  font-size: 12px;
  cursor: pointer;
}
.q-pin-form button.ghost {
  background: transparent;
  color: var(--star-500);
  border: 1px solid var(--border);
}
.q-pin-form .status {
  font-size: 11px;
  color: var(--star-500);
  margin-top: 8px;
}
.q-pin-form .status.error { color: var(--rose); }

/* Toast for status feedback */
.q-toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  background: var(--elevated);
  border: 1px solid var(--border);
  border-left: 2px solid var(--violet);
  border-radius: 4px;
  padding: 10px 14px;
  font-size: 12px;
  color: var(--star-300);
  z-index: 2147483603;
  animation: q-fadein 160ms var(--ease);
}
@keyframes q-fadein {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Reports list inside the overlay panel */
.q-reports {
  border-top: 1px solid var(--border);
  margin: 16px -18px 0;
  padding: 12px 18px 4px;
}
.q-reports .header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.q-reports .label {
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--star-500);
}
.q-reports .count {
  font-size: 10px;
  font-family: ui-monospace, monospace;
  color: var(--star-500);
}
.q-reports .empty {
  font-size: 12px;
  color: var(--star-500);
  padding: 12px 0;
}
.q-reports .item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-top: 1px solid var(--border);
}
.q-reports .item:first-of-type { border-top: 0; }
.q-reports .item .body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.q-reports .item .text {
  font-size: 12px;
  color: var(--star-100);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.q-reports .item .meta {
  font-size: 10px;
  font-family: ui-monospace, monospace;
  color: var(--star-500);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.q-reports .item .eye {
  width: 24px;
  height: 24px;
  border: 0;
  background: transparent;
  color: var(--star-500);
  cursor: pointer;
  border-radius: 4px;
  font-size: 14px;
  transition: color 120ms var(--ease), background 120ms var(--ease);
}
.q-reports .item .eye:hover { background: var(--surface); color: var(--star-100); }
.q-reports .item .eye[aria-pressed="true"] {
  color: var(--violet);
  background: rgba(139, 124, 246, 0.10);
}

/* Reveal layer (pins shown on the host page when toggled visible) */
.q-reveal-outline {
  position: fixed;
  pointer-events: none;
  z-index: 2147483595;
  border: 1.5px dashed var(--violet);
  border-radius: 3px;
  box-shadow: 0 0 12px rgba(139, 124, 246, 0.3);
  background: rgba(139, 124, 246, 0.06);
  transition: all 120ms var(--ease);
}
.q-reveal-tag {
  position: fixed;
  z-index: 2147483596;
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--elevated);
  border: 1px solid var(--border);
  border-left: 2px solid var(--violet);
  border-radius: 4px;
  padding: 3px 6px 3px 8px;
  max-width: 360px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  font-size: 11px;
  color: var(--star-300);
}
.q-reveal-tag .dot { color: var(--violet); font-size: 10px; }
.q-reveal-tag .body {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.q-reveal-tag .x {
  background: none;
  border: 0;
  color: var(--star-500);
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
  line-height: 1;
}
.q-reveal-tag .x:hover { color: var(--star-100); }
`;
