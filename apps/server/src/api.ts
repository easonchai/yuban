// Express JSON API for the web app (the gym). Cookie session from magic link.
import express from "express";
import cookieParser from "cookie-parser";
import { randomBytes } from "node:crypto";
import { prisma } from "./db.js";
import { bot } from "./bot.js";
import { consumeMagicLink, sessionLearner } from "./auth.js";
import { isDue, gradeStrength, toneOf, tonePool, nextStreak, type Grade } from "./srs.js";
import { chatGate } from "./subs.js";
import { tts } from "./tts.js";
import { listeningSentence, tutorReply } from "./tutor.js";

export const api = express();
api.use(express.json());
api.use(cookieParser());

const COOKIE = "yuban_session";

// Seed minimal pairs for the tone trainer when the learner's vocab is thin.
const TONE_SEED = [
  { hanzi: "妈", pinyin: "mā" }, { hanzi: "麻", pinyin: "má" },
  { hanzi: "马", pinyin: "mǎ" }, { hanzi: "骂", pinyin: "mà" },
  { hanzi: "汤", pinyin: "tāng" }, { hanzi: "糖", pinyin: "táng" },
  { hanzi: "躺", pinyin: "tǎng" }, { hanzi: "烫", pinyin: "tàng" },
  { hanzi: "八", pinyin: "bā" }, { hanzi: "拔", pinyin: "bá" },
  { hanzi: "把", pinyin: "bǎ" }, { hanzi: "爸", pinyin: "bà" },
];

async function auth(req: express.Request): Promise<bigint | null> {
  return sessionLearner(prisma, req.cookies?.[COOKIE]);
}

// Express 4 does not forward async-handler rejections; without this wrapper a
// route error becomes an unhandledRejection and kills the shared API+bot process.
const h = (fn: (req: express.Request, res: express.Response) => Promise<unknown>): express.RequestHandler =>
  (req, res) =>
    void fn(req, res).catch((e) => {
      console.error("[api]", req.path, e);
      if (!res.headersSent) res.status(500).json({ error: "internal" });
    });

/** Any completed activity today advances the streak; same-day repeats don't. */
async function bumpStreak(learnerId: bigint) {
  const learner = await prisma.learner.findUnique({ where: { id: learnerId } });
  if (!learner) return;
  const streak = nextStreak(learner.streak, learner.lastActive);
  if (streak === null) return;
  await prisma.learner.update({
    where: { id: learnerId },
    data: { streak, lastActive: new Date() },
  });
}

api.get("/api/health", (_req, res) => void res.json({ ok: true }));

api.get("/api/bot", h(async (_req, res) => {
  if (!botUsername) botUsername = (await bot.api.getMe()).username;
  res.json({ username: botUsername });
}));

api.get("/auth/:token", h(async (req, res) => {
  const learnerId = await consumeMagicLink(prisma, req.params.token);
  if (!learnerId) return void res.redirect("/auth-expired");
  res.cookie(COOKIE, req.params.token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 30 * 864e5,
  });
  res.redirect("/today");
}));

// Web-only guest accounts: negative learner ids (never collide with Telegram
// ids, which are positive). No chat surface means no way to earn vocab, so
// guests get a starter pack, backdated so every drill works immediately.
const STARTER: Array<[string, string, string]> = [
  ["你好", "nǐ hǎo", "hello"], ["谢谢", "xiè xie", "thank you"], ["水", "shuǐ", "water"],
  ["茶", "chá", "tea"], ["咖啡", "kā fēi", "coffee"], ["猫", "māo", "cat"],
  ["狗", "gǒu", "dog"], ["朋友", "péng you", "friend"], ["吃", "chī", "to eat"], ["好", "hǎo", "good"],
];

api.post("/api/guest", h(async (_req, res) => {
  const id = -BigInt("0x" + randomBytes(6).toString("hex"));
  const monthAgo = new Date(Date.now() - 31 * 864e5);
  // pingsPerDay 0: the ping loop must never try to DM a fake Telegram id
  await prisma.learner.create({ data: { id, username: "web-guest", pingsPerDay: 0 } });
  await prisma.vocab.createMany({
    data: STARTER.map(([word, pinyin, gloss]) => ({
      learnerId: id, word, pinyin, gloss, context: "starter", strength: 1,
      introduced: monthAgo, lastSeen: monthAgo,
    })),
  });
  const token = randomBytes(24).toString("base64url");
  await prisma.webSession.create({
    data: { token, learnerId: id, consumed: true, expiresAt: new Date(Date.now() + 30 * 864e5) },
  });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", maxAge: 30 * 864e5 });
  res.json({ ok: true });
}));

