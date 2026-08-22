// Magic-link auth: bot mints a single-use link; consuming it turns the token
// into a 30-day cookie session. No passwords, no email.
import type { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

const SESSION_DAYS = 30;

export async function createMagicLink(prisma: PrismaClient, learnerId: bigint): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await prisma.webSession.create({
    data: {
      token,
      learnerId,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 3600_000),
    },
  });
  return token;
}

/** Consume a magic link. Returns the learnerId once; second visit fails. */
export async function consumeMagicLink(prisma: PrismaClient, token: string): Promise<bigint | null> {
  const row = await prisma.webSession.findUnique({ where: { token } });
  if (!row || !row.learnerId || row.expiresAt < new Date()) return null;
  // Conditional claim: the WHERE is the single-use authority under concurrency.
  const claimed = await prisma.webSession.updateMany({
    where: { token, consumed: false },
    data: { consumed: true },
  });
  return claimed.count ? row.learnerId : null;
}

/** Resolve a cookie session (a consumed, unexpired, learner-bound token). */
export async function sessionLearner(prisma: PrismaClient, token: string | undefined): Promise<bigint | null> {
  if (!token) return null;
  const row = await prisma.webSession.findUnique({ where: { token } });
  if (!row || !row.consumed || !row.learnerId || row.expiresAt < new Date()) return null;
  return row.learnerId;
}

/**
 * Bot /start claiming a web link session. Plain sessions (learnerId null)
 * bind to the Telegram id; guest-carrying sessions (negative learnerId)
 * MERGE the guest into the Telegram account: vocab deduped (existing
 * Telegram rows win), messages re-parented, best streak kept, guest deleted.
 */
export async function claimLinkSession(
  prisma: PrismaClient,
  token: string,
  tgId: bigint,
): Promise<"linked" | "merged" | "invalid"> {
  const row = await prisma.webSession.findUnique({ where: { token } });
  if (!row || row.consumed || row.expiresAt < new Date()) return "invalid";
  const thirtyDays = new Date(Date.now() + 30 * 864e5);

  if (row.learnerId === null) {
    const claimed = await prisma.webSession.updateMany({
      where: { token, consumed: false, learnerId: null },
      data: { learnerId: tgId, consumed: true, expiresAt: thirtyDays },
    });
    return claimed.count ? "linked" : "invalid";
  }

  if (row.learnerId < 0n) {
    const guestId = row.learnerId;
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.webSession.updateMany({
        where: { token, consumed: false },
        data: { learnerId: tgId, consumed: true, expiresAt: thirtyDays },
      });
      if (!claimed.count) return "invalid" as const;
      const guest = await tx.learner.findUnique({ where: { id: guestId } });
      if (!guest) return "linked" as const;
      const guestVocab = await tx.vocab.findMany({ where: { learnerId: guestId } });
      for (const v of guestVocab) {
        await tx.vocab.upsert({
          where: { learnerId_word: { learnerId: tgId, word: v.word } },
          create: {
            learnerId: tgId, word: v.word, pinyin: v.pinyin, gloss: v.gloss,
            context: v.context, strength: v.strength, introduced: v.introduced, lastSeen: v.lastSeen,
          },
          update: {},
        });
      }
      await tx.message.updateMany({ where: { learnerId: guestId }, data: { learnerId: tgId } });
      const tg = await tx.learner.findUnique({ where: { id: tgId } });
      if (tg && guest.streak > tg.streak) {
        await tx.learner.update({
          where: { id: tgId },
          data: { streak: guest.streak, lastActive: guest.lastActive },
        });
      }
      await tx.learner.delete({ where: { id: guestId } }); // cascades leftover guest sessions
      return "merged" as const;
    });
  }

  return "invalid";
}
