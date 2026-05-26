/**
 * Public types for @quad/sdk. Kept narrow on purpose — anything that grows
 * complex over time lives in internal modules.
 */

export type QuadShortcut = string; // e.g. "mod+shift+b", "alt+click"

export type QuadOptions = {
  apiKey: string;
  endpoint?: string; // defaults to same-origin
  user?: { id: string; email?: string; name?: string };
  shortcut?: Partial<{
    bugMode: QuadShortcut; // default "mod+shift+b"
    pin: QuadShortcut; // default "alt+click"
    capture: QuadShortcut; // default "mod+shift+r"
    voice: QuadShortcut; // default "mod+shift+v"
    overlay: QuadShortcut; // default "mod+shift+q"
  }>;
  captureConsole?: boolean; // default true
  captureNetwork?: boolean; // default true
  video?: { enabled?: boolean; maxDurationMs?: number };
  voice?: { enabled?: boolean };
  mask?: string[]; // CSS selectors to mask in screenshots/recordings
  commitSha?: string; // host app's git commit SHA (for source-map resolution)
  position?: "right" | "left"; // default "right"
  /**
   * Default visibility of your own pins on the host page.
   *  "off"            (default) nothing is drawn until the reporter
   *                   manually toggles a pin from the panel.
   *  "self-on-route"  auto-reveal your pins on the route they belong to.
   *  "self-all"       auto-reveal your pins everywhere (only those on the
   *                   current route can render — others sit dormant).
   */
  showPins?: "off" | "self-on-route" | "self-all";
};

export type ConsoleEntry = {
  tMs: number;
  level: "log" | "info" | "warn" | "error" | "debug";
  message: string;
};

export type NetworkEntry = {
  tMs: number;
  method: string;
  url: string;
  status?: number;
  durationMs?: number;
  bodyPreview?: string;
};

export type PinPayload = {
  selector: string;
  domPath: string;
  componentPath?: string;
  sourceLocation?: {
    file?: string;
    line?: number;
    column?: number;
    function?: string;
  };
  bbox: { x: number; y: number; w: number; h: number };
  route: string;
  pageUrl: string;
  outerHtmlPreview: string;
  body: string;
};

export type ReportMeta = {
  userAgent: string;
  viewport: { w: number; h: number };
  devicePixelRatio: number;
  timezone: string;
  sdkVersion: string;
  commitSha?: string;
  consoleLogs: ConsoleEntry[];
  networkErrors: NetworkEntry[];
  customContext: Record<string, unknown>;
};
