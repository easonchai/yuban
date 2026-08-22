// The tutor engine: prompt assembly, LLM loop with tools, no-silence guard.
import OpenAI from "openai";
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "./db.js";
import { clampStrength } from "./srs.js";
import { stripDashes } from "./mandarin.js";
import { REPO_ROOT } from "./util.js";

const MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
const HISTORY_TURNS = 40;
// v4-flash is a thinking model; with thinking on, reasoning eats the whole
// max_tokens budget (finish=length, empty replies). Verified 2026-08-21.
const THINKING_OFF = { thinking: { type: "disabled" } };

const PERSONA = readFileSync(path.join(REPO_ROOT, "persona/persona.md"), "utf8");
export const PROFILE_TEMPLATE = readFileSync(path.join(REPO_ROOT, "persona/profile-template.md"), "utf8");

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY ?? "",
  baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
  timeout: 60_000,
});

// ---------- engine swap: deepseek (cloud) | gemma (local ollama) ----------

export type Engine = "deepseek" | "gemma";
let engine: Engine = process.env.LLM_PROVIDER === "gemma" ? "gemma" : "deepseek";
export const getEngine = (): Engine => engine;
export const setEngine = (e: Engine) => { engine = e; };

const OLLAMA = process.env.OLLAMA_ORIGIN ?? "http://localhost:11434";
const GEMMA_MODEL = process.env.GEMMA_MODEL ?? "gemma4:12b";

type ChatParams = OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;

