// Telegram bot (grammY): the relationship surface. Ports every proven
// behavior from the Python prototype — typing loops, per-chat ordering,
// bubbles, /speak, /review flashcards, pings with nudges.
import { Bot, InputFile } from "grammy";
import type { Vocab } from "@prisma/client";
import { prisma, ADMIN_TG_ID } from "./db.js";
import { tutorReply, PROFILE_TEMPLATE, getEngine, setEngine } from "./tutor.js";
import { extractMandarin, renderHtml, splitBubbles } from "./mandarin.js";
import { isDue, gradeStrength, type Grade } from "./srs.js";
import { mintCode, activate, isActive, daysLeft } from "./subs.js";
import { createMagicLink, claimLinkSession } from "./auth.js";
import { tts } from "./tts.js";
import { transcribe, sttAvailable } from "./stt.js";
import { isStale } from "./util.js";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const TZ_OFFSET_MIN = Number(process.env.TZ_OFFSET_MIN ?? 480);
const DEFAULT_PINGS = Number(process.env.PINGS_PER_DAY ?? 2);
const WAKE_START = 9, WAKE_END = 22;

export const bot = new Bot(TOKEN);

// Without this, ONE unhandled handler error stops polling for good (grammY
// default) — happened live 2026-08-22 via an invalid inline-button URL.
bot.catch((err) => console.error("[bot]", err.error ?? err));

// Boot backlog gate: process messages from the last 120s (a restart shouldn't
// eat a message sent seconds earlier), drop older ones. Callbacks have no
// .date and always pass.
let bootTs = Math.floor(Date.now() / 1000);
bot.use(async (ctx, next) => {
  if (isStale(ctx.message?.date ?? ctx.editedMessage?.date, bootTs)) return;
  await next();
});

const PAY_PROMPT =
  "你好! I'm 语伴 — your Mandarin tutor-friend. Access is $20 for 30 days.\n\n" +
  "1. Get an activation code from Eason\n2. Send me: /activate YB-XXXXXXXX\n\n" +
  "Renewing later extends from whatever time you have left.";

const HELP =
  "/activate CODE — redeem a 30-day access code\n" +
  "/status — days remaining\n" +
  "/mode casual|study — study mode scaffolds every Mandarin sentence\n" +
  "/pings off|1-5 — daily check-in frequency\n" +
  "/speak — voice notes of the Mandarin in my last message\n" +
  "/review — flashcard review of your due words (tap to grade)\n" +
  "/app — open your practice app (flashcards, tone trainer, listening)\n" +
  "/help — this message\n\n" +
  'Otherwise just talk to me — text or voice notes both work. Say "speak ' +
  'more Chinese" or "less Chinese" anytime, or "translate: ..." for a full breakdown.';

// ---------- helpers ----------

async function ensureLearner(id: bigint, username = "") {
  return prisma.learner.upsert({
    where: { id },
    create: { id, username, profileMd: PROFILE_TEMPLATE, pingsPerDay: DEFAULT_PINGS },
    update: username ? { username } : {},
  });
}

async function send(chatId: number | bigint, text: string) {
  for (let i = 0; i < text.length; i += 4000) {
    const chunk = text.slice(i, i + 4000);
    try {
      await bot.api.sendMessage(Number(chatId), renderHtml(chunk), { parse_mode: "HTML" });
    } catch {
      await bot.api.sendMessage(Number(chatId), chunk); // HTML parse fallback
    }
  }
}

async function sendBubbles(chatId: number | bigint, text: string) {
  const parts = splitBubbles(text);
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      await bot.api.sendChatAction(Number(chatId), "typing").catch(() => {});
      await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1400));
    }
    await send(chatId, parts[i]);
  }
}

/** Keep the typing indicator alive until the returned stop() is called. */
function typingWhile(chatId: number | bigint): () => void {
  let stopped = false;
  const tick = async () => {
    while (!stopped) {
      await bot.api.sendChatAction(Number(chatId), "typing").catch(() => {});
      await new Promise((r) => setTimeout(r, 4000));
    }
  };
  void tick();
  return () => { stopped = true; };
}

// Per-chat ordering: one slow message never blocks other chats, but a chat's
// own messages process in order.
const chains = new Map<string, Promise<void>>();
function enqueue(chatId: number, fn: () => Promise<void>) {
  const key = String(chatId);
  const prev = chains.get(key) ?? Promise.resolve();
  const nextP = prev.then(fn).catch((e) => console.error("[worker]", chatId, e));
  chains.set(key, nextP);
}

