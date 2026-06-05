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
  /** Cross-device sync of the caller's own pins. Self-only. */
  async listMyPins(params) {
    const qs = new URLSearchParams();
    if (params.reporterAnon) qs.set("reporter_anon", params.reporterAnon);
    if (params.reporterId) qs.set("reporter_id", params.reporterId);
    if (params.route) qs.set("route", params.route);
    if (params.sinceMs != null) qs.set("since_ms", String(params.sinceMs));
    if (params.limit != null) qs.set("limit", String(params.limit));
    const res = await fetch(this.url(`/api/ingest/pins?${qs.toString()}`), {
      method: "GET",
      headers: {
        "x-quad-key": this.cfg.apiKey,
        "x-quad-sdk-version": this.cfg.version
      },
      mode: "cors",
      credentials: "omit"
    });
    if (!res.ok) throw new Error(`listMyPins ${res.status}`);
    return res.json();
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
  if (k === combo.key) return true;
  return matchesPhysicalKey(combo.key, e.code);
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
function matchesPhysicalKey(key, code) {
  if (/^[a-z]$/.test(key)) return code === `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return code === `Digit${key}`;
  return false;
}

// src/bug-mode.ts
var BugMode = class {
  constructor(widget, hostNode, pinCombo, handlers) {
    this.widget = widget;
    this.hostNode = hostNode;
    this.handlers = handlers;
    this.pinCombo = pinCombo;
  }
  widget;
  hostNode;
  handlers;
  on = false;
  pinCombo;
  destroy() {
    this.setOn(false);
  }
  setOn(on) {
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
  isOn() {
    return this.on;
  }
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
function labelFor(el, max = 80) {
  let cur = el;
  for (let i = 0; i < 2 && cur; i++) {
    const v = readLabelAttrs(cur, max);
    if (v) return v;
    cur = cur.parentElement;
  }
  return void 0;
}
function readLabelAttrs(el, max) {
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
  if (tag === "button" || tag === "a" || tag === "summary" || /^h[1-6]$/.test(tag) || tag === "label") {
    const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
    if (text) return clip(text, max);
  }
  if (el instanceof HTMLInputElement) {
    if (el.placeholder) return clip(`placeholder \u201C${el.placeholder}\u201D`, max);
    if (el.name) return clip(`input[name=${el.name}]`, max);
  }
  const title = el.getAttribute("title");
  if (title && title.trim()) return clip(title, max);
  return void 0;
}
function clip(s, max) {
  s = s.trim();
  return s.length <= max ? s : `${s.slice(0, max)}\u2026`;
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
      max-width: calc(100vw - 32px);
      background: var(--elevated);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 8px 10px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      font-family: ui-monospace, monospace;
      font-size: 13px;
      color: var(--star-300);
      z-index: 2147483604;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    `;
    bar.innerHTML = `
      <span class="dot" style="width:8px;height:8px;border-radius:50%;background:var(--rose);box-shadow:0 0 8px var(--rose);animation:q-pulse 1.4s ease-in-out infinite"></span>
      <span class="t">00:00</span>
      <button class="stop" title="Stop" style="min-height:28px;background:transparent;border:0;color:var(--star-300);cursor:pointer;font-size:14px">\u25A0</button>
      <button class="mute" title="Toggle mic" style="min-height:28px;background:transparent;border:0;color:var(--star-300);cursor:pointer;font-size:14px">\u{1F3A4}</button>
      <button class="pin" title="Pin current element" style="min-height:28px;background:transparent;border:1px solid var(--border);border-radius:999px;color:var(--star-300);cursor:pointer;font-size:13px;padding:3px 8px">Pin</button>
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

// src/local-pins.ts
var KEY = "quad.local_pins.v1";
var MAX = 50;
function read() {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function write(pins) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(pins.slice(-MAX)));
  } catch {
  }
}
function list() {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}
function add(pin) {
  const all = read();
  all.push(pin);
  write(all);
  notify();
}
var VKEY = "quad.local_pins.visible.v1";
function readVisible() {
  if (typeof localStorage === "undefined") return /* @__PURE__ */ new Set();
  try {
    const raw = localStorage.getItem(VKEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
function writeVisible(s) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(VKEY, JSON.stringify([...s]));
  } catch {
  }
}
function isVisible(id) {
  return readVisible().has(id);
}
function setVisible(id, v) {
  const s = readVisible();
  if (v) s.add(id);
  else s.delete(id);
  writeVisible(s);
  notify();
}
function visibleIds() {
  return [...readVisible()];
}
var listeners = /* @__PURE__ */ new Set();
function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
    }
  }
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
    label: labelFor(el),
    body
  };
}

// src/reveal.ts
var RevealLayer = class {
  constructor(shadow) {
    this.shadow = shadow;
    this.unsubLocal = subscribe(() => this.syncActive());
    window.addEventListener("scroll", this.schedule, { capture: true, passive: true });
    window.addEventListener("resize", this.schedule, { passive: true });
    this.syncActive();
  }
  shadow;
  outlines = /* @__PURE__ */ new Map();
  rafId = null;
  mo = null;
  unsubLocal;
  openPopover = null;
  pollId = null;
  active = false;
  destroy() {
    this.unsubLocal();
    window.removeEventListener("scroll", this.schedule, true);
    window.removeEventListener("resize", this.schedule);
    this.deactivate();
    for (const { outline, tag } of this.outlines.values()) {
      outline.remove();
      tag.remove();
    }
    this.outlines.clear();
  }
  /**
   * Attach/detach the expensive observers (MutationObserver, route poll)
   * based on whether the user actually has any pins revealed. Most host
   * pages have zero, so this keeps Quad from interfering with the host's
   * render loop in the common case.
   */
  syncActive() {
    const hasVisible = visibleIds().length > 0;
    if (hasVisible && !this.active) {
      this.active = true;
      this.mo = new MutationObserver(() => this.schedule());
      this.mo.observe(document.body, { childList: true, subtree: true });
      this.pollId = setInterval(() => this.schedule(), 800);
    } else if (!hasVisible && this.active) {
      this.deactivate();
    }
    this.schedule();
  }
  deactivate() {
    this.active = false;
    this.mo?.disconnect();
    this.mo = null;
    if (this.pollId != null) {
      clearInterval(this.pollId);
      this.pollId = null;
    }
  }
  schedule = () => {
    if (this.rafId != null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.render();
    });
  };
  render() {
    const visible = new Set(visibleIds());
    if (visible.size === 0 && this.outlines.size === 0) return;
    const route = location.pathname;
    const pins = list().filter(
      (p) => visible.has(p.id) && p.route === route
    );
    const wanted = new Set(pins.map((p) => p.id));
    for (const [id, { outline, tag }] of this.outlines) {
      if (!wanted.has(id)) {
        outline.remove();
        tag.remove();
        this.outlines.delete(id);
      }
    }
    for (const pin of pins) {
      const el = this.findElement(pin);
      let entry = this.outlines.get(pin.id);
      if (!el) {
        if (entry) {
          entry.outline.style.display = "none";
          entry.tag.style.display = "none";
        }
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (!entry) {
        entry = this.makeOutline(pin);
        this.outlines.set(pin.id, entry);
      }
      const { outline, tag } = entry;
      outline.style.display = "block";
      outline.style.left = `${rect.left}px`;
      outline.style.top = `${rect.top}px`;
      outline.style.width = `${rect.width}px`;
      outline.style.height = `${rect.height}px`;
      tag.style.display = "block";
      const above = rect.top - 26 > 0;
      tag.style.left = `${rect.left}px`;
      tag.style.top = `${above ? rect.top - 26 : rect.bottom + 6}px`;
    }
  }
  findElement(pin) {
    try {
      const a = document.querySelector(pin.selector);
      if (a) return a;
    } catch {
    }
    if (pin.domPath) {
      try {
        const b = document.querySelector(pin.domPath);
        if (b) return b;
      } catch {
      }
    }
    return null;
  }
  makeOutline(pin) {
    const outline = document.createElement("div");
    outline.className = "q-reveal-outline";
    this.shadow.appendChild(outline);
    const tag = document.createElement("div");
    tag.className = "q-reveal-tag";
    tag.style.cursor = "pointer";
    tag.innerHTML = `
      <span class="dot">\u2726</span>
      <span class="body">${escapeHtml(pin.body.slice(0, 60))}</span>
      <button class="x" title="Hide">\xD7</button>
    `;
    const x = tag.querySelector("button.x");
    x?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.closePopover();
      setVisible(pin.id, false);
    });
    tag.addEventListener("click", (e) => {
      e.stopPropagation();
      this.togglePopover(pin, tag);
    });
    this.shadow.appendChild(tag);
    return { outline, tag };
  }
  // ---- click-popover (full body / metadata) -------------------------------
  togglePopover(pin, anchor) {
    if (this.openPopover && this.openPopover.dataset.id === pin.id) {
      this.closePopover();
      return;
    }
    this.closePopover();
    const pop = document.createElement("div");
    pop.className = "q-reveal-popover";
    pop.dataset.id = pin.id;
    pop.innerHTML = `
      <div class="head">
        <span class="who">your report</span>
        <span class="when">${formatAgo(pin.createdAt)}</span>
      </div>
      <p class="body">${escapeHtml(pin.body)}</p>
      <div class="meta">
        ${pin.componentPath ? `<div><span>component</span><code>${escapeHtml(pin.componentPath)}</code></div>` : ""}
        <div><span>selector</span><code>${escapeHtml(pin.selector)}</code></div>
        <div><span>route</span><code>${escapeHtml(pin.route)}</code></div>
      </div>
      <div class="actions">
        <button class="hide">Hide on page</button>
      </div>
    `;
    const rect = anchor.getBoundingClientRect();
    const top = rect.bottom + 8;
    const left = Math.max(8, Math.min(window.innerWidth - 332, rect.left));
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    this.shadow.appendChild(pop);
    this.openPopover = pop;
    pop.querySelector(".hide")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.closePopover();
      setVisible(pin.id, false);
    });
    const onDocClick = (e) => {
      const path = e.composedPath?.() ?? [];
      if (!path.includes(pop) && !path.includes(anchor)) {
        this.closePopover();
        document.removeEventListener("click", onDocClick, true);
      }
    };
    setTimeout(() => document.addEventListener("click", onDocClick, true), 0);
  }
  closePopover() {
    this.openPopover?.remove();
    this.openPopover = null;
  }
};
function formatAgo(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1e3));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
  margin: 14px 0;
  padding: 22px 14px;
  border: 1px dashed var(--border);
  border-radius: 8px;
  text-align: center;
  color: var(--star-500);
  font-size: 14px;
  overflow-wrap: anywhere;
  transition: border 160ms var(--ease), background 160ms var(--ease);
}
.q-panel .drop[data-over="true"] {
  border-color: var(--violet);
  background: rgba(139, 124, 246, 0.06);
  color: var(--star-300);
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
.q-panel input.q-reporter-name,
.q-panel input.q-work-item,
.q-panel input.q-related-work-items,
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
.q-panel input.q-work-item,
.q-panel input.q-related-work-items {
  margin: 0 0 10px;
  min-height: 40px;
}
.q-panel input.q-reporter-name:focus,
.q-panel input.q-work-item:focus,
.q-panel input.q-related-work-items:focus,
.q-panel textarea:focus { border-color: var(--violet); }
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
`
);

// src/widget.ts
var Widget = class {
  constructor(cb, options = {}) {
    this.cb = cb;
    this.options = options;
    this.host = document.createElement("quad-widget");
    this.host.style.cssText = "all: initial; position: static;";
    this.root = this.host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = WIDGET_CSS;
    this.root.appendChild(style);
    this.toggleEl = this.makeToggle();
    this.panelEl = this.makePanel();
    this.bodyEl = this.panelEl.querySelector(".body");
    this.root.appendChild(this.toggleEl);
    this.root.appendChild(this.panelEl);
    document.body.appendChild(this.host);
  }
  cb;
  options;
  host;
  root;
  toggleEl;
  panelEl;
  bodyEl;
  cursorStyle = null;
  pinFormEl = null;
  toastEl = null;
  overlayOpen = false;
  bugModeOn = false;
  destroy() {
    this.setBugMode(false);
    this.host.remove();
  }
  // ---- Right-edge toggle ----------------------------------------------------
  makeToggle() {
    const d = document.createElement("div");
    d.className = "q-toggle";
    d.title = "Quad \u2014 report a bug (Alt+Shift+Q)";
    for (let i = 0; i < 4; i++) {
      const dot = document.createElement("span");
      dot.className = "dot";
      d.appendChild(dot);
    }
    d.addEventListener("click", () => this.cb.onToggleOverlay());
    return d;
  }
  setBugMode(on) {
    if (this.bugModeOn === on) return;
    this.bugModeOn = on;
    this.toggleEl.setAttribute("data-bug-mode", on ? "on" : "off");
    this.setCrosshair(on);
  }
  /**
   * Toggle a global crosshair cursor by injecting / removing a tiny
   * stylesheet at the document head. Figma-style intent: the cursor itself
   * tells the reporter "click anywhere to drop a pin" — no expensive
   * hover preview, no whole-section outline.
   */
  setCrosshair(on) {
    if (on && !this.cursorStyle) {
      const s = document.createElement("style");
      s.setAttribute("data-quad", "cursor");
      s.textContent = "html, body, *, *::before, *::after { cursor: crosshair !important; }";
      document.head.appendChild(s);
      this.cursorStyle = s;
    } else if (!on && this.cursorStyle) {
      this.cursorStyle.remove();
      this.cursorStyle = null;
    }
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
      <p><strong>Send evidence to the work item.</strong> Use this when the discussion should stay in Azure DevOps, but the team needs the exact screen, files, console, network, and environment context.</p>
      <p>To point at a specific element, turn on <strong>Bug Mode</strong> and click it.</p>
      <label class="q-field">
        <span>Reporter</span>
        <input class="q-reporter-name" type="text" autocomplete="name" placeholder="e.g. \uC774\uD559\uC900 TPM" />
      </label>
      <div class="drop" data-over="false">
        Drop a file here or click to select<br/>
        <small>Record with \u2318\u21E75 on macOS, Win+G on Windows, then drop the file here</small>
      </div>
      <input type="file" multiple accept="video/*,audio/*,image/*" style="display:none" />
      ${this.options.azureDevOpsEnabled ? '<input class="q-work-item" type="number" inputmode="numeric" min="1" placeholder="Issue / Work item # (optional)" />' : ""}
      ${this.options.azureDevOpsEnabled ? '<input class="q-related-work-items" type="text" inputmode="numeric" placeholder="Related work items, comma-separated (optional)" />' : ""}
      <textarea placeholder="What went wrong?"></textarea>
      <button class="primary">Submit</button>
      <p class="q-status"></p>
      <section class="q-reports">
        <div class="header">
          <span class="label">Your reports</span>
          <span class="right">
            <button class="show-all" type="button" aria-pressed="false">Show all on this page</button>
            <span class="count"></span>
          </span>
        </div>
        <div class="list"></div>
      </section>
    `;
    p.appendChild(header);
    p.appendChild(body);
    this.wireOverlayBody(body);
    this.syncReporterInput(body);
    this.wireReportsList(body);
    return p;
  }
  syncReporterInput(body) {
    const reporterInput = body.querySelector("input.q-reporter-name");
    if (!reporterInput) return;
    reporterInput.value = this.cb.getReporterName() ?? "";
    reporterInput.addEventListener("change", () => {
      this.cb.onReporterNameChange(reporterInput.value.trim());
    });
    reporterInput.addEventListener("blur", () => {
      this.cb.onReporterNameChange(reporterInput.value.trim());
    });
  }
  // ---- Reports list -------------------------------------------------------
  wireReportsList(body) {
    const section = body.querySelector(".q-reports");
    const countEl = section.querySelector(".count");
    const listEl = section.querySelector(".list");
    const showAllBtn = section.querySelector(".show-all");
    const render = () => {
      const all = list();
      const route = location.pathname;
      const hereOnly = all.filter((p) => p.route === route);
      const elsewhere = all.filter((p) => p.route !== route);
      countEl.textContent = String(all.length);
      const allRevealed = hereOnly.length > 0 && hereOnly.every((p) => isVisible(p.id));
      showAllBtn.setAttribute("aria-pressed", allRevealed ? "true" : "false");
      showAllBtn.textContent = allRevealed ? "Hide all" : "Show all on this page";
      showAllBtn.disabled = hereOnly.length === 0;
      showAllBtn.style.opacity = hereOnly.length === 0 ? "0.4" : "1";
      if (all.length === 0) {
        listEl.innerHTML = `<p class="empty">No reports yet. Pin an element or submit one above.</p>`;
        return;
      }
      const rowHtml = (p, sameRoute) => {
        const visible = isVisible(p.id);
        const eyeLabel = sameRoute ? visible ? "\u25CF" : "\u25CB" : "\u2197";
        const eyeTitle = sameRoute ? visible ? "Hide on page" : "Show on page" : `On ${p.route}`;
        const text = (p.body || "(no comment)").replace(/[<>]/g, "");
        return `
          <div class="item">
            <div class="body">
              <span class="text">${text}</span>
              <span class="meta">${p.selector.slice(0, 40)} \xB7 ${formatAgo2(p.createdAt)}</span>
            </div>
            <button class="eye" data-id="${p.id}" data-same="${sameRoute ? "1" : "0"}"
                    title="${eyeTitle}" aria-pressed="${visible ? "true" : "false"}"
                    ${sameRoute ? "" : 'disabled style="opacity:0.4"'}>
              ${eyeLabel}
            </button>
          </div>
        `;
      };
      listEl.innerHTML = hereOnly.map((p) => rowHtml(p, true)).join("") + elsewhere.map((p) => rowHtml(p, false)).join("");
      listEl.querySelectorAll("button.eye").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          if (btn.dataset.same !== "1") {
            const id2 = btn.dataset.id;
            const pin = list().find((p) => p.id === id2);
            if (pin) {
              setVisible(pin.id, true);
              location.href = pin.pageUrl;
            }
            return;
          }
          const id = btn.dataset.id;
          setVisible(id, !isVisible(id));
        });
      });
    };
    showAllBtn.addEventListener("click", () => {
      const route = location.pathname;
      const here = list().filter((p) => p.route === route);
      const allOn = here.length > 0 && here.every((p) => isVisible(p.id));
      for (const p of here) setVisible(p.id, !allOn);
    });
    render();
    subscribe(render);
  }
  wireOverlayBody(body) {
    const drop = body.querySelector(".drop");
    const fileInput = body.querySelector("input[type=file]");
    const workItemInput = body.querySelector("input.q-work-item");
    const relatedWorkItemsInput = body.querySelector("input.q-related-work-items");
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
      const workItemRaw = workItemInput?.value.trim() ?? "";
      const azureWorkItemId = workItemRaw ? Number.parseInt(workItemRaw, 10) : void 0;
      if (workItemRaw && (!Number.isFinite(azureWorkItemId) || !azureWorkItemId || azureWorkItemId <= 0)) {
        status.textContent = "Issue number must be a positive number";
        status.className = "q-status error";
        return;
      }
      const relatedWorkItemIds = parseWorkItemList(relatedWorkItemsInput?.value ?? "");
      if (relatedWorkItemsInput?.value.trim() && relatedWorkItemIds.length === 0) {
        status.textContent = "Related work items must be positive numbers";
        status.className = "q-status error";
        return;
      }
      btn.disabled = true;
      status.className = "q-status";
      status.textContent = "Sending\u2026";
      try {
        await this.cb.onSubmitOverlay(body2, staged, { azureWorkItemId, relatedWorkItemIds });
        ta.value = "";
        if (workItemInput) workItemInput.value = "";
        if (relatedWorkItemsInput) relatedWorkItemsInput.value = "";
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
  // ---- Floating pin form ----------------------------------------------------
  openPinForm(x, y, selector, cb) {
    this.closePinForm();
    const form = document.createElement("div");
    form.className = "q-pin-form";
    form.innerHTML = `
      <div class="selector">${escapeHtml2(selector)}</div>
      <textarea placeholder="What went wrong here? (Cmd/Ctrl+Enter to submit)"></textarea>
      <div class="actions">
        <button class="ghost" type="button">Cancel</button>
        <button class="submit" type="button">Submit</button>
      </div>
      <div class="status"></div>
    `;
    this.root.appendChild(form);
    this.pinFormEl = form;
    const rect = form.getBoundingClientRect();
    const px = Math.min(x, window.innerWidth - rect.width - 8);
    const py = Math.min(y, window.innerHeight - rect.height - 8);
    form.style.left = `${Math.max(8, px)}px`;
    form.style.top = `${Math.max(8, py)}px`;
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
function escapeHtml2(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function parseWorkItemList(raw) {
  return Array.from(
    new Set(
      raw.split(/[,\s]+/).map((part) => Number.parseInt(part.trim().replace(/^#/, ""), 10)).filter((n) => Number.isFinite(n) && n > 0).map((n) => Math.trunc(n))
    )
  ).slice(0, 12);
}
function formatAgo2(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1e3));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// src/index.ts
var VERSION = "0.0.0";
var ANON_COOKIE = "quad_anon";
var REPORTER_NAME_KEY = "quad.reporter_name.v1";
var QuadApi = class {
  opts = {
    apiKey: "",
    endpoint: ""
  };
  api;
  widget;
  bugMode;
  capture;
  reveal;
  optKey = "Alt";
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
      bugMode: parse(opts.shortcut?.bugMode ?? "alt+shift+b"),
      pin: parse(opts.shortcut?.pin ?? "alt+click"),
      overlay: parse(opts.shortcut?.overlay ?? "alt+shift+q"),
      capture: parse(opts.shortcut?.capture ?? "alt+shift+r"),
      voice: parse(opts.shortcut?.voice ?? "alt+shift+v")
    };
    this.widget = new Widget(
      {
        onToggleOverlay: () => this.toggleOverlay(),
        getReporterName: () => this.reporterName(),
        onReporterNameChange: (name) => this.setReporterName(name),
        onSubmitOverlay: (body, files, options) => this.submitOverlay(body, files, options)
      },
      {
        azureDevOpsEnabled: opts.azureDevOps?.enabled === true
      }
    );
    this.bugMode = new BugMode(this.widget, this.widget.host, shortcuts.pin, {
      onPin: (el, x, y) => this.openPinForm(el, x, y)
    });
    this.optKey = /Mac|iPhone|iPad/i.test(navigator?.platform ?? "") ? "Option" : "Alt";
    this.reveal = new RevealLayer(this.widget.root);
    void this.bootstrapPins();
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
          reporter: this.reporter(),
          reporterAnonKey: this.ensureAnonKey(),
          attachments: input.attachments
        });
        this.widget?.toast(`Capture saved \xB7 ${Math.round(input.durationMs / 1e3)}s`);
      },
      onPin: () => {
        if (!this.bugMode?.isOn()) this.toggleBugMode();
        this.widget?.toast(`${this.optKey}+Click an element to pin it`);
      }
    });
    const onKey = (e) => {
      const shortcut = matchesKey(shortcuts.bugMode, e) || matchesKey(shortcuts.overlay, e) || matchesKey(shortcuts.capture, e) || matchesKey(shortcuts.voice, e);
      if (shortcut && e.repeat) {
        e.preventDefault();
        return;
      }
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
    this.reveal?.destroy();
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
    if (user.name) this.setReporterName(user.name);
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
        reporter: this.reporter(),
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
  /** One-shot on init: fetch this reporter's pins from the server, merge into
   * localStorage (so panel reflects them on a fresh device / private window),
   * then apply the showPins policy. Fail silent — never block boot. */
  async bootstrapPins() {
    if (!this.api) return;
    try {
      const anon = this.ensureAnonKey();
      const res = await this.api.listMyPins({
        reporterAnon: anon,
        reporterId: this.user?.id,
        limit: 50
      });
      const existing = new Set(list().map((p) => p.id));
      for (const p of res.pins) {
        if (existing.has(p.id)) continue;
        if (!p.selector) continue;
        add({
          id: p.id,
          createdAt: new Date(p.createdAt).getTime(),
          route: p.route ?? "/",
          pageUrl: p.pageUrl ?? "",
          selector: p.selector,
          domPath: p.domPath ?? void 0,
          componentPath: p.componentPath ?? void 0,
          body: p.body
        });
      }
    } catch {
    }
    const policy = this.opts.showPins ?? "off";
    if (policy === "off") return;
    const route = location.pathname;
    for (const p of list()) {
      const matches = policy === "self-all" || p.route === route;
      if (matches && !isVisible(p.id)) setVisible(p.id, true);
    }
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
    this.widget?.toast(
      this.bugMode.isOn() ? `Bug Mode ON \u2014 ${this.optKey}+Click to pin` : "Bug Mode OFF"
    );
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
        const result = await this.api.createPin({
          pin,
          meta: this.snapshotMeta(),
          reporter: this.reporter(),
          reporterAnonKey: this.ensureAnonKey()
        });
        add({
          id: result.id,
          createdAt: Date.now(),
          route: pin.route,
          pageUrl: pin.pageUrl,
          selector: pin.selector,
          domPath: pin.domPath,
          componentPath: pin.componentPath,
          body: pin.body
        });
      },
      onCancel: () => {
      }
    });
  }
  async submitOverlay(body, files, options = {}) {
    if (!this.api) throw new Error("Quad: not initialized");
    const attachments = [];
    for (const f of files) {
      const kind = f.type.startsWith("video/") ? "video" : f.type.startsWith("audio/") ? "audio" : "screenshot";
      const up = await this.api.uploadFile(f, kind);
      attachments.push({ ...up, kind });
    }
    const title = body.slice(0, 80) || "(attachment report)";
    const meta = this.snapshotMeta();
    if (options.azureWorkItemId) {
      meta.customContext = {
        ...meta.customContext,
        azureWorkItemId: options.azureWorkItemId
      };
    }
    if (options.relatedWorkItemIds?.length) {
      meta.customContext = {
        ...meta.customContext,
        relatedWorkItemIds: options.relatedWorkItemIds
      };
    }
    await this.api.createSession({
      title,
      body,
      meta,
      reporter: this.reporter(),
      reporterAnonKey: this.ensureAnonKey(),
      attachments
    });
  }
  reporter() {
    const name = this.reporterName();
    if (this.user) return name ? { ...this.user, name } : this.user;
    return name ? { id: this.ensureAnonKey(), name } : void 0;
  }
  reporterName() {
    const explicit = this.user?.name?.trim();
    if (explicit) return explicit;
    try {
      return localStorage.getItem(REPORTER_NAME_KEY)?.trim() || void 0;
    } catch {
      return void 0;
    }
  }
  setReporterName(name) {
    const normalized = name.trim().slice(0, 120);
    if (this.user) this.user = { ...this.user, name: normalized || this.user.name };
    try {
      if (normalized) localStorage.setItem(REPORTER_NAME_KEY, normalized);
      else localStorage.removeItem(REPORTER_NAME_KEY);
    } catch {
    }
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
      customContext: {
        pageUrl: location.href,
        path: location.pathname,
        ...this.context
      }
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

export { quad };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map