// Web-first linking: browser mints an unclaimed session, opens the bot deep
// link, and polls until /start claims it. No auth on either route by design.
let botUsername = "";

api.post("/api/link/start", h(async (req, res) => {
  if (!botUsername) botUsername = (await bot.api.getMe()).username;
  // A signed-in guest carries their id into the link session, so the bot's
  // /start claim knows to merge that guest into the Telegram account.
  const caller = await auth(req);
  const token = randomBytes(24).toString("base64url");
  await prisma.webSession.create({
    data: {
      token,
      learnerId: caller && caller < 0n ? caller : null,
      expiresAt: new Date(Date.now() + 10 * 60_000), // 10 min to claim
    },
  });
  res.json({ token, url: `https://t.me/${botUsername}?start=link-${token}` });
}));

// The same tutor conversation as Telegram — one brain, one Message history.
api.post("/api/chat", h(async (req, res) => {
  const id = await auth(req);
  if (!id) return void res.status(401).json({ error: "unauthenticated" });
  const text = String((req.body as { text?: string }).text ?? "").trim().slice(0, 2000);
  if (!text) return void res.status(400).json({ error: "text required" });
  const learner = await prisma.learner.findUnique({ where: { id } });
  const msgCount = await prisma.message.count({ where: { learnerId: id, role: "user" } });
  const gate = chatGate(learner, msgCount);
  if (gate !== "ok") return void res.json({ reply: null, wall: gate });
  const reply = await tutorReply(id, text);
  res.json({ reply, wall: null });
}));

api.get("/api/chat/history", h(async (req, res) => {
  const id = await auth(req);
  if (!id) return void res.status(401).json({ error: "unauthenticated" });
  const rows = await prisma.message.findMany({ where: { learnerId: id }, orderBy: { id: "desc" }, take: 50 });
  res.json({ messages: rows.reverse().map((m) => ({ role: m.role, content: m.content, ts: m.ts })) });
}));

api.get("/api/link/status", h(async (req, res) => {
  const token = String(req.query.token ?? "");
  const row = token ? await prisma.webSession.findUnique({ where: { token } }) : null;
  if (row?.learnerId && row.consumed && row.expiresAt > new Date()) {
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", maxAge: 30 * 864e5 });
    return void res.json({ linked: true });
  }
  res.json({ linked: false });
}));

api.get("/api/me", h(async (req, res) => {
  const id = await auth(req);
  if (!id) return void res.status(401).json({ error: "unauthenticated" });
  const learner = await prisma.learner.findUnique({ where: { id } });
  const vocab = await prisma.vocab.findMany({ where: { learnerId: id }, orderBy: { introduced: "desc" } });
  const due = vocab.filter((v) => isDue(v.strength, v.lastSeen)).length;
  res.json({
    id: String(id),
    username: learner?.username ?? "",
    streak: learner?.streak ?? 0,
    dueCount: due,
    totalWords: vocab.length,
    latest: vocab.slice(0, 8).map((v) => ({ word: v.word, pinyin: v.pinyin, gloss: v.gloss })),
  });
}));

api.get("/api/deck", h(async (req, res) => {
  const id = await auth(req);
  if (!id) return void res.status(401).json({ error: "unauthenticated" });
  const all = await prisma.vocab.findMany({
    where: { learnerId: id },
    orderBy: [{ strength: "asc" }, { lastSeen: "asc" }],
  });
  const due = all.filter((v) => isDue(v.strength, v.lastSeen)).slice(0, 20);
  res.json({
    cards: due.map((v) => ({
      id: v.id, word: v.word, pinyin: v.pinyin, gloss: v.gloss,
      strength: v.strength, context: v.context, lastSeen: v.lastSeen,
    })),
  });
}));

api.post("/api/grade", h(async (req, res) => {
  const id = await auth(req);
  if (!id) return void res.status(401).json({ error: "unauthenticated" });
  const { cardId, grade } = req.body as { cardId: number; grade: Grade };
  const row = await prisma.vocab.findFirst({ where: { id: cardId, learnerId: id } });
  if (!row || ![1, 2, 3, 4].includes(grade)) return void res.status(400).json({ error: "bad request" });
  const s = gradeStrength(row.strength, grade);
  await prisma.vocab.update({ where: { id: row.id }, data: { strength: s, lastSeen: new Date() } });
  await bumpStreak(id);
  res.json({ strength: s });
}));