/** Ollama native /api/chat, mapped to/from the OpenAI shape the callers use. */
async function gemmaChat(params: ChatParams): Promise<OpenAI.Chat.ChatCompletion> {
  const messages = (params.messages as unknown as Array<Record<string, unknown>>).map((m) => {
    const calls = m.tool_calls as Array<{ function: { name: string; arguments: string } }> | undefined;
    if (m.role === "assistant" && calls?.length)
      return {
        role: "assistant",
        content: String(m.content ?? ""),
        tool_calls: calls.map((tc) => ({
          function: { name: tc.function.name, arguments: JSON.parse(tc.function.arguments || "{}") },
        })),
      };
    if (m.role === "tool") return { role: "tool", content: String(m.content ?? "") };
    return { role: m.role, content: String(m.content ?? "") };
  });
  const body: Record<string, unknown> = {
    model: GEMMA_MODEL,
    messages,
    stream: false,
    // gemma4 thinks by default in ollama: ~38s/reply with it on, ~2s off
    // (measured 2026-08-22). Never remove this.
    think: false,
    keep_alive: "30m",
    options: { num_predict: params.max_tokens ?? 1000 },
  };
  if (params.tools?.length) body.tools = params.tools;
  if ((params.response_format as { type?: string } | undefined)?.type === "json_object") body.format = "json";

  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw new Error(`ollama ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as {
    message?: { content?: string; tool_calls?: Array<{ function: { name: string; arguments: unknown } }> };
  };
  const tool_calls = (j.message?.tool_calls ?? []).map((tc, i) => ({
    id: `ollama-${i}`,
    type: "function" as const,
    function: { name: tc.function.name, arguments: JSON.stringify(tc.function.arguments ?? {}) },
  }));
  return {
    choices: [
      {
        message: {
          role: "assistant",
          content: j.message?.content ?? "",
          ...(tool_calls.length ? { tool_calls } : {}),
        },
      },
    ],
  } as unknown as OpenAI.Chat.ChatCompletion;
}

// The thinking override MUST ride inside the request params: the SDK's
// second-argument `body` REPLACES the whole payload (spread order in
// completions.create), it does not merge. Proven 2026-08-21.
export const chat = (params: ChatParams) =>
  engine === "gemma"
    ? gemmaChat(params)
    : client.chat.completions.create({ ...params, ...THINKING_OFF } as ChatParams);

const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "update_profile",
      description:
        "Replace the learner's profile document (About/Level/Contexts/Style only — vocab lives elsewhere). Pass the COMPLETE markdown.",
      parameters: {
        type: "object",
        properties: { profile_markdown: { type: "string" } },
        required: ["profile_markdown"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_word",
      description: "Save a word you taught or the learner asked about. Pinyin with tone marks.",
      parameters: {
        type: "object",
        properties: {
          word: { type: "string" },
          pinyin: { type: "string" },
          gloss: { type: "string" },
          context: { type: "string" },
        },
        required: ["word", "pinyin", "gloss"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "adjust_word",
      description: "Silent assessment: +1 when a taught word is used/recalled correctly, -1 on a miss.",
      parameters: {
        type: "object",
        properties: { word: { type: "string" }, delta: { type: "number" } },
        required: ["word", "delta"],
      },
    },
  },
];

async function runTool(learnerId: bigint, name: string, argsJson: string): Promise<string> {
  try {
    const args = JSON.parse(argsJson || "{}");
    if (name === "update_profile") {
      await prisma.learner.update({
        where: { id: learnerId },
        data: { profileMd: String(args.profile_markdown ?? "").slice(0, 16384) },
      });
      return "profile saved";
    }
    if (name === "save_word") {
      await prisma.vocab.upsert({
        where: { learnerId_word: { learnerId, word: args.word } },
        create: {
          learnerId,
          word: args.word,
          pinyin: args.pinyin,
          gloss: args.gloss,
          context: args.context ?? "general",
        },
        update: { pinyin: args.pinyin, gloss: args.gloss, lastSeen: new Date() },
      });
      return "word saved";
    }
    if (name === "adjust_word") {
      const row = await prisma.vocab.findUnique({
        where: { learnerId_word: { learnerId, word: args.word } },
      });
      if (!row) return "unknown word";
      await prisma.vocab.update({
        where: { id: row.id },
        data: { strength: clampStrength(row.strength + Math.sign(args.delta)), lastSeen: new Date() },
      });
      return "adjusted";
    }
    return "unknown tool";
  } catch (e) {
    return `error: ${e}`;
  }
}

async function buildSystem(learnerId: bigint): Promise<string> {
  const learner = await prisma.learner.findUnique({ where: { id: learnerId } });
  const vocab = await prisma.vocab.findMany({
    where: { learnerId },
    orderBy: { lastSeen: "desc" },
    take: 100,
  });
  const mode = learner?.mode === "study"
    ? "study — scaffold EVERY full Mandarin sentence with the three-line block."
    : "casual — scaffold new or shaky sentences; known ground can go bare.";
  const vocabMd = vocab.length
    ? "| word | pinyin | gloss | context | strength | lastSeen |\n|---|---|---|---|---|---|\n" +
      vocab
        .map((v) => `| ${v.word} | ${v.pinyin} | ${v.gloss} | ${v.context} | ${v.strength} | ${v.lastSeen.toISOString().slice(0, 10)} |`)
        .join("\n")
    : "(no words saved yet)";
  return `${PERSONA}\n\n# Current mode\n${mode}\n\n# Learner profile\n${learner?.profileMd || PROFILE_TEMPLATE}\n\n# Vocab (strengths 1-5, app-scheduled)\n${vocabMd}`;
}

// Gemma ignores inline tools once the full persona is loaded (0/4 in live
// tests with nudges top and bottom; short prompts hit 2/2). So gemma mode
// captures vocab AND profile facts FunctionGemma-style: a tiny post-reply
// extraction call with a short prompt, fired after the reply is already
// sent (zero user latency).
async function gemmaExtractWords(learnerId: bigint, userText: string, reply: string) {
  try {
    const learner = await prisma.learner.findUnique({ where: { id: learnerId } });
    const profile = learner?.profileMd || PROFILE_TEMPLATE;
    const resp = await gemmaChat({
      model: GEMMA_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You extract data from one Mandarin tutoring exchange. Two jobs:\n" +
            "1. If the tutor taught or translated a specific Mandarin word, call save_word for each (max 2, pinyin with tone marks).\n" +
            "2. If the LEARNER revealed facts about themselves (name, age, location, occupation, hobbies, interests, people or pets, native language, why they are learning, their level), call update_profile ONCE with the COMPLETE updated markdown: take the CURRENT PROFILE below and fill or amend only the fields the learner just revealed, keeping everything else exactly as is.\n" +
            "If neither applies, reply with just: none\n\n" +
            `CURRENT PROFILE:\n${profile}`,
        },
        { role: "user", content: `Learner: ${userText}\nTutor: ${reply}` },
      ],
      tools: TOOLS.filter((t) => t.function.name === "save_word" || t.function.name === "update_profile"),
      max_tokens: 900,
    } as ChatParams);
    for (const tc of resp.choices[0].message.tool_calls ?? []) {
      if (tc.function.name === "save_word" || tc.function.name === "update_profile") {
        await runTool(learnerId, tc.function.name, tc.function.arguments);
      }
    }
  } catch (e) {
    console.error("[gemma-extract]", e);
  }
}

