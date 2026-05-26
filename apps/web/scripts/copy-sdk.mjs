#!/usr/bin/env node
/**
 * Copies the built @quad/sdk bundle into apps/web/public/sdk so the
 * dashboard serves it directly. Host apps can <script src="…/sdk/quad.js">
 * without ever touching npm. Runs as a pre-build / pre-dev hook.
 */
import { existsSync, mkdirSync, copyFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const sdkDist = resolve(repoRoot, "packages/sdk/dist");
const target = resolve(here, "../public/sdk");

// Build the SDK if dist is missing or stale.
if (!existsSync(sdkDist) || readdirSync(sdkDist).length === 0) {
  console.log("[copy-sdk] building @quad/sdk first…");
  execSync("pnpm --filter @quad/sdk build", { stdio: "inherit", cwd: repoRoot });
}

// Wipe + recreate target so removed files don't linger.
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

let count = 0;
for (const name of readdirSync(sdkDist)) {
  const src = join(sdkDist, name);
  if (!statSync(src).isFile()) continue;
  copyFileSync(src, join(target, name));
  count++;
}
console.log(`[copy-sdk] copied ${count} file(s) → apps/web/public/sdk/`);