api.get("/api/tones/round", h(async (req, res) => {
  const id = await auth(req);
  if (!id) return void res.status(401).json({ error: "unauthenticated" });
  const vocab = await prisma.vocab.findMany({ where: { learnerId: id } });
  // One graded syllable = one played/shown character: first char + first
  // pinyin syllable, so the audio never carries tones the tap isn't graded on.
  const own = vocab
    .map((v) => ({ hanzi: Array.from(v.word)[0] ?? v.word, pinyin: v.pinyin.split(/\s+/)[0] }))
    .filter((c) => toneOf(c.pinyin) > 0);
  const items = [...tonePool(own, TONE_SEED)]
    .sort(() => Math.random() - 0.5)
    .slice(0, 8)
    .map((c) => ({ hanzi: c.hanzi, pinyin: c.pinyin, tone: toneOf(c.pinyin) }));
  res.json({ items });
}));

api.post("/api/tones/result", h(async (req, res) => {
  const id = await auth(req);
  if (!id) return void res.status(401).json({ error: "unauthenticated" });
  await bumpStreak(id);
  res.json({ ok: true });
}));

api.get("/api/listening/next", h(async (req, res) => {
  const id = await auth(req);
  if (!id) return void res.status(401).json({ error: "unauthenticated" });
  const sentence = await listeningSentence(id);
  if (!sentence) return void res.json({ sentence: null, reason: "Chat with the bot first — listening reps are built from your own words." });
  res.json({ sentence });
}));

api.post("/api/listening/result", h(async (req, res) => {
  const id = await auth(req);
  if (!id) return void res.status(401).json({ error: "unauthenticated" });
  const { targetWord, got } = req.body as { targetWord: string; got: boolean };
  const row = await prisma.vocab.findUnique({ where: { learnerId_word: { learnerId: id, word: targetWord } } });
  if (row) {
    const s = gradeStrength(row.strength, got ? 3 : 1);
    await prisma.vocab.update({ where: { id: row.id }, data: { strength: s, lastSeen: new Date() } });
  }
  await bumpStreak(id);
  res.json({ ok: true });
}));

// Tone drills need ACCURATE isolated tones, which TTS engines are bad at
// (they read single syllables with lazy contours). We serve native human
// recordings from AllSet Learning's Pronunciation Wiki, fetched once and
// cached forever; ü syllables and misses fall back to TTS of the hanzi.
const TONE_DIR = process.env.TTS_CACHE_DIR ?? "tts-cache";

api.get("/api/tone-audio", h(async (req, res) => {
  const id = await auth(req);
  if (!id) return void res.status(401).json({ error: "unauthenticated" });
  const py = String(req.query.py ?? "");
  const hz = String(req.query.hz ?? "").slice(0, 4);
  const tone = toneOf(py);
  const hasUmlaut = /[üǖǘǚǜ]/.test(py);
  const base = py.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
  const sendTtsFallback = async () => {
    if (!hz) return void res.status(404).json({ error: "no audio" });
    const { mp3 } = await tts(hz);
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    res.sendFile(mp3);
  };
  if (!tone || !base || hasUmlaut) return void (await sendTtsFallback());

  const { existsSync, mkdirSync, writeFileSync: writeF } = await import("node:fs");
  const path = await import("node:path");
  mkdirSync(TONE_DIR, { recursive: true });
  const file = path.resolve(TONE_DIR, `tone-${base}${tone}.mp3`);
  if (!existsSync(file)) {
    try {
      const r = await fetch(
        `https://resources.allsetlearning.com/pronwiki/resources/pinyin-audio/${base}${tone}.mp3`,
        { signal: AbortSignal.timeout(15_000) },
      );
      if (!r.ok || !(r.headers.get("content-type") ?? "").includes("audio")) throw new Error(`${r.status}`);
      writeF(file, Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      console.error("[tone-audio] fetch failed, tts fallback:", base + tone, e);
      return void (await sendTtsFallback());
    }
  }
  res.setHeader("cache-control", "public, max-age=31536000, immutable");
  res.sendFile(file);
}));

api.get("/api/tts", h(async (req, res) => {
  const id = await auth(req);
  if (!id) return void res.status(401).json({ error: "unauthenticated" });
  const text = String(req.query.text ?? "").slice(0, 300);
  if (!text) return void res.status(400).json({ error: "text required" });
  try {
    const { mp3 } = await tts(text);
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    res.sendFile(mp3);
  } catch (e) {
    console.error("[tts]", e);
    res.status(502).json({ error: "tts failed" });
  }
}));
