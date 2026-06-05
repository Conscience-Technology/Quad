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
:host *,
:host *::before,
:host *::after {
  box-sizing: border-box;
}
:host button,
:host input,
:host textarea {
  font: inherit;
  min-width: 0;
}
:host button {
  min-height: 32px;
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
  width: min(420px, calc(100vw - 16px));
  max-width: 100vw;
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
  min-width: 0;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.q-panel header h1 {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 16px;
  letter-spacing: 0;
  color: var(--star-100);
  overflow-wrap: anywhere;
}
.q-panel header button {
  background: none;
  border: none;
  color: var(--star-500);
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
  padding: 0 6px;
}
.q-panel header button.q-settings-open {
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--star-300);
  font-size: 12px;
  line-height: 1;
  min-height: 30px;
  padding: 6px 9px;
}
.q-panel header button.q-settings-open:hover {
  border-color: var(--violet);
  color: var(--star-100);
}
.q-panel header button:hover { color: var(--star-100); }
.q-panel .body {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 18px;
}
.q-panel .body p {
  margin: 0 0 12px;
  color: var(--star-300);
  font-size: 14px;
  overflow-wrap: anywhere;
}
.q-panel .body small {
  color: var(--star-500);
  display: block;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.45;
}
.q-panel .drop {
  margin: 2px 0 14px;
  padding: 26px 14px;
  border: 1.5px dashed rgba(139, 124, 246, 0.55);
  border-radius: 8px;
  background: rgba(139, 124, 246, 0.08);
  text-align: center;
  color: var(--star-200);
  font-size: 14px;
  overflow-wrap: anywhere;
  transition: border 160ms var(--ease), background 160ms var(--ease);
}
.q-panel .drop[data-over="true"] {
  border-color: var(--violet);
  background: rgba(139, 124, 246, 0.16);
  color: var(--star-100);
}
.q-field {
  display: block;
  margin: 14px 0;
}
.q-field span {
  display: block;
  margin: 0 0 6px;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--star-500);
}
.q-reporter-setup {
  margin: 14px 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
}
.q-azure-pat {
  margin: 14px 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
}
.q-azure-pat-current {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  min-width: 0;
}
.q-azure-pat-current span {
  flex: 0 0 auto;
  color: var(--star-500);
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.q-azure-pat-current strong {
  flex: 1;
  min-width: 0;
  color: var(--star-100);
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.q-azure-pat-current button,
.q-azure-pat-delete {
  flex: 0 0 auto;
  min-height: 34px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--star-300);
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  padding: 6px 10px;
}
.q-azure-pat-current button:hover,
.q-azure-pat-delete:hover {
  border-color: var(--violet);
  color: var(--star-100);
}
.q-azure-pat-delete {
  margin-top: 8px;
  width: 100%;
}
.q-azure-pat-editor {
  display: none;
  margin: 0;
  padding: 12px;
}
.q-azure-pat-status {
  margin: 0;
  padding: 0 12px 10px;
  color: var(--star-500);
  font-size: 12px;
}
.q-azure-pat-status.error { color: var(--rose); }
.q-azure-pat[data-configured="false"] .q-azure-pat-current,
.q-azure-pat[data-editing="true"] .q-azure-pat-current {
  display: none;
}
.q-azure-pat[data-editing="true"] .q-azure-pat-editor {
  display: block;
}
.q-reporter-current {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  min-width: 0;
}
.q-reporter-current span {
  flex: 0 0 auto;
  color: var(--star-500);
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.q-reporter-current strong {
  flex: 1;
  min-width: 0;
  color: var(--star-100);
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.q-reporter-current button,
.q-reporter-row button {
  flex: 0 0 auto;
  min-height: 34px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--star-300);
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  padding: 6px 10px;
}
.q-reporter-current button:hover,
.q-reporter-row button:hover {
  border-color: var(--violet);
  color: var(--star-100);
}
.q-reporter-editor {
  display: none;
  margin: 0;
  padding: 12px;
}
.q-reporter-row {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
}
.q-reporter-row input.q-reporter-name,
.q-reporter-row input.q-azure-pat-input {
  flex: 1;
  min-width: 0;
  margin: 0;
}
.q-reporter-setup[data-empty="true"] .q-reporter-current,
.q-reporter-setup[data-editing="true"] .q-reporter-current {
  display: none;
}
.q-reporter-setup[data-editing="true"] .q-reporter-editor {
  display: block;
}
.q-panel input.q-reporter-name,
.q-panel input.q-azure-pat-input,
.q-panel input.q-user-story-work-item,
.q-panel input.q-task-work-item,
.q-panel input.q-mention-search,
.q-panel textarea {
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--star-100);
  font-family: inherit;
  font-size: 15px;
  line-height: 1.45;
  padding: 10px 12px;
  resize: vertical;
  min-height: 90px;
  outline: none;
}
.q-panel input.q-reporter-name,
.q-panel input.q-azure-pat-input,
.q-panel input.q-user-story-work-item,
.q-panel input.q-task-work-item,
.q-panel input.q-mention-search {
  margin: 0 0 10px;
  min-height: 40px;
}
.q-reporter-row input.q-reporter-name {
  margin: 0;
}
.q-panel input.q-reporter-name:focus,
.q-panel input.q-azure-pat-input:focus,
.q-panel input.q-user-story-work-item:focus,
.q-panel input.q-task-work-item:focus,
.q-panel input.q-mention-search:focus,
.q-panel textarea:focus { border-color: var(--violet); }
.q-mention-box {
  margin: 0 0 10px;
}
.q-mention-selected {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.q-mention-chip {
  border: 1px solid rgba(139, 124, 246, 0.45);
  border-radius: 999px;
  background: rgba(139, 124, 246, 0.12);
  color: var(--star-100);
  cursor: pointer;
  font-size: 12px;
  padding: 4px 8px;
}
.q-settings-modal {
  position: fixed;
  inset: 0;
  z-index: 2147483605;
  display: none;
}
.q-settings-modal[data-open="true"] {
  display: block;
}
.q-settings-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.42);
}
.q-settings-card {
  position: absolute;
  top: 52px;
  left: 18px;
  right: 18px;
  max-height: calc(100vh - 104px);
  overflow-y: auto;
  background: var(--elevated);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5);
  padding: 0 14px 14px;
}
.q-settings-card header {
  padding: 14px 0;
  border-bottom: 1px solid var(--border);
  margin-bottom: 12px;
}
.q-settings-card header h2 {
  margin: 0;
  color: var(--star-100);
  font-size: 15px;
  letter-spacing: 0;
}
.q-settings-card header button {
  background: transparent;
  border: 0;
  color: var(--star-500);
  cursor: pointer;
  font-size: 20px;
}
.q-panel .primary {
  margin-top: 14px;
  width: 100%;
  background: var(--violet);
  color: var(--void);
  border: 0;
  border-radius: 8px;
  padding: 11px 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 160ms var(--ease);
}
.q-panel .primary:disabled { opacity: 0.4; cursor: not-allowed; }
.q-panel .primary:hover:not(:disabled) { opacity: 0.9; }
.q-status {
  margin-top: 10px;
  font-size: 13px;
  color: var(--star-500);
  overflow-wrap: anywhere;
}
.q-status.error { color: var(--rose); }

