# yuban v2 — full scope

TypeScript rebuild of the yuban Mandarin tutor. One tutor, two doors
(decided 2026-08-22, supersedes the old two-surface split): **the same
conversation lives on web AND Telegram**, drills live on web, and Telegram
is additionally the push surface (check-ins can reach a pocket, not a
closed tab). One Postgres, one deployable compose stack. Supersedes an
earlier private Python prototype (retired).

## Stack

- **Monorepo**: pnpm workspaces — `apps/web`, `apps/server`, root compose.
- **Web**: Next.js 15 (app router, standalone output), React 19. No UI lib;
  hand-rolled warm-paper/ink/cinnabar design system (brand carried over).
- **Server**: Express 4 (JSON API; async routes wrapped so a handler error
  500s instead of killing the process) + grammY (Telegram long-poll bot) in
  ONE Node process — same code, same DB pool; split into two services later
  only if load demands it.
- **DB**: Postgres 16 + Prisma. Single source of truth for learners, vocab,
  messages, subscriptions, sessions.
- **LLM**: swappable engine behind one `chat()` chokepoint. Default: DeepSeek
  `deepseek-v4-flash` via OpenAI SDK with thinking disabled inside the request
  params (the empty-reply bug fix). Alternative: `gemma` — Gemma 4 12B on
  local ollama (native /api/chat, `think:false` mandatory, `format:"json"`
  for structured output). Select with `LLM_PROVIDER` or live via the admin
  `/engine gemma|deepseek` Telegram command; applies to chat AND web drills.
- **TTS**: `msedge-tts` (MS neural `zh-CN-XiaoxiaoNeural`, free, no key) →
  ogg/opus via ffmpeg; `ELEVENLABS_API_KEY` upgrades to ElevenLabs.
- **STT (voice notes)**: pluggable. v1 = Groq Whisper (`GROQ_API_KEY`,
  large-v3, generous free tier) because local whisper.cpp in Docker is a
  build-time tarpit. No key → bot politely asks to type. (Python/mlx local
  whisper stays a documented option for later.)
- **Docker**: compose with `postgres`, `server`, `web`. Volumes: pgdata,
  tts-cache. `.env` at root feeds all services.

## Repo layout

```
yuban-app/
  SCOPE.md  CLAUDE.md  .env.example  docker-compose.yml
  package.json  pnpm-workspace.yaml  tsconfig.base.json
  prisma/schema.prisma
  persona/persona.md          # the agent brief (ported, incl. all v4 rules)
  persona/profile-template.md # seed for Learner.profileMd (About/Level/Contexts/Style)
  apps/server/
    src/index.ts              # boot: db, bot, api, ping scheduler
    src/bot.ts                # grammY: commands, chat, voice, callbacks
    src/tutor.ts              # prompt assembly + LLM loop + tools
    src/srs.ts                # due logic, grading, intervals  (unit tested)
    src/subs.ts               # codes, activate, rolling expiry (unit tested)
    src/tts.ts  src/stt.ts    # speech in/out, pluggable providers
    src/api.ts                # Express routes for the web app
    src/auth.ts               # magic-link tokens (unit tested)
    test/*.test.ts            # vitest
    Dockerfile
  apps/web/
    app/(app)/today/page.tsx  flashcards/page.tsx  tones/page.tsx
    app/(app)/listening/page.tsx
    next.config.ts            # rewrites /auth/:token + /api/* to the server,
                              # which sets the httpOnly cookie (no web route file)
    lib/api.ts  components/*  Dockerfile
  scripts/mint-link.mts       # dev utility: mint a web magic link
```

## Data model (Prisma)

- **Learner** — `id` (BigInt = Telegram user id, PK), `username`, `mode`
  (casual|study), `pingsPerDay` (0-5, default 2), `nextPingAt`,
  `expiry` (nullable; admin bypasses), `profileMd` (model-owned About/Level/
  Contexts/Style markdown — vocab NOT in here anymore), `streak`,
  `lastActive` (web-gym streak bookkeeping), timestamps.
- **Vocab** — `learnerId`+`word` unique; `pinyin`, `gloss`, `context`,
  `strength` 1-5, `introduced`, `lastSeen`. Structured so SRS and the web
  app can query it; the model touches it only through tools.
