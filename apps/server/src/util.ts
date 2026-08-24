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

// ---------- timing as personality ----------
// A person reads before they type, and long messages take longer to write.
// The LLM's own latency already supplies a couple of seconds, so these only
// add the shape: a beat before she starts typing, and per-bubble gaps that
// scale with what the bubble actually says. Direct questions get answered at
// full speed, always. Never make someone wait for help they asked for.

const jitter = (ms: number) => Math.round(ms * (0.75 + Math.random() * 0.5));
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Is the learner waiting on an answer (vs just chatting)? */
export function isDirectAsk(text: string): boolean {
  return /[?？]\s*$/.test(text.trim()) || /how do (i|you) say|what does|translate|怎么说|什么意思/i.test(text);
}

/** Beat before the typing indicator starts: she read it first. */
export function readGapMs(userText: string, now = new Date()): number {
  if (isDirectAsk(userText)) return 0;
  const len = userText.trim().length;
  if (len <= 20) return jitter(500); // a two-word text gets a two-word rhythm
  return jitter(clamp(400 + len * 14, 600, 2600));
}

/** Gap before each bubble after the first: long bubbles take longer to type. */
export function bubbleGapMs(bubble: string): number {
  return jitter(clamp(600 + bubble.length * 22, 700, 3000));
}