/* Floating pin form */
.q-pin-form {
  position: fixed;
  z-index: 2147483602;
  background: var(--elevated);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
  width: min(320px, calc(100vw - 16px));
  max-width: calc(100vw - 16px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 0 24px rgba(139, 124, 246, 0.15);
}
.q-pin-form .selector {
  font-family: ui-monospace, monospace;
  font-size: 12px;
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
  border-radius: 8px;
  color: var(--star-100);
  font-family: inherit;
  font-size: 15px;
  line-height: 1.45;
  padding: 8px;
  resize: vertical;
  min-height: 60px;
  outline: none;
}
.q-pin-azure {
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr);
  margin-bottom: 8px;
}
.q-pin-azure input {
  width: 100%;
  min-height: 36px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--star-100);
  font-family: inherit;
  font-size: 13px;
  outline: none;
  padding: 8px;
}
.q-pin-azure input:focus {
  border-color: var(--violet);
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
  border-radius: 8px;
  padding: 9px;
  font-size: 14px;
  cursor: pointer;
}
.q-pin-form button.ghost {
  background: transparent;
  color: var(--star-500);
  border: 1px solid var(--border);
}
.q-pin-form .status {
  font-size: 12px;
  color: var(--star-500);
  margin-top: 8px;
}
.q-pin-form .status.error { color: var(--rose); }