async function converse(chatId: number, learnerId: bigint, text: string) {
  const stop = typingWhile(chatId);
  try {
    const reply = await tutorReply(learnerId, text);
    if (reply && reply !== "…") await sendBubbles(chatId, reply);
    else await send(chatId, "嗯？我走神了, say that again?");
  } catch (e) {
    console.error("[tutor]", learnerId, e);
    await send(chatId, "网络卡了一下, say that again?");
  } finally {
    stop();
  }
}

// ---------- flashcards ----------

const reviews = new Map<string, Vocab[]>();

const GRADE_KB = {
  inline_keyboard: [[
    { text: "😵 Again", callback_data: "rev|g|1" },
    { text: "😬 Hard", callback_data: "rev|g|2" },
    { text: "🙂 Good", callback_data: "rev|g|3" },
    { text: "😎 Easy", callback_data: "rev|g|4" },
  ]],
};

async function sendCard(chatId: number, learnerId: bigint) {
  const q = reviews.get(String(learnerId)) ?? [];
  if (!q.length) {
    await bot.api.sendMessage(chatId, "✅ Review done. 不错!");
    return;
  }
  await bot.api.sendMessage(chatId, `🃏 ${q.length} to go — how do you say:\n\n${q[0].gloss}`, {
    reply_markup: { inline_keyboard: [[{ text: "Show answer", callback_data: "rev|show" }]] },
  });
}

// ---------- commands ----------

bot.command("start", async (ctx) => {
  const id = BigInt(ctx.from!.id);
  const learner = await ensureLearner(id, ctx.from?.username ?? "");
  // Web-first linking: the site sends people here via t.me/<bot>?start=link-<token>
  const payload = (ctx.match ?? "").trim();
  if (payload.startsWith("link-")) {
    const result = await claimLinkSession(prisma, payload.slice(5), id);
    if (result === "merged") {
      await send(ctx.chat.id, "搞定! Browser connected and your web progress (words, chats, streak) moved over here too. One account now, use whichever door you like.");
    } else if (result === "linked") {
      await send(ctx.chat.id, "搞定! Your browser is now connected. Head back to it, then come talk to me here anytime.");
    } else {
      await send(ctx.chat.id, "That connect link expired or was already used. Get a fresh one from the website.");
    }
  }
  if (isActive(learner)) {
    if (!payload) await send(ctx.chat.id, "你回来了! What are we working on today?");
  } else await send(ctx.chat.id, PAY_PROMPT);
});

bot.command("activate", async (ctx) => {
  const code = (ctx.match ?? "").trim().toUpperCase();
  if (!code) return void (await send(ctx.chat.id, "Usage: /activate YB-XXXXXXXX"));
  const { expiry, error } = await activate(prisma, BigInt(ctx.from!.id), code, ctx.from?.username ?? "");
  if (error) await send(ctx.chat.id, `That didn't work: ${error}. Codes are single-use.`);
  else
    await send(
      ctx.chat.id,
      `搞定! You're active until ${expiry!.toISOString().slice(0, 10)} (UTC). ` +
        `Tell me a bit about your day-to-day life, so I can teach you Mandarin you'll actually use.`,
    );
});

bot.command("status", async (ctx) => {
  const id = BigInt(ctx.from!.id);
  const learner = await prisma.learner.findUnique({ where: { id } });
  if (id === ADMIN_TG_ID) {
    const [subs, codes, words] = await Promise.all([
      prisma.learner.count(),
      prisma.code.count(),
      prisma.vocab.count(),
    ]);
    await send(ctx.chat.id, `admin — learners: ${subs}, codes: ${codes}, words: ${words}, engine: ${getEngine()}`);
    return; // admin is always active — no day-count / pay prompt
  }
  const d = daysLeft(learner?.expiry ?? null);
  await send(ctx.chat.id, d ? `${d} day(s) of access left.` : "No active access. " + PAY_PROMPT);
});

bot.command("mode", async (ctx) => {
  const arg = (ctx.match ?? "").trim();
  if (arg !== "casual" && arg !== "study")
    return void (await send(ctx.chat.id, "Usage: /mode casual OR /mode study"));
  await ensureLearner(BigInt(ctx.from!.id));
  await prisma.learner.update({ where: { id: BigInt(ctx.from!.id) }, data: { mode: arg } });
  await send(ctx.chat.id, `Mode: ${arg}.`);
});