- **Message** — `learnerId`, `role` (user|assistant), `content`, `ts`.
  Last 40 fed to the model.
- **Code** — single-use activation codes (`YB-XXXXXXXX`), `usedBy`, `usedAt`.
- **WebSession** — magic-link auth: `token` PK, `learnerId`, `expiresAt`
  (30 days), created via bot `/app`.

## Tutor engine (port of proven Python behavior)

- System prompt = `persona/persona.md` + mode line + `profileMd` + vocab
  table rendered as markdown. (A web recent-activity digest is deferred —
  the web app has no chat surface in v1, so there is no call site for it.)
- History: last 40 messages. `max_tokens` 1000, thinking OFF, timeout 60s.
- **Tools** (now structured, replacing whole-doc rewrite):
  - `update_profile(profile_markdown)` — replaces `profileMd` (About/Level/
    Contexts/Style only).
  - `save_word(word, pinyin, gloss, context)` — upsert into Vocab.
  - `adjust_word(word, delta)` — silent-assessment strength nudge (±1),
    stamps lastSeen.
- Empty-reply guard: if final text empty/`…` → one forced no-tools retry →
  fallback line. A user message NEVER ends in silence.
- Round-joining with `\n` (the `at.Profile's` concat bug fix).

## Telegram bot (grammY) — full parity + carryovers

Commands: `/start`, `/activate CODE`, `/status`, `/mode casual|study`,
`/pings off|1..5`, `/speak`, `/review`, `/app` (NEW — magic link), `/help`.

Carryover behaviors (all already proven in Python, port exactly):
- Typing indicator loop every 4s while transcribing/thinking/pinging.
- Per-chat worker ordering; one slow message never blocks other chats.
- Bubble splitting on `---` (max 3) with randomized 1-2.4s pauses.
- HTML rendering of hanzi/pinyin/English blocks (bold/italic/plain) with
  plain-text fallback on parse errors.
- Voice notes: download → STT → echo `🎙️ "..."` → normal pipeline; no STT
  key → ask to type.
- `/speak`: extract Mandarin segments (CJK-heavy lines — >40% CJK — whole,
  inline runs bare) → one voice note per segment, hanzi caption, max 6.
- `/review`: flashcards with inline keyboard — gloss → Show answer →
  😵😬🙂😎 grading (Again/Hard/Good/Easy), strength bar, auto-next.
- Ping scheduler: per-learner `nextPingAt`, jittered gap = window/pingsPerDay
  × 0.5-1.5, clamped 09:00-22:00 learner-local (TZ_OFFSET_MIN, default 480);
  unanswered previous check-in → one warm nudge, never two; stale-update
  drop on boot (>120s old).
- Admin (`ADMIN_TG_ID`): always active, seeded into Learner at boot,
  `/status` shows counts, `/mint` mints one single-use activation code.

## SRS (shared by bot + web)

- Intervals by strength: 1→1d, 2→3d, 3→7d, 4→14d, 5→30d. Due = lastSeen
  older than interval (bad date = due).
- Grades: Again `max(1,s-1)` · Hard `s` · Good `min(5,s+1)` · Easy
  `min(5,s+2)`; always stamps lastSeen.
- Queue: due words sorted by (strength asc, lastSeen asc), cap 7 (bot) /
  20 (web session).

## Web app (the gym)

**Auth**: two-way, no passwords, no email. Bot-first: `/app` → single-use
magic link `https://host/auth/<token>` → httpOnly cookie (30d); https
origins get an inline button, http/localhost a plain-text link (Telegram
rejects non-https button URLs). Web-first: unauthed visits get a Connect
screen whose button mints an unclaimed session, opens
`t.me/<bot>?start=link-<token>`, and polls; the bot's `/start` claims the
token (binds the Telegram id, 10-min claim window → 30d session) and the
browser logs itself in. Web-only guests: "Just play on the web" creates a
negative-id Learner (never collides with Telegram ids, pings off) seeded
with a 10-word starter pack (backdated so drills work immediately), cookie
session 30d. Guest→Telegram account merge is future work — guest progress
lives in that browser only.

