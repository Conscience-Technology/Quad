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
};

export type { QuadOptions as Q };
