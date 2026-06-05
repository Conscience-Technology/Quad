import { Q as QuadOptions } from './types-B5Y0OhNY.js';

type CaptureMode = "screen+mic" | "mic-only";

declare class QuadApi {
    private opts;
    private api?;
    private widget?;
    private bugMode?;
    private capture?;
    private reveal?;
    private optKey;
    private user?;
    private context;
    private consoleRing;
    private networkRing;
    private cleanupFns;
    private installed;
    init(opts: QuadOptions): void;
    close(): void;
    identify(user: {
        id: string;
        email?: string;
        name?: string;
    }): void;
    setContext(ctx: Record<string, unknown>): void;
    open(): void;
    close_(): void;
    /** Async, no-throw report used by host code. */
    report(input: {
        title: string;
        body?: string;
    }): Promise<void>;
    startRecord(opts?: {
        mode?: CaptureMode;
    }): Promise<void>;
    stopRecord(): Promise<void>;
    /** One-shot on init: fetch this reporter's pins from the server, merge into
     * localStorage (so panel reflects them on a fresh device / private window),
     * then apply the showPins policy. Fail silent — never block boot. */
    private bootstrapPins;
    /** Minimal native confirm so we don't ship a custom modal just for this. */
    private askCaptureMode;
    private toggleBugMode;
    private toggleOverlay;
    private openPinForm;
    private submitOverlay;
    private reporter;
    private reporterName;
    private setReporterName;
    private getAzureDevOpsPatStatus;
    private saveAzureDevOpsPat;
    private deleteAzureDevOpsPat;
    private searchAzureDevOpsIdentities;
    private azureContext;
    private savedAzureContext;
    private snapshotMeta;
    /** Stable anon identifier per-browser, stored as a host-app cookie. */
    private ensureAnonKey;
}
declare const quad: QuadApi;

export { QuadOptions, quad };