**Design**: warm paper `#fffdf8`, ink `#1b1b22`, cinnabar `#a93619`, marker
yellow; flat poster cards (solid borders + offset shadows); Duolingo-JUICY
(snappy transitions, satisfying taps, big type) but NOT Duolingo pedagogy —
every exercise is built from the learner's OWN vocab, production before
recognition, streaks framed as stacked wins (no guilt copy, no loss-aversion).

**Screens (v1)**:
0. **Chat** — the same tutor conversation as Telegram: same engine, shared
   history (both doors read/write the one Message table), bubbles split on
   `---`, tap-to-hear on Mandarin lines. Gating: active subscribers
   unlimited; web-only guests get 25 free user messages then an activate
   wall; Telegram-linked but lapsed accounts see the wall immediately.
   Guests connecting Telegram MERGE into the Telegram account (vocab
   deduped keeping existing rows, messages re-parented, best streak kept).
1. **Today** — due count, streak (days with ≥1 completed activity), quick
   links to chat + the three drills, latest words strip; guests see a
   "connect Telegram to keep your progress" banner.
2. **Flashcards** — same SRS backend as `/review`; audio autoplays on
   reveal (server TTS, cached); tap/keyboard grading; end-of-deck recap.
3. **Tone trainer** — the research star (+21% finding): hear a syllable
   (TTS, cached), tap tone 1-4; minimal-pair rounds built from the learner's
   vocab syllables (fallback seed set when vocab is thin); per-tone accuracy
   shown after each round.
4. **Listening** — play a full sentence made of known words (LLM-generated
   on-demand, pooled in memory: one call yields 5 sentences, served one per
   rep; grading the target word invalidates the pool), learner recalls, tap
   to reveal tri-line; self-grade feeds the same SRS.

**API** (Express, cookie-auth): `GET /api/me`, `GET /api/deck`,
`POST /api/grade`, `GET /api/tones/round`, `POST /api/tones/result`,
`GET /api/listening/next`, `POST /api/listening/result`,
`GET /api/tts?text=...` (audio, cached to disk). Streak ships inside
`GET /api/me` — no separate endpoint, nothing needs one.

## Subscription (carryover, deferred wiring)

Codes + rolling 30-day expiry (`max(now, expiry)+30d`) ported and unit
tested. A paid `/subscribe` endpoint + payment-gateway integration stays
**out of v1 scope** (to be added behind `ENABLE_SUBSCRIBE=1` when payments
are wired — not implemented yet). Codes are minted by the admin `/mint`
command until then.

## Docker

- `postgres:16-alpine` + volume; healthcheck.
- `server`: node:22-slim + ffmpeg; runs migrations on boot
  (`prisma migrate deploy`); env: TELEGRAM_BOT_TOKEN, DEEPSEEK_API_KEY,
  ADMIN_TG_ID, DATABASE_URL, WEB_ORIGIN, optional GROQ_API_KEY /
  ELEVENLABS_API_KEY / TZ_OFFSET_MIN / PINGS_PER_DAY.
- `web`: Next standalone; env NEXT_PUBLIC_API unused (same-origin via
  compose network + rewrite to server).
- Local dev without docker also works: `docker compose up postgres` +
  `pnpm dev` in both apps.

## Testing / verification

- vitest: srs (due math incl. exact boundary, grade math, tone pool, streak
  transitions), subs (code single-use via activate, rolling extension, lapsed
  restart), auth (token single-use, expiry, session rules), mandarin
  extraction, bubble split, render-html escaping (`<` `>` `&`), boot
  staleness gate, and an LLM wire-body regression test (params + thinking-off
  must both reach the API — guards the SDK body-clobber bug).
- `tsc --noEmit` both apps; `next build`; `docker compose build`;
  end-to-end smoke: compose up → `/api/health` → bot getMe → magic link.

## Non-goals (v1)

Elderly hack (separate), voice replies in normal chat (only /speak +
flashcard audio), pronunciation scoring, character stroke tracing,
marketplace listing, multi-language beyond Mandarin, WeChat.

## Risks

- Groq dependency for STT (mitigated: graceful fallback, pluggable iface).
- msedge-tts is an unofficial endpoint (mitigated: ElevenLabs switch, audio
  cache keeps old clips working).
- One TG token = one poller: Python bot must be stopped before this bot
  starts (import script prints the reminder).
