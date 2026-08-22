import { describe, it, expect } from "vitest";
import { isDue, gradeStrength, toneOf, clampStrength, tonePool, nextStreak } from "../src/srs.js";
import { extendedExpiry, daysLeft, mintCodeValue, activate, chatGate, SUB_DAYS } from "../src/subs.js";
import { extractMandarin, renderHtml, splitBubbles, stripDashes } from "../src/mandarin.js";
import { consumeMagicLink, sessionLearner } from "../src/auth.js";
import { isStale } from "../src/util.js";

const d = (s: string) => new Date(s);

describe("srs", () => {
  it("due math follows strength intervals", () => {
    expect(isDue(2, d("2026-08-20"), d("2026-08-24"))).toBe(true); // 3d interval, 4d since
    expect(isDue(5, d("2026-08-21"), d("2026-08-24"))).toBe(false); // 30d interval
    expect(isDue(3, new Date(NaN), d("2026-08-24"))).toBe(true); // bad date = due
  });
  it("grades follow Anki semantics with clamping", () => {
    expect(gradeStrength(2, 3)).toBe(3);
    expect(gradeStrength(3, 1)).toBe(2);
    expect(gradeStrength(1, 1)).toBe(1);
    expect(gradeStrength(4, 4)).toBe(5);
    expect(gradeStrength(2, 2)).toBe(2);
    expect(clampStrength(9)).toBe(5);
  });
  it("reads tones from pinyin diacritics", () => {
    expect(toneOf("mā")).toBe(1);
    expect(toneOf("yùcè".split(" ")[0])).toBe(4);
    expect(toneOf("tǎng")).toBe(3);
    expect(toneOf("ma")).toBe(0);
  });
  it("is due exactly at the interval boundary", () => {
    expect(isDue(2, d("2026-08-21T00:00:00Z"), d("2026-08-24T00:00:00Z"))).toBe(true); // exactly 3d
    expect(isDue(2, d("2026-08-21T00:00:01Z"), d("2026-08-24T00:00:00Z"))).toBe(false); // 1s short
  });
  it("tone pool uses seed only when own vocab is thin", () => {
    const own = Array.from({ length: 10 }, (_, i) => ({ hanzi: `字${i}`, pinyin: "mā" }));
    const seed = [{ hanzi: "妈", pinyin: "mā" }];
    expect(tonePool(own, seed)).toHaveLength(10); // no seed mixed in
    expect(tonePool(own.slice(0, 3), seed)).toHaveLength(4); // topped up
  });
  it("streak: same-day no-op, consecutive +1, gap resets", () => {
    const now = d("2026-08-21T10:00:00Z");
    expect(nextStreak(3, d("2026-08-21T01:00:00Z"), now)).toBe(null); // already counted today
    expect(nextStreak(3, d("2026-08-20T23:00:00Z"), now)).toBe(4); // yesterday → +1
    expect(nextStreak(3, d("2026-08-18T10:00:00Z"), now)).toBe(1); // gap → reset
    expect(nextStreak(0, null, now)).toBe(1); // first ever activity
  });
});

describe("util", () => {
  it("drops only pre-boot backlog older than 120s; callbacks always pass", () => {
    const boot = 1_000_000;
    expect(isStale(boot - 121, boot)).toBe(true); // stale backlog dropped
    expect(isStale(boot - 2, boot)).toBe(false); // sent just before restart, kept
    expect(isStale(undefined, boot)).toBe(false); // callback_query has no date
  });
});

describe("auth", () => {
  const fakePrisma = (row: { learnerId: bigint | null; expiresAt: Date; consumed: boolean } | null) =>
    ({
      webSession: {
        findUnique: async () => row,
        updateMany: async ({ where }: { where: { consumed: boolean } }) => {
          if (!row || row.consumed !== where.consumed) return { count: 0 };
          row.consumed = true;
          return { count: 1 };
        },
      },
    }) as never;
  const future = new Date(Date.now() + 864e5);
  const past = new Date(Date.now() - 864e5);

  it("magic link is single-use", async () => {
    const p = fakePrisma({ learnerId: 1n, expiresAt: future, consumed: false });
    expect(await consumeMagicLink(p, "t")).toBe(1n);
    expect(await consumeMagicLink(p, "t")).toBe(null); // second visit fails
  });
  it("expired tokens are rejected on both paths", async () => {
    expect(await consumeMagicLink(fakePrisma({ learnerId: 1n, expiresAt: past, consumed: false }), "t")).toBe(null);
    expect(await sessionLearner(fakePrisma({ learnerId: 1n, expiresAt: past, consumed: true }), "t")).toBe(null);
  });
  it("unclaimed web-first link sessions grant nothing", async () => {
    expect(await consumeMagicLink(fakePrisma({ learnerId: null, expiresAt: future, consumed: false }), "t")).toBe(null);
    expect(await sessionLearner(fakePrisma({ learnerId: null, expiresAt: future, consumed: true }), "t")).toBe(null);
  });
  it("session needs a consumed, unexpired token", async () => {
    expect(await sessionLearner(fakePrisma({ learnerId: 1n, expiresAt: future, consumed: true }), "t")).toBe(1n);
    expect(await sessionLearner(fakePrisma({ learnerId: 1n, expiresAt: future, consumed: false }), "t")).toBe(null);
    expect(await sessionLearner(fakePrisma(null), undefined)).toBe(null);
  });
});

