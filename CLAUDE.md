# yuban-app — agent instructions

- SCOPE.md is the spec; keep it updated when scope genuinely changes.
- One tutor, two doors: the SAME chat exists on web (/chat) and Telegram,
  sharing one Message history. Drills stay web-only (beyond /review);
  check-in pings stay Telegram-only (a closed tab can't be pinged). Never
  fork the tutor's brain per surface.
- `persona/persona.md` is the agent brief; `Learner.profileMd` holds ONLY
  About/Level/Contexts/Style — vocab is the `Vocab` table, touched by the
  model only through save_word/adjust_word tools.
- LLM engines are swappable behind the single `chat()` helper in tutor.ts.
  DeepSeek calls MUST keep thinking disabled inside the request params —
  with it on, reasoning starves max_tokens and replies come back empty.
  Gemma (local ollama) MUST keep `think: false` — default thinking makes a
  2s reply take 38s.
- One Telegram poller per token: never run two bot processes at once.
- Never send secrets, learner data, or .env contents anywhere.
- Tests: `pnpm test` (vitest in apps/server). Run before claiming done.
- Never commit as Claude, no co-author trailers, `main` branch only.
