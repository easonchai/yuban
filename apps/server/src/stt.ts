// Voice-note transcription. v1 provider: Groq Whisper (large-v3). Without a
// key we return null and the bot asks the learner to type — never silent.
const GROQ_KEY = process.env.GROQ_API_KEY ?? "";

export function sttAvailable(): boolean {
  return !!GROQ_KEY;
}

export async function transcribe(audio: Buffer, filename = "voice.ogg"): Promise<string | null> {
  if (!GROQ_KEY) return null;
  // Docker NAT occasionally times out the first connect to a CDN edge;
  // one retry rescues it, so a learner's voice note never fails on a blip.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(audio)]), filename);
      form.append("model", "whisper-large-v3");
      const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { authorization: `Bearer ${GROQ_KEY}` },
        body: form,
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) {
        console.error(`[stt] groq ${r.status}: ${await r.text()}`);
        return null;
      }
      const data = (await r.json()) as { text?: string };
      return data.text?.trim() || null;
    } catch (e) {
      console.error(`[stt] attempt ${attempt + 1} failed:`, e);
      if (attempt === 1) return null;
    }
  }
  return null;
}
