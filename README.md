# 语伴 yuban

**A Mandarin tutor that texts like a friend.** It chats about your actual
life on web or Telegram, quietly saves the words you needed, and every
drill (flashcards, tone training, listening) is built from your own
vocabulary. No curriculum, no textbook lists, and the model that powers it
runs on a laptop.

Built for the Build with Gemini Hackathon 2026, Singapore. Track: **Best
Use of Gemma**.

## How Gemma is used (and why it is essential)

The tutor's brain is **Gemma 4 12B running fully local** via ollama
(Q4 quantization, Metal GPU). This is not a model swapped into a generic
demo; the product's economics and privacy depend on the weights being open:

- **Private by design.** Your conversations with the tutor are personal
  (your life, your people, your week). In gemma mode nothing you say ever
  leaves the machine. Kill the wifi and the tutor keeps teaching.
- **Openness pays the margin.** The product charges $20 per 30 days.
  Local Gemma inference costs $0 per message, which is what makes a
  personal-tutor price point survivable.
- **Adapted, not just prompted.** Two technical findings from building on
  Gemma 4 12B are baked into the code:
  1. **`think: false` is mandatory.** Ollama enables hidden reasoning by
     default for gemma4; a 4-line reply burned 1100 reasoning tokens and
     took 38.5s. With thinking off the same reply takes ~2s.
  2. **Two-pass tool calling.** With the full ~3k-token persona loaded,
     gemma stops emitting inline tool calls entirely (0 for 4 in our
     tests), while short prompts hit 100%. So gemma mode captures
     vocabulary the FunctionGemma way: a tiny post-reply extraction call
     with a short tool-only prompt, fired after the reply is already sent.
     Zero added latency, reliable word capture.
- **The A/B is live.** One admin command (`/engine gemma|deepseek`) flips
  the whole product between local Gemma and a cloud model mid-conversation,
  same memory, same persona. The demo uses it to show exactly what the
  open model buys you.

## What it does

- **Chat, two doors, one brain**: the same conversation on the web app and
  the Telegram bot, one shared history. The bot can also check in on you
  first ("hey, just checking in") because a closed browser tab cannot.
- **Tri-line teaching**: every full Mandarin sentence arrives as hanzi,
  tone-marked pinyin, and English, with native-voice audio a tap away.
- **A word book that fills itself**: words you actually needed get saved
  by the model through tools, then scheduled by spaced repetition
  (strength 1 to 5 → review in 1/3/7/14/30 days).
- **Drills built only from your words**: recall flashcards, a four-tone
  ear trainer, and listening comprehension with sentences generated from
  your own vocabulary.
- **Hover any hanzi** on the site for instant pinyin.
- **Web guests** get 10 starter words and 25 free tutor messages, then can
  link Telegram and their whole account merges across.

## Stack

pnpm monorepo. `apps/server`: Express 4 + grammY Telegram bot + Prisma/
Postgres in one process; engines behind one `chat()` seam (Gemma via
ollama's native API, DeepSeek via OpenAI SDK). `apps/web`: Next.js 15,
warm-paper design system, motion built on LottieFiles motion-design
principles. TTS: Microsoft Edge neural voice (native Mandarin), cached to
disk forever. STT: Groq Whisper (optional). Docker compose for the whole
stack.

## Run it

```bash
cp .env.example .env        # fill in TELEGRAM_BOT_TOKEN etc.
ollama pull gemma4:12b      # the local brain
docker compose up -d        # postgres + server + web
# open http://localhost:3000 and press "Just play on the web"
```

Tests: `pnpm -C apps/server test` (vitest, 21 tests: SRS math, subscription
logic, auth single-use, chat gating, dash scrubbing, and an LLM wire-body
regression test against a local capture server).

## Rights

Source is public for hackathon judging. All rights reserved.
