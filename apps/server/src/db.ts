import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export const ADMIN_TG_ID = BigInt(process.env.ADMIN_TG_ID ?? "0");
