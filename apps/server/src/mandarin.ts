// Mandarin text utilities shared by bot and web: segment extraction for
// /speak, Telegram HTML rendering of sentence blocks, bubble splitting.
export const CJK = /[一-鿿]/;
const CJK_G = /[一-鿿]/g;

/** CJK-majority lines whole (keeps embedded names like Luna); else bare runs. */
export function extractMandarin(text: string): string[] {
  const segs: string[] = [];
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s || !CJK.test(s)) continue;
    const cjkCount = (s.match(CJK_G) ?? []).length;
    if (cjkCount / Math.max(1, s.replace(/ /g, "").length) > 0.4) {
      segs.push(s);
    } else {
      segs.push(...(s.match(/[一-鿿][一-鿿0-9，。？！、；：]*/g) ?? []));
    }
  }
  return [...new Set(segs)];
}

const esc = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Style hanzi/pinyin/English 3-line blocks: bold / italic / plain. */
export function renderHtml(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (
      CJK.test(lines[i]) && i + 2 < lines.length &&
      lines[i + 1].trim() && lines[i + 2].trim() &&
      !CJK.test(lines[i + 1]) && !CJK.test(lines[i + 2])
    ) {
      out.push(`<b>${esc(lines[i])}</b>`, `<i>${esc(lines[i + 1])}</i>`, esc(lines[i + 2]));
      i += 3;
    } else {
      out.push(esc(lines[i]));
      i += 1;
    }
  }
  return out.join("\n");
}

/**
 * Deterministic dash scrub — prompt bans slip (every current model does),
 * code does not. Kills em/en dashes and hyphens-as-pause; keeps hyphens
 * inside compound words (day-to-day) and the lone `---` bubble separator.
 */
export function stripDashes(text: string): string {
  return text
    .replace(/^[—–][ \t]*/gm, "") // line-leading dash: drop it
    .replace(/[ \t]*[—–][ \t]*/g, ", ") // inline em/en dash → comma
    .replace(/([^\n-])[ \t]+-[ \t]+(?=[^-])/g, "$1, ") // spaced hyphen as pause
    .replace(/,[ \t]*([,.!?;:；：，。？！])/g, "$1"); // tidy doubled punctuation
}

/** The model splits multi-thought replies with a lone `---` line; max 3 bubbles. */
export function splitBubbles(text: string): string[] {
  return text
    .split(/\n\s*---\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 3);
}
