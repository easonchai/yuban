// Dev utility: mint a magic link for a learner (default: ADMIN_TG_ID).
// Run: apps/server/node_modules/.bin/tsx scripts/mint-link.mts [tgId]
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();
const learnerId = BigInt(process.argv[2] ?? process.env.ADMIN_TG_ID ?? "0");
const token = randomBytes(24).toString("base64url");
await prisma.webSession.create({
  data: { token, learnerId, expiresAt: new Date(Date.now() + 30 * 864e5) },
});
console.log(`${process.env.WEB_ORIGIN ?? "http://localhost:3000"}/auth/${token}`);
await prisma.$disconnect();
