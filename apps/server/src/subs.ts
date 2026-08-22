// Subscription ledger: single-use codes, rolling 30-day passes.
// Renewal extends from max(now, current expiry); a lapse restarts from now.
import type { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { ADMIN_TG_ID } from "./db.js";

export const SUB_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function mintCodeValue(): string {
  return "YB-" + randomBytes(4).toString("hex").toUpperCase();
}

export async function mintCode(prisma: PrismaClient): Promise<string> {
  const code = mintCodeValue();
  await prisma.code.create({ data: { code } });
  return code;
}

export function extendedExpiry(current: Date | null, now: Date): Date {
  const base = current && current > now ? current : now;
  return new Date(base.getTime() + SUB_DAYS * DAY_MS);
}

export async function activate(
  prisma: PrismaClient,
  learnerId: bigint,
  code: string,
  username = "",
  now = new Date(),
): Promise<{ expiry?: Date; error?: string }> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.code.findUnique({ where: { code } });
    if (!row) return { error: "unknown code" };
    // Conditional claim: the WHERE makes the DB the single-use authority, so
    // two concurrent redemptions can't both pass a read-then-write check.
    const claimed = await tx.code.updateMany({
      where: { code, usedBy: null },
      data: { usedBy: learnerId, usedAt: now },
    });
    if (!claimed.count) return { error: "code already used" };

    const learner = await tx.learner.findUnique({ where: { id: learnerId } });
    const expiry = extendedExpiry(learner?.expiry ?? null, now);
    await tx.learner.upsert({
      where: { id: learnerId },
      create: { id: learnerId, username, expiry, nextPingAt: new Date(now.getTime() + 16 * 3600_000) },
      update: { username, expiry },
    });
    return { expiry };
  });
}

export function isActive(learner: { id: bigint; expiry: Date | null } | null, now = new Date()): boolean {
  if (!learner) return false;
  if (ADMIN_TG_ID !== 0n && learner.id === ADMIN_TG_ID) return true;
  return !!learner.expiry && learner.expiry > now;
}

export function daysLeft(expiry: Date | null, now = new Date()): number {
  if (!expiry) return 0;
  return Math.max(0, Math.ceil((expiry.getTime() - now.getTime()) / DAY_MS));
}

/** Chat access: subscribers unlimited, web guests (negative ids) get a trial. */
export function chatGate(
  learner: { id: bigint; expiry: Date | null } | null,
  userMsgCount: number,
  trialLimit = 25,
): "ok" | "trial_over" | "activate" {
  if (isActive(learner)) return "ok";
  if (learner && learner.id < 0n) return userMsgCount < trialLimit ? "ok" : "trial_over";
  return "activate";
}