/* Toast for status feedback */
.q-toast {
  position: fixed;
  bottom: 24px;
  right: 16px;
  max-width: min(360px, calc(100vw - 32px));
  background: var(--elevated);
  border: 1px solid var(--border);
  border-left: 2px solid var(--violet);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 14px;
  color: var(--star-300);
  overflow-wrap: anywhere;
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
  gap: 8px;
}
.q-reports .label {
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--star-500);
}
.q-reports .right { display: inline-flex; align-items: center; gap: 8px; }
.q-reports .count {
  font-size: 12px;
  font-family: ui-monospace, monospace;
  color: var(--star-500);
}
.q-reports .show-all {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--star-500);
  padding: 5px 8px;
  font-size: 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: color 120ms var(--ease), border-color 120ms var(--ease), background 120ms var(--ease);
}
.q-reports .show-all:hover:not(:disabled) {
  color: var(--star-100);
  border-color: var(--star-500);
}
.q-reports .show-all[aria-pressed="true"] {
  color: var(--violet);
  border-color: var(--violet);
  background: rgba(139, 124, 246, 0.08);
}
.q-reports .show-all:disabled { cursor: not-allowed; }
.q-reports .empty {
  font-size: 14px;
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
  font-size: 13px;
  color: var(--star-100);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.q-reports .item .meta {
  font-size: 12px;
  font-family: ui-monospace, monospace;
  color: var(--star-500);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.q-reports .item .eye {
  width: 32px;
  height: 32px;
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
  max-width: min(360px, calc(100vw - 16px));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  font-size: 13px;
  color: var(--star-300);
}
.q-reveal-tag .dot { color: var(--violet); font-size: 12px; }
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

/* Reveal popover (click-through to full body + metadata) */
.q-reveal-popover {
  position: fixed;
  z-index: 2147483597;
  width: min(340px, calc(100vw - 16px));
  max-width: calc(100vw - 16px);
  background: var(--elevated);
  border: 1px solid var(--border);
  border-left: 2px solid var(--violet);
  border-radius: 6px;
  padding: 12px 14px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  font-size: 14px;
  color: var(--star-300);
  animation: q-fadein 140ms var(--ease);
}
.q-reveal-popover .head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}
.q-reveal-popover .who {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--violet);
}
.q-reveal-popover .when {
  font-size: 12px;
  font-family: ui-monospace, monospace;
  color: var(--star-500);
}
.q-reveal-popover .body {
  margin: 0 0 10px;
  color: var(--star-100);
  white-space: pre-wrap;
  word-break: break-word;
}
.q-reveal-popover .meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
  font-size: 12px;
}
.q-reveal-popover .meta > div {
  display: flex;
  gap: 6px;
  align-items: baseline;
}
.q-reveal-popover .meta span {
  width: 70px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--star-500);
  flex-shrink: 0;
}
.q-reveal-popover .meta code {
  flex: 1;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  color: var(--star-300);
  word-break: break-all;
  background: var(--void);
  padding: 2px 5px;
  border-radius: 3px;
}
.q-reveal-popover .actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}
.q-reveal-popover .hide {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--star-500);
  padding: 4px 10px;
  font-size: 13px;
  border-radius: 4px;
  cursor: pointer;
  transition: color 120ms var(--ease), border-color 120ms var(--ease);
}
.q-reveal-popover .hide:hover {
  color: var(--star-100);
  border-color: var(--star-500);
}
@media (max-width: 480px) {
  .q-toggle {
    padding: 12px 7px;
  }
  .q-panel {
    width: 100vw;
  }
  .q-panel header,
  .q-panel .body {
    padding-left: 14px;
    padding-right: 14px;
  }
  .q-reports {
    margin-left: -14px;
    margin-right: -14px;
    padding-left: 14px;
    padding-right: 14px;
  }
}
`;
