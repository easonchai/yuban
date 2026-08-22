import { prisma } from "./db.js";
import { api } from "./api.js";
import { startBot, startPingScheduler } from "./bot.js";

const PORT = Number(process.env.PORT ?? 8400);

for (const v of ["TELEGRAM_BOT_TOKEN", "DEEPSEEK_API_KEY", "DATABASE_URL"]) {
  if (!process.env[v]) {
    console.error(`missing env: ${v}`);
    process.exit(1);
  }
}

await prisma.$connect();
await startBot();
startPingScheduler();
api.listen(PORT, () => console.log(`[api] listening :${PORT}`));