/** One tutor turn. Stores messages; never returns silence for a user turn. */
export async function tutorReply(learnerId: bigint, userText: string): Promise<string> {
  const system = await buildSystem(learnerId);
  const history = await prisma.message.findMany({
    where: { learnerId },
    orderBy: { id: "desc" },
    take: HISTORY_TURNS,
  });
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...history.reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: userText },
  ];

  // The reply that arrives AFTER tool results wins; content that rode along
  // with tool calls is only a fallback (models often restate it, and
  // concatenating both duplicated whole replies — live bug 2026-08-22).
  let finalText = "";
  let preTool = "";
  for (let round = 0; round < 3; round++) {
    const resp = await chat({ model: MODEL, messages, tools: TOOLS, max_tokens: 1000 });
    const msg = resp.choices[0].message;
    if (msg.tool_calls?.length) {
      messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });
      for (const tc of msg.tool_calls) {
        const result = await runTool(learnerId, tc.function.name, tc.function.arguments);
        messages.push({ role: "tool", tool_call_id: tc.id, content: result });
      }
      if (msg.content) preTool += (preTool ? "\n" : "") + msg.content;
      continue;
    }
    if (msg.content) finalText = msg.content;
    break;
  }
  if (!finalText.trim()) finalText = preTool;

  finalText = finalText.trim();
  if (!finalText || finalText === "…") {
    // model saved data then went silent — force a real reply
    messages.push({
      role: "user",
      content: "[Reply to the learner's last message now, in text. Do not mention this note.]",
    });
    const resp = await chat({ model: MODEL, messages, max_tokens: 1000 });
    finalText = (resp.choices[0].message.content ?? "").trim();
  }

  finalText = stripDashes(finalText).trim();
  await prisma.message.create({ data: { learnerId, role: "user", content: userText } });
  if (finalText && finalText !== "…") {
    await prisma.message.create({ data: { learnerId, role: "assistant", content: finalText } });
    if (engine === "gemma") void gemmaExtractWords(learnerId, userText, finalText);
  }
  return finalText;
}

type Sentence = { hanzi: string; pinyin: string; english: string; targetWord: string };

// In-memory sentence pool: one LLM call yields 5 sentences, served one per
// rep. Key includes the target word + strength, so grading the target (which
// changes its strength/order) naturally invalidates the pool.
const sentencePool = new Map<string, Sentence[]>();

/** Generate one listening sentence from the learner's known words. */
export async function listeningSentence(learnerId: bigint): Promise<Sentence | null> {
  const vocab = await prisma.vocab.findMany({
    where: { learnerId },
    orderBy: [{ strength: "asc" }, { lastSeen: "asc" }],
    take: 20,
  });
  if (vocab.length < 2) return null;
  const target = vocab[0];
  const key = `${learnerId}:${vocab.length}:${target.word}:${target.strength}`;
  const pooled = sentencePool.get(key);
  if (pooled?.length) return pooled.shift()!;

  const words = vocab.map((v) => v.word).join("、");
  const resp = await chat({
    model: MODEL,
    messages: [
      {
        role: "user",
        content:
          `Build 5 DIFFERENT short, natural Mandarin sentences for a beginner using ONLY very ` +
          `common words plus words from this list: ${words}. Each MUST contain 「${target.word}」. ` +
          `Return STRICT JSON only: {"sentences":[{"hanzi":"...","pinyin":"... (tone marks, lowercase)","english":"..."}]}`,
      },
    ],
    max_tokens: 900,
    response_format: { type: "json_object" },
  });
  try {
    const j = JSON.parse(resp.choices[0].message.content ?? "{}");
    const good: Sentence[] = (Array.isArray(j.sentences) ? j.sentences : [])
      .filter((s: Sentence) => s?.hanzi && s?.pinyin && s?.english)
      .map((s: Sentence) => ({ hanzi: s.hanzi, pinyin: s.pinyin, english: s.english, targetWord: target.word }));
    if (!good.length) return null;
    if (sentencePool.size > 100) sentencePool.clear(); // ponytail: crude bound, fine for one process
    sentencePool.set(key, good.slice(1));
    return good[0];
  } catch {
    return null;
  }
}
