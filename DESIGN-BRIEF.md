# yuban (语伴) — product brief for design

This document describes what the product is, its screens, flows, states, and
must-have features. It deliberately says nothing about visual style, layout,
color, or typography. That is the designer's territory.

## What the product is

yuban ("language partner") is a personal Mandarin tutor that behaves like a
friend, not a course. There is no curriculum. The tutor chats with the
learner about their actual life, teaches words from those conversations, and
every practice exercise in the app is built from the learner's own saved
words, never from a generic textbook list.

The product has two doors into one brain:

1. **The web app** (what is being designed): the same tutor chat, plus a
   practice gym of three audio-first drills, plus a home screen.
2. **A Telegram bot** (already exists, not being designed): the same chat in
   messenger form. It is also the only surface that can proactively reach
   out ("hey, just checking in"), because a closed browser tab cannot be
   pinged.

Both doors share one account, one chat history, one word book. Start a
conversation on the web, continue it in Telegram mid-sentence, and vice
versa. Nothing is different except that Telegram can ping you.

Business model: access is $20 for 30 days, rolling (renewing adds 30 days to
whatever time is left). Web visitors can try the real product free within
limits before paying.

## Who is using it

- **Visitor / guest**: arrived at the website, no account. Can start
  playing immediately with no signup form, no email, no password. Gets a
  starter pack of 10 beginner words and 25 free chat messages.
- **Trial-expired guest**: used up the 25 free messages. Drills still work;
  chat shows an activation wall.
- **Subscriber**: paid, unlimited everything.
- **Returning learner**: comes back daily-ish; the emotional core is the
  streak, the due words waiting, and the friendship with the tutor.

There are no passwords or emails anywhere in the product. Identity is either
a browser session (guest) or a linked Telegram account.

## Vocabulary the design should use

- **Word book**: the learner's saved words. Each word has hanzi (汉字),
  pinyin with tone marks, an English gloss, and a strength from 1 to 5.
- **Due**: a word whose scheduled review time has arrived. Spaced
  repetition: stronger words come back less often (1, 3, 7, 14, 30 days).
- **Streak**: consecutive days with at least one completed drill activity.
- **Tri-line block**: how the tutor presents any full Mandarin sentence:
  hanzi line, pinyin line, English line, always in that order.
- **Check-in**: the tutor proactively messaging the learner (Telegram only).
- **Activation code**: a single-use code (format YB-XXXXXXXX) that grants 30
  rolling days of access.

## Screens and what each must contain

### 1. Landing / Connect (shown to anyone without a session)

Purpose: let people in with zero friction, and let returning users
reconnect.

Must have:
- The product identity and a one-breath pitch (learning from your own life,
  a tutor that texts like a friend).
- Primary action: **Connect Telegram** (for people who already use the bot
  or want the full experience).
- Secondary action: **Just play on the web** (instant guest account, no form
  of any kind; lands directly on Today with the starter pack loaded).
- A note for existing bot users: sending /app to the bot gives a login link.
- State: after tapping Connect Telegram there is a **waiting state** (the
  user has gone to Telegram to tap Start and will come back to this tab; the
  page detects success by itself and moves on). This waiting moment needs
  design attention: reassure, tell them what to do, never dead-end.

### 2. Today (home)

Purpose: answer "what should I do right now" in one glance and route to
everything else.

Must have:
- Due word count (the main call to practice) or an "all on schedule" state.
- Streak, always visible.
- Total words in the word book.
- Links to the four activities: Chat, Flashcards, Tone trainer, Listening.
  Flashcards shows its due count.
- Fresh words strip: the latest saved words, each tappable to hear its
  audio.
- Guest-only element: a "keep your progress" prompt to connect Telegram
  (explains that words, chats, and streak move with them, and that the tutor
  can check in on them there).

### 3. Chat

Purpose: the actual product. A texting conversation with the tutor.

Must have:
- Message history (user and tutor), loaded from the shared history, i.e.
  Telegram conversations appear here too.
- The tutor answers in short messenger-style bubbles; one reply can arrive
  as up to three bubbles.
- Any Mandarin line in a tutor message is individually playable (tap to
  hear).
- Tri-line blocks appear inside bubbles (hanzi / pinyin / English).
- A composer with send action; a "tutor is typing" state while waiting
  (replies take a few seconds).
- Empty state for a fresh account: an invitation that tells the learner they
  can just say hi, talk about their day, or ask how to say anything.
- **The wall**: when a guest exhausts 25 free messages (or a lapsed
  subscriber returns), the composer locks and a panel explains: $20 for 30
  days, rolling; the path is Connect Telegram, then activate with a code in
  the bot; progress carries over. This is the money moment of the product
  and deserves care. Drills stay usable even when chat is walled.