bot.command("pings", async (ctx) => {
  const id = BigInt(ctx.from!.id);
  const learner = await ensureLearner(id);
  const arg = (ctx.match ?? "").trim().toLowerCase();
  if (!arg) {
    const n = learner.pingsPerDay;
    return void (await send(ctx.chat.id, `Check-ins: ${n ? `${n}/day` : "off"}. Change with /pings off|1-5`));
  }
  const n = arg === "off" ? 0 : /^[1-5]$/.test(arg) ? Number(arg) : null;
  if (n === null) return void (await send(ctx.chat.id, "Usage: /pings off|1-5"));
  await prisma.learner.update({ where: { id }, data: { pingsPerDay: n } });
  await send(ctx.chat.id, n === 0 ? "Check-ins off. I'll only reply when you message me." : `Got it — ${n} check-in(s) a day.`);
});

bot.command("speak", async (ctx) => {
  const id = BigInt(ctx.from!.id);
  const last = await prisma.message.findFirst({
    where: { learnerId: id, role: "assistant" },
    orderBy: { id: "desc" },
  });
  const segs = last ? extractMandarin(last.content) : [];
  if (!segs.length) return void (await send(ctx.chat.id, "Nothing Mandarin in my last message to speak."));
  const stop = typingWhile(ctx.chat.id);
  try {
    let sent = 0;
    for (const seg of segs.slice(0, 6)) {
      try {
        const { ogg } = await tts(seg);
        await bot.api.sendVoice(ctx.chat.id, new InputFile(ogg), { caption: seg.slice(0, 200) });
        sent++;
      } catch (e) {
        console.error("[tts]", e);
      }
    }
    if (!sent) await send(ctx.chat.id, "Couldn't generate audio just now, try again in a bit.");
  } finally {
    stop();
  }
});

bot.command("review", async (ctx) => {
  const id = BigInt(ctx.from!.id);
  await ensureLearner(id);
  const all = await prisma.vocab.findMany({
    where: { learnerId: id },
    orderBy: [{ strength: "asc" }, { lastSeen: "asc" }],
  });
  const due = all.filter((v) => isDue(v.strength, v.lastSeen));
  if (!due.length)
    return void (await send(ctx.chat.id, `Nothing due — all ${all.length} of your words are on schedule.`));
  reviews.set(String(id), due.slice(0, 7));
  await sendCard(ctx.chat.id, id);
});

bot.command("app", async (ctx) => {
  const id = BigInt(ctx.from!.id);
  const learner = await ensureLearner(id, ctx.from?.username ?? "");
  if (!isActive(learner)) return void (await send(ctx.chat.id, PAY_PROMPT));
  const token = await createMagicLink(prisma, id);
  const url = `${WEB_ORIGIN}/auth/${token}`;
  // Telegram rejects inline-button URLs for http/localhost (400, and pre-
  // bot.catch it killed polling). Buttons only for real https origins.
  if (WEB_ORIGIN.startsWith("https://")) {
    await bot.api.sendMessage(ctx.chat.id, "Your practice app, flashcards, tone trainer, listening reps:", {
      reply_markup: { inline_keyboard: [[{ text: "🏋️ Open yuban", url }]] },
    });
  } else {
    await bot.api.sendMessage(ctx.chat.id, `Your practice app (open in this device's browser):\n${url}`);
  }
});

bot.command("help", (ctx) => send(ctx.chat.id, HELP));

// Admin-only: mint one single-use 30-day activation code.
bot.command("mint", async (ctx) => {
  if (ADMIN_TG_ID === 0n || BigInt(ctx.from!.id) !== ADMIN_TG_ID) return;
  const code = await mintCode(prisma);
  await send(ctx.chat.id, `${code}\nSingle-use, 30 days, rolling. Learner sends: /activate ${code}`);
});

// Admin-only: live-swap the LLM engine (applies to ALL chats + web drills).
bot.command("engine", async (ctx) => {
  if (ADMIN_TG_ID === 0n || BigInt(ctx.from!.id) !== ADMIN_TG_ID) return;
  const arg = (ctx.match ?? "").trim().toLowerCase();
  if (arg === "gemma" || arg === "deepseek") {
    setEngine(arg);
    await send(ctx.chat.id, `Engine: ${arg}. Swapped live, next reply uses it.`);
  } else {
    await send(ctx.chat.id, `Engine: ${getEngine()}. Usage: /engine gemma OR /engine deepseek`);
  }
});

// ---------- flashcard callbacks ----------

