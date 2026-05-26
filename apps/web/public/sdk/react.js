import { useEffect } from 'react';

// src/api.ts
var Api = class {
  constructor(cfg) {
    this.cfg = cfg;
  }
  cfg;
  url(path) {
    const base = this.cfg.endpoint.replace(/\/$/, "");
    return `${base}${path}`;
  }
  headers() {
    return {
      "content-type": "application/json",
      "x-quad-key": this.cfg.apiKey,
      "x-quad-sdk-version": this.cfg.version
    };
  }
  async createPin(input) {
    return this.postJson("/api/ingest/pin", input);
  }
  async createSession(input) {
    return this.postJson("/api/ingest/session", input);
  }
  async presignUpload(input) {
    return this.postJson("/api/ingest/presign", input);
  }
  /** Upload a File or Blob using a previously-acquired presigned POST. */
  async uploadBlob(blob, filename, kind) {
    const mime = blob.type || "application/octet-stream";
    const sign = await this.presignUpload({
      filename,
      contentType: mime,
      sizeBytes: blob.size,
      kind
    });
    const form = new FormData();
    for (const [k, v] of Object.entries(sign.fields)) form.append(k, v);
    form.append("file", blob, filename);
    const res = await fetch(sign.url, { method: "POST", body: form });
    if (!res.ok) {
      throw new Error(`upload failed: ${res.status}`);
    }
    return { key: sign.key, mime, sizeBytes: blob.size };
  }
  /** Convenience wrapper for File inputs (drag/drop, file picker). */
  uploadFile(file, kind) {
    return this.uploadBlob(file, file.name, kind);
  }
  async postJson(path, body) {
    const res = await fetch(this.url(path), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      credentials: "omit",
      mode: "cors"
    });
    if (!res.ok) {
      let detail = "";
      try {
        detail = await res.text();
      } catch {
      }
      throw new Error(`Quad ${path} ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
    }
    return res.json();
  }
};

// src/util.ts
function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}
var Ring = class {
  constructor(max) {
    this.max = max;
  }
  max;
  buf = [];
  push(v) {
    this.buf.push(v);
    if (this.buf.length > this.max) this.buf.shift();
  }
  snapshot() {
    return this.buf.slice();
  }
  clear() {
    this.buf = [];
  }
};
function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
function selectorFor(el) {
  if (el instanceof HTMLElement) {
    const dt = el.dataset.testid ?? el.dataset.qaId ?? el.dataset.cy;
    if (dt) return `[data-testid="${cssEscape(dt)}"]`;
  }
  if (el.id) return `#${cssEscape(el.id)}`;
  const parts = [];
  let cur = el;
  let depth = 0;
  while (cur && depth < 4 && cur.nodeType === 1 && cur.tagName !== "BODY") {
    parts.unshift(localSelector(cur));
    cur = cur.parentElement;
    depth++;
  }
  return parts.join(" > ");
}
function localSelector(el) {
  const tag = el.tagName.toLowerCase();
  if (el.id) return `${tag}#${cssEscape(el.id)}`;
  if (el instanceof HTMLElement) {
    const cls = el.className && typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).map(cssEscape).join(".") : "";
    if (cls) return `${tag}.${cls}`;
  }
  if (el.parentElement) {
    const idx = Array.prototype.indexOf.call(el.parentElement.children, el) + 1;
    return `${tag}:nth-child(${idx})`;
  }
  return tag;
}
function domPathFor(el) {
  const parts = [];
  let cur = el;
  while (cur && cur.parentElement && cur.tagName !== "BODY") {
    const idx = Array.prototype.indexOf.call(cur.parentElement.children, cur) + 1;
    parts.unshift(`${cur.tagName.toLowerCase()}:nth-child(${idx})`);
    cur = cur.parentElement;
  }
  parts.unshift("body");
  return parts.join(" > ");
}
function cssEscape(s) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(s);
  }
  return s.replace(/([!"#$%&'()*+,./:;<=>?@\[\\\]^`{|}~])/g, "\\$1");
}
function outerHtmlPreview(el, max = 200) {
  const html = el.outerHTML ?? "";
  return html.length <= max ? html : `${html.slice(0, max)}\u2026`;
}
function bboxOf(el) {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
}
function timezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

// src/react-fiber.ts
function findFiber(el) {
  const keys = Object.keys(el);
  const fiberKey = keys.find((k) => k.startsWith("__reactFiber$"));
  if (!fiberKey) return null;
  return el[fiberKey] ?? null;
}
function nameOf(t) {
  if (!t) return null;
  if (typeof t === "string") return t;
  if (typeof t === "function") {
    const fn = t;
    return fn.displayName ?? fn.name ?? null;
  }
  if (typeof t === "object") {
    const obj = t;
    if (obj.displayName) return obj.displayName;
    if (obj.render) return obj.render.displayName ?? obj.render.name ?? null;
    if (obj.type) return nameOf(obj.type);
  }
  return null;
}
function probe(el) {
  const fiber = findFiber(el);
  if (!fiber) return {};
  const path = [];
  let firstNamed = null;
  let cur = fiber;
  let depth = 0;
  while (cur && depth < 24) {
    const name = nameOf(cur.elementType ?? cur.type);
    if (name && /^[A-Z]/.test(name)) {
      path.unshift(name);
      if (!firstNamed) firstNamed = cur;
    }
    cur = cur.return ?? null;
    depth++;
  }
  const dbg = firstNamed?._debugSource;
  return {
    componentPath: path.length > 0 ? path.join(" > ") : void 0,
    sourceLocation: dbg ? {
      file: dbg.fileName,
      line: dbg.lineNumber,
      column: dbg.columnNumber,
      function: path[path.length - 1]
    } : path[path.length - 1] ? { function: path[path.length - 1] } : void 0
  };
}

// src/shortcuts.ts
var IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
function parse(combo) {
  const parts = combo.toLowerCase().split("+").map((s) => s.trim());
  const out = { alt: false, shift: false, ctrl: false, meta: false, key: "" };
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
function matchesKey(combo, e) {
  if (!isComboKey(combo)) return false;
  if (combo.alt !== e.altKey) return false;
  if (combo.shift !== e.shiftKey) return false;
  if (combo.ctrl !== e.ctrlKey) return false;
  if (combo.meta !== e.metaKey) return false;
  const k = e.key.toLowerCase();
  return k === combo.key;
}
function matchesMouse(combo, e, kind = "click") {
  if (combo.key !== kind) return false;
  if (combo.alt !== e.altKey) return false;
  if (combo.shift !== e.shiftKey) return false;
  if (combo.ctrl !== e.ctrlKey) return false;
  if (combo.meta !== e.metaKey) return false;
  return true;
}
function isComboKey(c) {
  return c.key !== "" && c.key !== "click" && c.key !== "dblclick";
}

// src/bug-mode.ts
var BugMode = class {
  constructor(widget, hostNode, pinCombo, handlers) {
    this.widget = widget;
    this.hostNode = hostNode;
    this.handlers = handlers;
    this.pinCombo = pinCombo;
    document.addEventListener("mousemove", this.onMove, true);
    document.addEventListener("click", this.onClick, true);
  }
  widget;
  hostNode;
  handlers;
  on = false;
  hovered = null;
  pinCombo;
  destroy() {
    document.removeEventListener("mousemove", this.onMove, true);
    document.removeEventListener("click", this.onClick, true);
  }
  setOn(on) {
    this.on = on;
    this.widget.setBugMode(on);
    if (!on) {
      this.hovered = null;
      this.widget.hideOutline();
    }
  }
  isOn() {
    return this.on;
  }
  onMove = (e) => {
    if (!this.on) return;
    const el = this.pickElement(e);
    if (!el || el === this.hovered) return;
    this.hovered = el;
    const reactInfo = probe(el);
    const label = reactInfo.componentPath ? `${reactInfo.componentPath.split(" > ").pop()} \xB7 ${selectorFor(el).slice(0, 60)}` : selectorFor(el).slice(0, 80);
    this.widget.showOutline(el.getBoundingClientRect(), label);
  };
  onClick = (e) => {
    if (!this.on) return;
    if (!matchesMouse(this.pinCombo, e, "click")) return;
    const el = this.pickElement(e);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    this.handlers.onPin(el, e.clientX, e.clientY);
  };
  /** Find the element under the cursor while ignoring our own widget. */
  pickElement(e) {
    const path = e.composedPath?.() ?? [];
    for (const node of path) {
      if (!(node instanceof Element)) continue;
      if (this.hostNode.contains(node)) continue;
      return node;
    }
    return null;
  }
};

// src/event-trail.ts
var EventTrail = class {
  events = [];
  start = 0;
  detachers = [];
  prevPath = "";
  start_(hostNode) {
    this.start = Date.now();
    this.prevPath = location.pathname;
    this.events.push({
      tMs: 0,
      kind: "session_start",
      url: location.href,
      route: location.pathname
    });
    const onClick = (e) => {
      if (insideHost(e.target, hostNode)) return;
      const el = e.target instanceof Element ? e.target : null;
      if (!el) return;
      const info = probe(el);
      this.events.push({
        tMs: this.nowMs(),
        kind: "click",
        selector: selectorFor(el),
        componentPath: info.componentPath,
        sourceLocation: info.sourceLocation ? { file: info.sourceLocation.file, line: info.sourceLocation.line } : void 0
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
    const onInput = (e) => {
      if (insideHost(e.target, hostNode)) return;
      const el = e.target;
      if (!el || el.value == null) return;
      this.events.push({
        tMs: this.nowMs(),
        kind: "input",
        selector: selectorFor(el),
        length: el.value.length
      });
    };
    document.addEventListener("input", onInput, true);
    this.detachers.push(() => document.removeEventListener("input", onInput, true));
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    const onPathChange = () => {
      const next = location.pathname;
      if (next !== this.prevPath) {
        this.events.push({
          tMs: this.nowMs(),
          kind: "route_change",
          from: this.prevPath,
          to: next
        });
        this.prevPath = next;
      }
    };
    history.pushState = function patchedPush(...args) {
      const r = origPush.apply(this, args);
      onPathChange();
      return r;
    };
    history.replaceState = function patchedReplace(...args) {
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
  pin(selector, note) {
    this.events.push({ tMs: this.nowMs(), kind: "pin_added", selector, note });
  }
  voiceMarker(text) {
    this.events.push({ tMs: this.nowMs(), kind: "voice_marker", text });
  }
  stop() {
    this.events.push({ tMs: this.nowMs(), kind: "session_end" });
    for (const d of this.detachers) {
      try {
        d();
      } catch {
      }
    }
    this.detachers = [];
    return this.events;
  }
  durationMs() {
    return Date.now() - this.start;
  }
  nowMs() {
    return Date.now() - this.start;
  }
};
function insideHost(target, host) {
  return target instanceof Node && host.contains(target);
}

// src/capture.ts
var CaptureSession = class {
  constructor(shadow, hostNode, cb) {
    this.shadow = shadow;
    this.hostNode = hostNode;
    this.cb = cb;
    this.trail = new EventTrail();
  }
  shadow;
  hostNode;
  cb;
  screenStream;
  micStream;
  videoRecorder;
  audioRecorder;
  videoChunks = [];
  audioChunks = [];
  bar;
  elapsedTimer;
  startedAt = 0;
  trail;
  busy = false;
  isActive() {
    return !!this.bar;
  }
  async start(mode) {
    if (this.busy || this.isActive()) return;
    this.busy = true;
    try {
      if (mode === "screen+mic") {
        if (typeof navigator.mediaDevices?.getDisplayMedia !== "function") {
          throw new Error("This browser does not support screen recording (mobile is unsupported)");
        }
        this.screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 24 },
          audio: true
        });
      }
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        this.micStream = void 0;
      }
      if (this.screenStream) {
        this.videoRecorder = new MediaRecorder(this.screenStream, {
          mimeType: pickMime(["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"])
        });
        this.videoRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) this.videoChunks.push(e.data);
        };
        this.videoRecorder.start(1e3);
        const track = this.screenStream.getVideoTracks()[0];
        if (track) track.onended = () => this.stop();
      }
      if (this.micStream) {
        this.audioRecorder = new MediaRecorder(this.micStream, {
          mimeType: pickMime(["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"])
        });
        this.audioRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) this.audioChunks.push(e.data);
        };
        this.audioRecorder.start(1e3);
      }
      this.startedAt = Date.now();
      this.trail.start_(this.hostNode);
      this.mountBar();
    } catch (err) {
      this.cleanup();
      throw err;
    } finally {
      this.busy = false;
    }
  }
  async stop(title) {
    if (!this.isActive()) return;
    const durationMs = Date.now() - this.startedAt;
    const trailJson = JSON.stringify({ events: this.trail.stop(), durationMs });
    const stopRecorder = (r) => new Promise((resolve) => {
      if (!r || r.state === "inactive") return resolve();
      r.onstop = () => resolve();
      r.stop();
    });
    await Promise.all([stopRecorder(this.videoRecorder), stopRecorder(this.audioRecorder)]);
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.removeBar();
    const attachments = [];
    if (this.videoChunks.length > 0) {
      const blob = new Blob(this.videoChunks, { type: this.videoRecorder?.mimeType ?? "video/webm" });
      const up = await this.cb.onUploadVideo(blob);
      attachments.push({ ...up, kind: "video" });
    }
    if (this.audioChunks.length > 0) {
      const blob = new Blob(this.audioChunks, { type: this.audioRecorder?.mimeType ?? "audio/webm" });
      const up = await this.cb.onUploadAudio(blob);
      attachments.push({ ...up, kind: "audio" });
    }
    const trailUpload = await this.cb.onUploadTrail(trailJson);
    await this.cb.onComplete({
      title: title?.trim() || `Capture \xB7 ${(/* @__PURE__ */ new Date()).toLocaleString()}`,
      durationMs,
      attachments,
      trailKey: trailUpload.key
    });
    this.cleanup();
  }
  /** User pressed +Pin: capture current cursor target via the host's bug_mode
   * picker. The actual element selection happens in the SDK index module. */
  pinFromBar(selector) {
    this.trail.pin(selector);
  }
  // ---- floating control bar -------------------------------------------------
  mountBar() {
    const bar = document.createElement("div");
    bar.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      background: var(--elevated);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 8px 14px;
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: ui-monospace, monospace;
      font-size: 12px;
      color: var(--star-300);
      z-index: 2147483604;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    `;
    bar.innerHTML = `
      <span class="dot" style="width:8px;height:8px;border-radius:50%;background:var(--rose);box-shadow:0 0 8px var(--rose);animation:q-pulse 1.4s ease-in-out infinite"></span>
      <span class="t">00:00</span>
      <button class="stop" title="Stop" style="background:transparent;border:0;color:var(--star-300);cursor:pointer;font-size:14px">\u25A0</button>
      <button class="mute" title="Toggle mic" style="background:transparent;border:0;color:var(--star-300);cursor:pointer;font-size:13px">\u{1F3A4}</button>
      <button class="pin" title="Pin current element" style="background:transparent;border:0;color:var(--star-300);cursor:pointer;font-size:13px">+Pin</button>
    `;
    if (!this.shadow.querySelector("style[data-q-pulse]")) {
      const s = document.createElement("style");
      s.setAttribute("data-q-pulse", "1");
      s.textContent = `@keyframes q-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }`;
      this.shadow.appendChild(s);
    }
    this.shadow.appendChild(bar);
    this.bar = bar;
    const tEl = bar.querySelector(".t");
    this.elapsedTimer = window.setInterval(() => {
      tEl.textContent = formatElapsed(Date.now() - this.startedAt);
    }, 500);
    bar.querySelector(".stop").addEventListener("click", () => {
      void this.stop();
    });
    bar.querySelector(".mute").addEventListener("click", (e) => {
      const tracks = this.micStream?.getAudioTracks() ?? [];
      const next = !(tracks[0]?.enabled ?? true);
      tracks.forEach((t) => t.enabled = next);
      e.currentTarget.style.opacity = next ? "1" : "0.4";
    });
    bar.querySelector(".pin").addEventListener("click", () => this.cb.onPin());
  }
  removeBar() {
    if (this.elapsedTimer) window.clearInterval(this.elapsedTimer);
    this.elapsedTimer = void 0;
    this.bar?.remove();
    this.bar = void 0;
  }
  cleanup() {
    this.removeBar();
    this.videoChunks = [];
    this.audioChunks = [];
    this.videoRecorder = void 0;
    this.audioRecorder = void 0;
    this.screenStream = void 0;
    this.micStream = void 0;
  }
};
function pickMime(candidates) {
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return candidates[candidates.length - 1] ?? "video/webm";
}
function formatElapsed(ms) {
  const s = Math.floor(ms / 1e3);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// src/console-tap.ts
var LEVELS = ["log", "info", "warn", "error", "debug"];
function installConsoleTap(ring) {
  const originals = {};
  for (const level of LEVELS) {
    const orig = console[level];
    if (typeof orig !== "function") continue;
    originals[level] = orig;
    console[level] = (...args) => {
      try {
        ring.push({
          tMs: now(),
          level,
          message: args.map((a) => {
            if (a instanceof Error) return `${a.name}: ${a.message}
${a.stack ?? ""}`;
            if (typeof a === "string") return a;
            try {
              return JSON.stringify(a);
            } catch {
              return String(a);
            }
          }).join(" ").slice(0, 4e3)
        });
      } catch {
      }
      orig(...args);
    };
  }
  return () => {
    for (const level of LEVELS) {
      const orig = originals[level];
      if (orig) console[level] = orig;
    }
  };
}

// src/network-tap.ts
function installNetworkTap(ring, ignoreUrlSubstr = []) {
  if (typeof fetch !== "function") return () => {
  };
  const origFetch = window.fetch.bind(window);
  window.fetch = async function patchedFetch(input, init) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const t0 = now();
    if (ignoreUrlSubstr.some((s) => url.includes(s))) {
      return origFetch(input, init);
    }
    try {
      const res = await origFetch(input, init);
      if (res.status >= 400) {
        let preview;
        try {
          const clone = res.clone();
          const text = await clone.text();
          preview = text.slice(0, 500);
        } catch {
        }
        ring.push({
          tMs: t0,
          method,
          url,
          status: res.status,
          durationMs: Math.round(now() - t0),
          bodyPreview: preview
        });
      }
      return res;
    } catch (err) {
      ring.push({
        tMs: t0,
        method,
        url,
        status: 0,
        // network-layer failure
        durationMs: Math.round(now() - t0),
        bodyPreview: err instanceof Error ? err.message : String(err)
      });
      throw err;
    }
  };
  return () => {
    window.fetch = origFetch;
  };
}

// src/pin.ts
function buildPin(el, body) {
  const reactInfo = probe(el);
  return {
    selector: selectorFor(el),
    domPath: domPathFor(el),
    componentPath: reactInfo.componentPath,
    sourceLocation: reactInfo.sourceLocation,
    bbox: bboxOf(el),
    route: location.pathname,
    pageUrl: location.href,
    outerHtmlPreview: outerHtmlPreview(el, 200),
    body
  };
}

// src/styles.ts
var WIDGET_CSS = (
  /* css */
  `
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
`
);

// src/widget.ts
var Widget = class {
  constructor(cb) {
    this.cb = cb;
    this.host = document.createElement("quad-widget");
    this.host.style.cssText = "all: initial; position: static;";
    this.root = this.host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = WIDGET_CSS;
    this.root.appendChild(style);
    this.toggleEl = this.makeToggle();
    this.panelEl = this.makePanel();
    this.bodyEl = this.panelEl.querySelector(".body");
    this.outlineEl = this.makeOutline();
    this.labelEl = this.makeOutlineLabel();
    this.root.appendChild(this.toggleEl);
    this.root.appendChild(this.panelEl);
    document.body.appendChild(this.host);
  }
  cb;
  host;
  root;
  toggleEl;
  panelEl;
  bodyEl;
  outlineEl;
  labelEl;
  pinFormEl = null;
  toastEl = null;
  overlayOpen = false;
  bugModeOn = false;
  destroy() {
    this.host.remove();
  }
  // ---- Right-edge toggle ----------------------------------------------------
  makeToggle() {
    const d = document.createElement("div");
    d.className = "q-toggle";
    d.title = "Quad \u2014 report a bug (Cmd+Shift+Q)";
    for (let i = 0; i < 4; i++) {
      const dot = document.createElement("span");
      dot.className = "dot";
      d.appendChild(dot);
    }
    d.addEventListener("click", () => this.cb.onToggleOverlay());
    return d;
  }
  setBugMode(on) {
    this.bugModeOn = on;
    this.toggleEl.setAttribute("data-bug-mode", on ? "on" : "off");
    if (!on) this.hideOutline();
  }
  // ---- Overlay panel --------------------------------------------------------
  makePanel() {
    const p = document.createElement("div");
    p.className = "q-panel";
    p.setAttribute("data-open", "false");
    const header = document.createElement("header");
    const h1 = document.createElement("h1");
    h1.textContent = "Report a bug";
    const close = document.createElement("button");
    close.textContent = "\xD7";
    close.title = "Close (Esc)";
    close.addEventListener("click", () => this.cb.onToggleOverlay());
    header.appendChild(h1);
    header.appendChild(close);
    const body = document.createElement("div");
    body.className = "body";
    body.innerHTML = `
      <p>To point at a specific element, use <strong>Bug Mode + Option/Alt+Click</strong>.</p>
      <p>This panel is for freeform reports. Drop videos/screenshots below or paste (Cmd+V).</p>
      <div class="drop" data-over="false">
        Drop a file here or click to select<br/>
        <small>Record with Cmd+Shift+5 (Mac) or Win+G (Windows), then drop here</small>
      </div>
      <input type="file" multiple accept="video/*,audio/*,image/*" style="display:none" />
      <textarea placeholder="What went wrong?"></textarea>
      <button class="primary">Submit</button>
      <p class="q-status" style="margin-top:10px; font-size:11px; color:var(--star-500);"></p>
    `;
    p.appendChild(header);
    p.appendChild(body);
    this.wireOverlayBody(body);
    return p;
  }
  wireOverlayBody(body) {
    const drop = body.querySelector(".drop");
    const fileInput = body.querySelector("input[type=file]");
    const ta = body.querySelector("textarea");
    const btn = body.querySelector(".primary");
    const status = body.querySelector(".q-status");
    let staged = [];
    const renderStaged = () => {
      status.textContent = staged.length ? `${staged.length} attached: ${staged.map((f) => f.name).join(", ")}` : "";
    };
    const acceptFiles = (files) => {
      const arr = Array.from(files);
      staged = staged.concat(arr);
      renderStaged();
    };
    drop.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      if (fileInput.files) acceptFiles(fileInput.files);
      fileInput.value = "";
    });
    ["dragenter", "dragover"].forEach(
      (ev) => drop.addEventListener(ev, (e) => {
        e.preventDefault();
        drop.setAttribute("data-over", "true");
      })
    );
    ["dragleave", "drop"].forEach(
      (ev) => drop.addEventListener(ev, (e) => {
        e.preventDefault();
        drop.setAttribute("data-over", "false");
      })
    );
    drop.addEventListener("drop", (e) => {
      const dt = e.dataTransfer;
      if (dt?.files?.length) acceptFiles(dt.files);
    });
    ta.addEventListener("paste", (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files = [];
      for (const it of items) {
        if (it.kind === "file") {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) acceptFiles(files);
    });
    btn.addEventListener("click", async () => {
      const body2 = ta.value.trim();
      if (!body2 && staged.length === 0) {
        status.textContent = "A short description or an attachment is required";
        status.className = "q-status error";
        return;
      }
      btn.disabled = true;
      status.className = "q-status";
      status.textContent = "Sending\u2026";
      try {
        await this.cb.onSubmitOverlay(body2, staged);
        ta.value = "";
        staged = [];
        renderStaged();
        status.textContent = "Sent";
        setTimeout(() => {
          status.textContent = "";
        }, 2e3);
      } catch (err) {
        status.className = "q-status error";
        status.textContent = err instanceof Error ? err.message : "Send failed";
      } finally {
        btn.disabled = false;
      }
    });
  }
  setOverlayOpen(open) {
    this.overlayOpen = open;
    this.panelEl.setAttribute("data-open", open ? "true" : "false");
  }
  isOverlayOpen() {
    return this.overlayOpen;
  }
  // ---- Hover outline --------------------------------------------------------
  makeOutline() {
    const o = document.createElement("div");
    o.className = "q-outline";
    o.style.display = "none";
    this.root.appendChild(o);
    return o;
  }
  makeOutlineLabel() {
    const l = document.createElement("div");
    l.className = "q-outline-label";
    l.style.display = "none";
    this.root.appendChild(l);
    return l;
  }
  showOutline(rect, label) {
    this.outlineEl.style.display = "block";
    this.outlineEl.style.left = `${rect.left}px`;
    this.outlineEl.style.top = `${rect.top}px`;
    this.outlineEl.style.width = `${rect.width}px`;
    this.outlineEl.style.height = `${rect.height}px`;
    this.labelEl.style.display = "block";
    this.labelEl.textContent = label;
    const labelTop = rect.top - 22;
    this.labelEl.style.left = `${rect.left}px`;
    this.labelEl.style.top = `${labelTop < 0 ? rect.bottom + 4 : labelTop}px`;
  }
  hideOutline() {
    this.outlineEl.style.display = "none";
    this.labelEl.style.display = "none";
  }
  // ---- Floating pin form ----------------------------------------------------
  openPinForm(x, y, selector, cb) {
    this.closePinForm();
    const form = document.createElement("div");
    form.className = "q-pin-form";
    form.innerHTML = `
      <div class="selector">${escapeHtml(selector)}</div>
      <textarea placeholder="What went wrong here? (Cmd/Ctrl+Enter to submit)"></textarea>
      <div class="actions">
        <button class="ghost" type="button">Cancel</button>
        <button class="submit" type="button">Submit</button>
      </div>
      <div class="status"></div>
    `;
    const px = Math.min(x, window.innerWidth - 300);
    const py = Math.min(y, window.innerHeight - 200);
    form.style.left = `${Math.max(8, px)}px`;
    form.style.top = `${Math.max(8, py)}px`;
    this.root.appendChild(form);
    this.pinFormEl = form;
    const ta = form.querySelector("textarea");
    const submitBtn = form.querySelector(".submit");
    const cancelBtn = form.querySelector(".ghost");
    const status = form.querySelector(".status");
    ta.focus();
    const doSubmit = async () => {
      const body = ta.value.trim();
      if (!body) {
        status.className = "status error";
        status.textContent = "A comment is required";
        return;
      }
      submitBtn.disabled = true;
      status.className = "status";
      status.textContent = "Sending\u2026";
      try {
        await cb.onSubmit(body);
        this.closePinForm();
        this.toast("Pin saved");
      } catch (err) {
        status.className = "status error";
        status.textContent = err instanceof Error ? err.message : "Send failed";
        submitBtn.disabled = false;
      }
    };
    submitBtn.addEventListener("click", doSubmit);
    cancelBtn.addEventListener("click", () => {
      this.closePinForm();
      cb.onCancel();
    });
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void doSubmit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.closePinForm();
        cb.onCancel();
      }
    });
  }
  closePinForm() {
    this.pinFormEl?.remove();
    this.pinFormEl = null;
  }
  // ---- Toast ----------------------------------------------------------------
  toast(text, ttlMs = 2200) {
    this.toastEl?.remove();
    const t = document.createElement("div");
    t.className = "q-toast";
    t.textContent = text;
    this.root.appendChild(t);
    this.toastEl = t;
    setTimeout(() => {
      if (this.toastEl === t) {
        t.remove();
        this.toastEl = null;
      }
    }, ttlMs);
  }
};
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// src/index.ts
var VERSION = "0.0.0";
var ANON_COOKIE = "quad_anon";
var QuadApi = class {
  opts = {
    apiKey: "",
    endpoint: ""
  };
  api;
  widget;
  bugMode;
  capture;
  user;
  context = {};
  consoleRing = new Ring(50);
  networkRing = new Ring(20);
  cleanupFns = [];
  installed = false;
  init(opts) {
    if (!isBrowser() || this.installed) return;
    this.opts = { endpoint: "", ...opts };
    this.user = opts.user;
    this.api = new Api({
      apiKey: opts.apiKey,
      endpoint: opts.endpoint ?? "",
      version: VERSION
    });
    if (opts.captureConsole !== false) {
      this.cleanupFns.push(installConsoleTap(this.consoleRing));
    }
    if (opts.captureNetwork !== false) {
      this.cleanupFns.push(
        installNetworkTap(this.networkRing, ["/api/ingest/", "/api/trpc"])
      );
    }
    const shortcuts = {
      bugMode: parse(opts.shortcut?.bugMode ?? "mod+shift+b"),
      pin: parse(opts.shortcut?.pin ?? "alt+click"),
      overlay: parse(opts.shortcut?.overlay ?? "mod+shift+q"),
      capture: parse(opts.shortcut?.capture ?? "mod+shift+r"),
      voice: parse(opts.shortcut?.voice ?? "mod+shift+v")
    };
    this.widget = new Widget({
      onToggleOverlay: () => this.toggleOverlay(),
      onSubmitOverlay: (body, files) => this.submitOverlay(body, files)
    });
    this.bugMode = new BugMode(this.widget, this.widget.host, shortcuts.pin, {
      onPin: (el, x, y) => this.openPinForm(el, x, y)
    });
    this.capture = new CaptureSession(this.widget.root, this.widget.host, {
      onUploadVideo: (b) => this.api.uploadBlob(b, `capture-${Date.now()}.webm`, "video"),
      onUploadAudio: (b) => this.api.uploadBlob(b, `voice-${Date.now()}.webm`, "audio"),
      onUploadTrail: (json) => this.api.uploadBlob(
        new Blob([json], { type: "application/json" }),
        `trail-${Date.now()}.json`,
        "screenshot"
        // trail.json uses the screenshot kind for storage; preprocessor distinguishes by mime
      ),
      onComplete: async (input) => {
        await this.api.createSession({
          title: input.title,
          body: "(Capture session)",
          meta: this.snapshotMeta(),
          reporter: this.user,
          reporterAnonKey: this.ensureAnonKey(),
          attachments: input.attachments
        });
        this.widget?.toast(`Capture saved \xB7 ${Math.round(input.durationMs / 1e3)}s`);
      },
      onPin: () => {
        if (!this.bugMode?.isOn()) this.toggleBugMode();
        this.widget?.toast("Option+Click an element to pin it");
      }
    });
    const onKey = (e) => {
      if (matchesKey(shortcuts.bugMode, e)) {
        e.preventDefault();
        this.toggleBugMode();
      } else if (matchesKey(shortcuts.overlay, e)) {
        e.preventDefault();
        this.toggleOverlay();
      } else if (matchesKey(shortcuts.capture, e)) {
        e.preventDefault();
        if (this.capture?.isActive()) {
          void this.capture.stop();
        } else {
          this.askCaptureMode().then((mode) => {
            if (mode) void this.startRecord({ mode });
          });
        }
      } else if (matchesKey(shortcuts.voice, e)) {
        e.preventDefault();
        if (this.capture?.isActive()) {
          void this.capture.stop();
        } else {
          void this.startRecord({ mode: "mic-only" });
        }
      } else if (e.key === "Escape") {
        if (this.capture?.isActive()) void this.capture.stop();
        else if (this.bugMode?.isOn()) this.toggleBugMode();
        else if (this.widget?.isOverlayOpen()) this.toggleOverlay();
      }
    };
    document.addEventListener("keydown", onKey, true);
    this.cleanupFns.push(() => document.removeEventListener("keydown", onKey, true));
    this.installed = true;
  }
  close() {
    this.bugMode?.destroy();
    this.widget?.destroy();
    for (const fn of this.cleanupFns) {
      try {
        fn();
      } catch {
      }
    }
    this.cleanupFns = [];
    this.installed = false;
  }
  identify(user) {
    this.user = user;
  }
  setContext(ctx) {
    this.context = { ...this.context, ...ctx };
  }
  open() {
    if (!this.widget) return;
    if (!this.widget.isOverlayOpen()) this.widget.setOverlayOpen(true);
  }
  close_() {
    if (this.widget?.isOverlayOpen()) this.widget.setOverlayOpen(false);
  }
  /** Async, no-throw report used by host code. */
  async report(input) {
    if (!this.api) return;
    try {
      await this.api.createSession({
        title: input.title,
        body: input.body ?? "",
        meta: this.snapshotMeta(),
        reporter: this.user,
        reporterAnonKey: this.ensureAnonKey()
      });
    } catch (err) {
      if (typeof console !== "undefined") {
        console.warn("[quad] report failed:", err);
      }
    }
  }
  // ---- Capture session ------------------------------------------------------
  async startRecord(opts = {}) {
    if (!this.capture) return;
    const mode = opts.mode ?? "screen+mic";
    try {
      await this.capture.start(mode);
      this.widget?.toast(mode === "screen+mic" ? "Recording + STT started" : "Voice recording started");
    } catch (err) {
      this.widget?.toast(err instanceof Error ? err.message : "Failed to start recording");
    }
  }
  async stopRecord() {
    if (!this.capture?.isActive()) return;
    await this.capture.stop();
  }
  /** Minimal native confirm so we don't ship a custom modal just for this. */
  async askCaptureMode() {
    if (typeof confirm === "function") {
      return confirm("Record screen + voice? Cancel records voice only.") ? "screen+mic" : "mic-only";
    }
    return "screen+mic";
  }
  // ---- Internal -------------------------------------------------------------
  toggleBugMode() {
    if (!this.bugMode) return;
    this.bugMode.setOn(!this.bugMode.isOn());
    this.widget?.toast(this.bugMode.isOn() ? "Bug Mode ON \u2014 Option+Click to pin" : "Bug Mode OFF");
  }
  toggleOverlay() {
    if (!this.widget) return;
    this.widget.setOverlayOpen(!this.widget.isOverlayOpen());
  }
  openPinForm(el, x, y) {
    if (!this.widget) return;
    this.widget.openPinForm(x, y, selectorFor(el), {
      onSubmit: async (body) => {
        if (!this.api) return;
        const pin = buildPin(el, body);
        await this.api.createPin({
          pin,
          meta: this.snapshotMeta(),
          reporter: this.user,
          reporterAnonKey: this.ensureAnonKey()
        });
      },
      onCancel: () => {
      }
    });
  }
  async submitOverlay(body, files) {
    if (!this.api) throw new Error("Quad: not initialized");
    const attachments = [];
    for (const f of files) {
      const kind = f.type.startsWith("video/") ? "video" : f.type.startsWith("audio/") ? "audio" : "screenshot";
      const up = await this.api.uploadFile(f, kind);
      attachments.push({ ...up, kind });
    }
    const title = body.slice(0, 80) || "(attachment report)";
    await this.api.createSession({
      title,
      body,
      meta: this.snapshotMeta(),
      reporter: this.user,
      reporterAnonKey: this.ensureAnonKey(),
      attachments
    });
  }
  snapshotMeta() {
    return {
      userAgent: navigator.userAgent,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio || 1,
      timezone: timezone(),
      sdkVersion: VERSION,
      commitSha: this.opts.commitSha,
      consoleLogs: this.consoleRing.snapshot(),
      networkErrors: this.networkRing.snapshot(),
      customContext: this.context
    };
  }
  /** Stable anon identifier per-browser, stored as a host-app cookie. */
  ensureAnonKey() {
    if (typeof document === "undefined") return "";
    const match = document.cookie.match(/(?:^|; )quad_anon=([^;]+)/);
    if (match?.[1]) return decodeURIComponent(match[1]);
    const key = `anon_${cryptoRandom(16)}`;
    const oneYear = 60 * 60 * 24 * 365;
    document.cookie = `${ANON_COOKIE}=${encodeURIComponent(key)}; path=/; max-age=${oneYear}; samesite=lax`;
    return key;
  }
};
function cryptoRandom(bytes) {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}
var quad = new QuadApi();

// src/react.tsx
function QuadProvider({ children, ...opts }) {
  useEffect(() => {
    quad.init(opts);
    return () => quad.close();
  }, []);
  return /* @__PURE__ */ React.createElement(React.Fragment, null, children);
}

export { QuadProvider };
//# sourceMappingURL=react.js.map
//# sourceMappingURL=react.js.map