describe("subscriptions", () => {
  it("mid-cycle renewal extends from remaining time", () => {
    const now = d("2026-08-20T12:00:00Z");
    const first = extendedExpiry(null, now);
    expect(first.getTime()).toBe(now.getTime() + SUB_DAYS * 864e5);
    const mid = d("2026-08-30T12:00:00Z");
    expect(extendedExpiry(first, mid).getTime()).toBe(first.getTime() + SUB_DAYS * 864e5);
  });
  it("lapsed renewal restarts from now", () => {
    const old = d("2026-05-01T00:00:00Z");
    const now = d("2026-08-20T00:00:00Z");
    expect(extendedExpiry(old, now).getTime()).toBe(now.getTime() + SUB_DAYS * 864e5);
  });
  it("daysLeft and code shape", () => {
    expect(daysLeft(d("2026-08-30T00:00:00Z"), d("2026-08-20T00:00:00Z"))).toBe(10);
    expect(daysLeft(null)).toBe(0);
    expect(mintCodeValue()).toMatch(/^YB-[0-9A-F]{8}$/);
  });
  it("chat gate: subscribers pass, guests get a trial, lapsed hit the wall", () => {
    const future = new Date(Date.now() + 864e5);
    expect(chatGate({ id: 123n, expiry: future }, 999)).toBe("ok"); // active subscriber
    expect(chatGate({ id: -5n, expiry: null }, 24)).toBe("ok"); // guest inside trial
    expect(chatGate({ id: -5n, expiry: null }, 25)).toBe("trial_over"); // guest at limit
    expect(chatGate({ id: 123n, expiry: null }, 0)).toBe("activate"); // TG-linked, lapsed
    expect(chatGate(null, 0)).toBe("activate"); // unknown learner
  });
  it("a code redeems once and is rejected on the second try", async () => {
    const codeRow = { code: "YB-DEADBEEF", usedBy: null as bigint | null, usedAt: null as Date | null };
    const tx = {
      code: {
        findUnique: async ({ where }: { where: { code: string } }) =>
          where.code === codeRow.code ? codeRow : null,
        updateMany: async ({ where, data }: { where: { usedBy: null }; data: { usedBy: bigint; usedAt: Date } }) => {
          if (codeRow.usedBy !== where.usedBy) return { count: 0 };
          Object.assign(codeRow, data);
          return { count: 1 };
        },
      },
      learner: { findUnique: async () => null, upsert: async () => ({}) },
    };
    const prisma = { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } as never;
    const now = d("2026-08-20T00:00:00Z");

    const first = await activate(prisma, 1n, "YB-DEADBEEF", "eason", now);
    expect(first.error).toBeUndefined();
    expect(first.expiry?.getTime()).toBe(now.getTime() + SUB_DAYS * 864e5);

    const second = await activate(prisma, 2n, "YB-DEADBEEF", "other", now);
    expect(second.error).toBe("code already used");

    expect(await activate(prisma, 1n, "YB-NOPE", "eason", now)).toEqual({ error: "unknown code" });
  });
});

describe("mandarin", () => {
  it("extracts blocks whole and inline runs bare", () => {
    const m = 'sure\n\n你今天带 Luna 去散步了吗？\nnǐ jīntiān...\nDid you...\n\nbtw 预测 (yùcè) means predict';
    expect(extractMandarin(m)).toEqual(["你今天带 Luna 去散步了吗？", "预测"]);
  });
  it("renders sentence blocks as bold/italic/plain and escapes html", () => {
    const r = renderHtml("hey <tag>\n\n你忙吗？\nnǐ máng ma?\nBusy?");
    expect(r).toContain("<b>你忙吗？</b>");
    expect(r).toContain("<i>nǐ máng ma?</i>");
    expect(r).toContain("&lt;tag&gt;");
    expect(renderHtml("fish & chips")).toContain("fish &amp; chips");
  });
  it("splits bubbles on --- with a cap of 3", () => {
    expect(splitBubbles("a\n---\nb\n---\nc\n---\nd")).toEqual(["a", "b", "c"]);
    expect(splitBubbles("just one")).toEqual(["just one"]);
  });
  it("scrubs every dash form the model slips through", () => {
    // the exact live slip from 2026-08-22
    expect(stripDashes("So what's it been — Luna walks or karting weekends?"))
      .toBe("So what's it been, Luna walks or karting weekends?");
    expect(stripDashes("word—word")).toBe("word, word");
    expect(stripDashes("a – b")).toBe("a, b");
    expect(stripDashes("nice - really nice")).toBe("nice, really nice");
    expect(stripDashes("what happened —?")).toBe("what happened?");
    expect(stripDashes("— hello")).toBe("hello");
    expect(stripDashes("my day-to-day routine")).toBe("my day-to-day routine"); // compounds survive
    expect(stripDashes("a\n---\nb")).toBe("a\n---\nb"); // bubble separator survives
  });
});
