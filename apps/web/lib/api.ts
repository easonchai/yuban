"use client";

export class UnauthedError extends Error {}

export async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(path, { credentials: "same-origin" });
  if (r.status === 401) throw new UnauthedError();
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 401) throw new UnauthedError();
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json() as Promise<T>;
}

// Singleton player: replaying the same text while it's still playing is a
// no-op, and a new text stops the old audio first — overlap is impossible.
let current: HTMLAudioElement | null = null;
let currentKey = "";

export function playUrl(url: string): HTMLAudioElement {
  if (current && !current.paused && !current.ended && currentKey === url) return current;
  current?.pause();
  const a = new Audio(url);
  current = a;
  currentKey = url;
  void a.play().catch(() => {});
  return a;
}

export function playTts(text: string): HTMLAudioElement {
  return playUrl(`/api/tts?text=${encodeURIComponent(text)}`);
}
