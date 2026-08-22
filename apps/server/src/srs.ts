// Spaced repetition core. Strength 1-5 maps to expanding review intervals;
// grading follows Anki semantics (1 Again, 2 Hard, 3 Good, 4 Easy).
export const INTERVAL_DAYS: Record<number, number> = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 };

const DAY_MS = 24 * 60 * 60 * 1000;

export function clampStrength(s: number): number {
  return Math.min(5, Math.max(1, Math.round(s)));
}

export function isDue(strength: number, lastSeen: Date, now = new Date()): boolean {
  if (Number.isNaN(lastSeen.getTime())) return true;
  const days = (now.getTime() - lastSeen.getTime()) / DAY_MS;
  return days >= INTERVAL_DAYS[clampStrength(strength)];
}

export type Grade = 1 | 2 | 3 | 4;

export function gradeStrength(strength: number, grade: Grade): number {
  const s = clampStrength(strength);
  switch (grade) {
    case 1: return Math.max(1, s - 1);
    case 2: return s;
    case 3: return Math.min(5, s + 1);
    case 4: return Math.min(5, s + 2);
  }
}

// Tone of a pinyin syllable from its diacritic: 1-4, or 0 for neutral.
const TONE_MARKS: Record<string, number> = {
  "ā": 1, "ē": 1, "ī": 1, "ō": 1, "ū": 1, "ǖ": 1,
  "á": 2, "é": 2, "í": 2, "ó": 2, "ú": 2, "ǘ": 2,
  "ǎ": 3, "ě": 3, "ǐ": 3, "ǒ": 3, "ǔ": 3, "ǚ": 3,
  "à": 4, "è": 4, "ì": 4, "ò": 4, "ù": 4, "ǜ": 4,
};

export function toneOf(pinyinSyllable: string): number {
  for (const ch of pinyinSyllable.normalize("NFC")) {
    const t = TONE_MARKS[ch];
    if (t) return t;
  }
  return 0;
}

/** Tone-round pool: the learner's own syllables; seed only tops up a thin pool. */
export function tonePool<T>(own: T[], seed: T[], roundSize = 8): T[] {
  return own.length >= roundSize ? own : [...own, ...seed];
}

/** New streak value after an activity, or null when today already counted. */
export function nextStreak(current: number, lastActive: Date | null, now = new Date()): number | null {
  const day = (t: Date) => t.toISOString().slice(0, 10);
  if (lastActive && day(lastActive) === day(now)) return null;
  const wasYesterday = lastActive && day(lastActive) === day(new Date(now.getTime() - DAY_MS));
  return wasYesterday ? current + 1 : 1;
}