### 4. Flashcards

Purpose: recall drill over due words.

Flow: prompt side shows the English gloss ("how do you say X"), learner
recalls, reveals the answer (hanzi + pinyin, audio plays automatically on
reveal, tappable to replay), then self-grades on a four-point scale
(Again / Hard / Good / Easy). Next card follows immediately.

Must have:
- Progress within the session (position out of total).
- Reveal action, then the four grades. Keyboard works on desktop (reveal
  and grade) as well as tap.
- End-of-deck state with a count of reviewed words, and a distinct
  "nothing due" state (calm, not guilt).

### 5. Tone trainer

Purpose: ear training for the four Mandarin tones, the drill with the
strongest research backing.

Flow: a round of 8 items. Each item: audio of a single syllable plays,
learner picks tone 1, 2, 3, or 4, immediate right/wrong feedback with the
correct answer, then next item. After the round: per-tone accuracy summary
and the option to go again.

Must have:
- Replay control for the current syllable (never punish re-listening).
- The four tone choices, labeled with the tone marks (ˉ ˊ ˇ ˋ).
- Round summary by tone.
- Items come from the learner's own words when they have enough, topped up
  from a starter set when they are new.

### 6. Listening

Purpose: comprehension of full sentences built from words the learner knows.

Flow: audio of a sentence plays (auto-plays once on load), learner listens
and mentally translates, reveals the tri-line answer, then self-reports
"got it" or "missed it". Next sentence follows.

Must have:
- Listen button, replayable, visibly disabled while audio is playing (no
  overlapping playback anywhere in the app).
- A generation wait state ("building a sentence from your words" takes a
  few seconds).
- Reveal, then the two-way self-grade.
- Empty state when the learner has too few words (points them to chat).
- Session count of completed reps.

## Cross-surface flows

### Guest signup (web first)
Landing → "Just play on the web" → instantly on Today with 10 starter words
due and 25 chat messages available. No form, ever.

### Connecting Telegram (the handshake)
From landing, the Today guest prompt, or the chat wall → Connect Telegram →
a Telegram deep link opens the bot → the user taps Start there → the web
page detects it within seconds and continues signed in. If the user was a
guest, everything they did merges into their Telegram account (words, chat
history, streak). The link is valid for 10 minutes; expired links need a
fresh attempt.

### Bot first login
An existing bot user sends /app in Telegram, receives a single-use login
link, opens it, lands on Today. Used links and old links show a polite
"link expired, get a fresh one" page.

### Activation (payment)
Codes are redeemed in the Telegram bot (/activate YB-XXXXXXXX). The web's
job is only to route people there from the wall. No card forms or payment
UI on the web today.

## Product-wide must-haves

- **Audio everywhere**: every hanzi string in the app can be heard. Audio
  is a native Mandarin voice. One clip at a time globally; triggering the
  same clip twice never overlaps it.
- **Trilingual text**: hanzi, pinyin with tone marks, and English routinely
  appear together. Treat all three as first-class content in every screen.
- **Session states**: every screen must handle loading, empty, active, and
  (where relevant) done/walled states. The empty states carry the product's
  warmth; none of them should feel like an error.
- **Guest vs linked awareness**: the only visible differences for guests
  are the connect prompts and the chat trial counter reaching its wall.
- **Responsive**: phone-first usage is expected for drills; chat and drills
  must work well on desktop too (keyboard grading on flashcards).
- **Encouragement without guilt**: streaks and empty states celebrate
  progress ("stacked wins"); no loss-aversion copy, no shame for missing a
  day.

## Product voice (for any copy in mockups)

The tutor texts like a warm, real friend: short messages, plain language,
at most one question per message, almost no emoji. It never uses dash
punctuation (no em dashes; commas and periods instead). It never narrates
its own mechanics (no "saving to your profile"). English UI copy follows
the same voice: short, warm, concrete.

## Page map

- `/` Landing / Connect (unauthenticated)
- `/today` Home
- `/chat` Tutor chat (+ wall state)
- `/flashcards` Recall drill
- `/tones` Tone trainer
- `/listening` Listening drill
- `/auth/<token>` Login landing from a bot link (success redirects to
  Today; failure shows the link-expired message)

All authenticated screens link back to Today. Today links to everything.

## Explicitly out of scope for this design

- The Telegram bot's own conversation UI (it is native Telegram).
- Admin tooling (code minting, stats).
- Payment checkout UI (activation happens in Telegram for now).
- Pronunciation scoring, writing/stroke practice (not part of the product).
