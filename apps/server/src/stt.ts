// Voice-note transcription. v1 provider: Groq Whisper (large-v3). Without a
// key we return null and the bot asks the learner to type — never silent.
const GROQ_KEY = process.env.GROQ_API_KEY ?? "";

export function sttAvailable(): boolean {
  return !!GROQ_KEY;
}

export async function transcribe(audio: Buffer, filename = "voice.ogg"): Promise<string | null> {
  if (!GROQ_KEY) return null;
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)]), filename);
  form.append("model", "whisper-large-v3");
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${GROQ_KEY}` },
    body: form,
  });
  if (!r.ok) {
    console.error(`[stt] groq ${r.status}: ${await r.text()}`);
    return null;
  }
  const data = (await r.json()) as { text?: string };
  return data.text?.trim() || null;
}
