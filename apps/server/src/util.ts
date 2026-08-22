// Small shared helpers with no dependencies.
import path from "node:path";
import { fileURLToPath } from "node:url";

// Repo root resolved from this module's location, never from cwd — `pnpm dev`
// runs with cwd=apps/server. Works from src/ (tsx) and dist/ (built) alike:
// both sit three levels below the root.
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** Telegram boot backlog gate: drop only messages older than 120s at boot. */
export function isStale(msgDate: number | undefined, bootTs: number): boolean {
  return msgDate !== undefined && msgDate < bootTs - 120;
}