bot.on("callback_query:data", async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => {});
  const id = BigInt(ctx.from.id);
  const q = reviews.get(String(id)) ?? [];
  const data = ctx.callbackQuery.data;
  const msg = ctx.callbackQuery.message;
  if (!data.startsWith("rev|") || !q.length || !msg) return;
  const w = q[0];
  if (data === "rev|show") {
    const answer = `${w.word}\n${w.pinyin}\n${w.gloss}`;
    try {
      await ctx.api.editMessageText(msg.chat.id, msg.message_id, renderHtml(answer), {
        parse_mode: "HTML",
        reply_markup: GRADE_KB,
      });
    } catch {
      // HTML parse fallback, same policy as send()
      await ctx.api
        .editMessageText(msg.chat.id, msg.message_id, answer, { reply_markup: GRADE_KB })
        .catch(() => {});
    }
  } else if (data.startsWith("rev|g|")) {
    const g = Number(data.split("|")[2]) as Grade;
    const s = gradeStrength(w.strength, g);
    await prisma.vocab.update({ where: { id: w.id }, data: { strength: s, lastSeen: new Date() } });
    q.shift();
    const bar = "▮".repeat(s) + "▯".repeat(5 - s);
    await ctx.api
      .editMessageText(msg.chat.id, msg.message_id, `${w.word} · ${w.pinyin} · ${bar}`)
      .catch(() => {});
    await sendCard(msg.chat.id, id);
  }
});

// ---------- conversation ----------

bot.on("message:text", async (ctx) => {
  const id = BigInt(ctx.from.id);
  const learner = await ensureLearner(id, ctx.from.username ?? "");
  if (!isActive(learner)) return void (await send(ctx.chat.id, PAY_PROMPT));
  enqueue(ctx.chat.id, () => converse(ctx.chat.id, id, ctx.message.text));
});

bot.on(["message:voice", "message:audio"], async (ctx) => {
  const id = BigInt(ctx.from.id);
  const learner = await ensureLearner(id, ctx.from.username ?? "");
  if (!isActive(learner)) return void (await send(ctx.chat.id, PAY_PROMPT));
  enqueue(ctx.chat.id, async () => {
    if (!sttAvailable())
      return void (await send(ctx.chat.id, "Can't hear voice notes yet here — type that for me?"));
    const stop = typingWhile(ctx.chat.id);
    try {
      const file = await ctx.getFile();
      const url = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;
      const audio = Buffer.from(await (await fetch(url)).arrayBuffer());
      const text = await transcribe(audio, "voice.ogg");
      if (!text)
        return void (await send(ctx.chat.id, "Couldn't transcribe that voice note — type it for me?"));
      await send(ctx.chat.id, `🎙️ "${text}"`);
      await converse(ctx.chat.id, id, text);
    } finally {
      stop();
    }
  });
});

// ---------- scheduled check-ins ----------

const PING_TEXT =
  "[scheduled check-in — the learner did not write this. Open a fresh " +
  "conversation obeying the anti-repetition rules: new focus word, new " +
  "opener type vs the last two check-ins.]";

export function nextPingAt(now = new Date(), perDay = DEFAULT_PINGS): Date {
  const gapH = (WAKE_END - WAKE_START) / Math.max(1, perDay);
  const t = new Date(now.getTime() + gapH * (0.5 + Math.random()) * 3600_000);
  const local = new Date(t.getTime() + TZ_OFFSET_MIN * 60_000);
  const h = local.getUTCHours();
  if (h >= WAKE_END) {
    local.setUTCDate(local.getUTCDate() + 1);
    local.setUTCHours(WAKE_START, Math.floor(Math.random() * 60), 0, 0);
  } else if (h < WAKE_START) {
    local.setUTCHours(WAKE_START, Math.floor(Math.random() * 60), 0, 0);
  }
  return new Date(local.getTime() - TZ_OFFSET_MIN * 60_000);
}

export function startPingScheduler() {
  setInterval(async () => {
    try {
      const now = new Date();
      const due = await prisma.learner.findMany({
        where: { pingsPerDay: { gt: 0 }, nextPingAt: { lte: now } },
      });
      for (const learner of due) {
        if (!isActive(learner, now)) continue;
        await prisma.learner.update({
          where: { id: learner.id },
          data: { nextPingAt: nextPingAt(now, learner.pingsPerDay) },
        });
        enqueue(Number(learner.id), () => converse(Number(learner.id), learner.id, PING_TEXT));
      }
    } catch (e) {
      console.error("[ping-loop]", e);
    }
  }, 60_000);
}

export async function startBot() {
  if (ADMIN_TG_ID !== 0n) {
    const admin = await ensureLearner(ADMIN_TG_ID, "admin");
    if (!admin.nextPingAt)
      await prisma.learner.update({
        where: { id: ADMIN_TG_ID },
        data: { nextPingAt: new Date(Date.now() + 3600_000) },
      });
  }
  bootTs = Math.floor(Date.now() / 1000);
  void bot.start({ onStart: (me) => console.log(`[bot] @${me.username} polling`) });
}
