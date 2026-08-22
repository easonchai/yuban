// TTS with disk cache. Default: msedge-tts (free MS neural voices);
// ELEVENLABS_API_KEY upgrades the provider. mp3 for the web <audio>,
// ogg/opus (via ffmpeg) for Telegram voice notes.
import { createHash } from "node:crypto";
import { mkdir, rename, access, rm } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { REPO_ROOT } from "./util.js";

const CACHE_DIR = process.env.TTS_CACHE_DIR ?? path.join(REPO_ROOT, "tts-cache");
const VOICE = process.env.TTS_VOICE ?? "zh-CN-XiaoxiaoNeural";
const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY ?? "";
// Sarah — a free-tier default voice; with eleven_v3 her Mandarin passes.
const ELEVEN_VOICE = process.env.ELEVENLABS_VOICE ?? "EXAVITQu4vr4xnSDxMaL";
const ELEVEN_MODEL = process.env.ELEVENLABS_MODEL ?? "eleven_v3";
// ElevenLabs is OPTIONAL. With a key we try it first; on ANY failure (no
// key, monthly quota burned, network down) we fall back to Edge's Xiaoxiao,
// a native Mandarin voice that is free forever. TTS_PROVIDER=edge skips
// ElevenLabs entirely even when a key exists.
const USE_ELEVEN = !!ELEVEN_KEY && process.env.TTS_PROVIDER !== "edge";

const exists = (p: string) => access(p).then(() => true, () => false);

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-y", "-loglevel", "error", ...args]);
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg: ${err}`))));
  });
}

async function synthMp3(text: string, mp3Path: string): Promise<void> {
  if (USE_ELEVEN) {
    try {
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}`, {
        method: "POST",
        headers: { "xi-api-key": ELEVEN_KEY, "content-type": "application/json" },
        body: JSON.stringify({ text, model_id: ELEVEN_MODEL, language_code: "zh" }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) throw new Error(`elevenlabs ${r.status}`);
      writeFileSync(mp3Path, Buffer.from(await r.arrayBuffer()));
      return;
    } catch (e) {
      console.error("[tts] elevenlabs failed, falling back to edge:", e);
    }
  }
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
  const engine = new MsEdgeTTS();
  await engine.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  // v2 toFile takes a DIRECTORY; use a per-call temp dir so parallel calls don't collide
  const tmpDir = mp3Path.replace(/\.mp3$/, ".tmp");
  await mkdir(tmpDir, { recursive: true });
  const { audioFilePath } = await engine.toFile(tmpDir, text);
  await rename(audioFilePath, mp3Path);
  await rm(tmpDir, { recursive: true, force: true });
}

/** Returns cached {mp3, ogg} paths for the text, synthesizing on miss. */
export async function tts(text: string): Promise<{ mp3: string; ogg: string }> {
  await mkdir(CACHE_DIR, { recursive: true });
  const key = createHash("sha1").update(`${USE_ELEVEN ? `11:${ELEVEN_VOICE}:${ELEVEN_MODEL}` : VOICE}|${text}`).digest("hex");
  const mp3 = path.join(CACHE_DIR, `${key}.mp3`);
  const ogg = path.join(CACHE_DIR, `${key}.ogg`);
  if (!(await exists(mp3))) await synthMp3(text, mp3);
  if (!(await exists(ogg))) await ffmpeg(["-i", mp3, "-c:a", "libopus", "-b:a", "48k", ogg]);
  return { mp3, ogg };
}
