/**
 * Public types for @quad/sdk. Kept narrow on purpose — anything that grows
 * complex over time lives in internal modules.
 */
type QuadShortcut = string;
type QuadOptions = {
    apiKey: string;
    endpoint?: string;
    user?: {
        id: string;
        email?: string;
        name?: string;
    };
    shortcut?: Partial<{
        bugMode: QuadShortcut;
        pin: QuadShortcut;
        capture: QuadShortcut;
        voice: QuadShortcut;
        overlay: QuadShortcut;
    }>;
    captureConsole?: boolean;
    captureNetwork?: boolean;
    video?: {
        enabled?: boolean;
        maxDurationMs?: number;
    };
    voice?: {
        enabled?: boolean;
    };
    mask?: string[];
    commitSha?: string;
    position?: "right" | "left";
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

export type { QuadOptions as Q };
