"use client";
import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost, UnauthedError } from "@/lib/api";
import { Connect } from "@/components/Shell";

type Q = { key: string; zh: string; ask: string; hint: string; chips?: string[] };

const QUESTIONS: Q[] = [
  { key: "name", zh: "你叫什么？", ask: "What should I call you?", hint: "Just your name, however you like it said." },
  { key: "occupation", zh: "你做什么？", ask: "What fills your days?", hint: "Work, school, building something, anything." },
  { key: "location", zh: "你住在哪里？", ask: "Where do you live?", hint: "City is plenty." },
  { key: "people", zh: "谁在你身边？", ask: "Who is in your life?", hint: "Partner, kids, pets, the group chat. The people you actually talk about." },
  { key: "hobbies", zh: "你喜欢做什么？", ask: "What do you love doing?", hint: "Weekends, evenings, obsessions." },
  { key: "why", zh: "为什么学中文？", ask: "Why Mandarin?", hint: "Be honest. Every reason is a good reason." },
  {
    key: "level", zh: "你的中文怎么样？", ask: "How much Mandarin do you have?", hint: "No wrong answer, this just sets the starting line.",
    chips: ["Zero, starting fresh", "A few words", "Basic phrases", "Can hold simple chats"],
  },
];

export default function Welcome() {
  const [step, setStep] = useState(-1); // -1 intro, 0..n questions, n outro
  const [input, setInput] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [unauthed, setUnauthed] = useState(false);
  const [sttOk, setSttOk] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    apiGet<{ id: string }>("/api/me").catch((e) => e instanceof UnauthedError && setUnauthed(true));
    apiGet<{ available: boolean }>("/api/stt/available").then((d) => setSttOk(d.available)).catch(() => {});
  }, []);

  if (unauthed) return <Connect />;

  const q = QUESTIONS[step];
  const done = step >= QUESTIONS.length;

  const submit = async (value: string) => {
    const v = value.trim();
    const next = { ...answers, ...(v ? { [q.key]: v } : {}) };
    setAnswers(next);
    setInput("");
    if (step + 1 >= QUESTIONS.length) {
      setStep(QUESTIONS.length);
      await apiPost("/api/onboarding", next);
      setTimeout(() => (location.href = "/today"), 1600);
    } else setStep(step + 1);
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setTranscribing(true);
        try {
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
          const r = await fetch("/api/stt", {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": blob.type || "audio/webm" },
            body: blob,
          });
          const d = (await r.json()) as { text: string | null };
          if (d.text) setInput(d.text); // learner reviews before sending
        } catch (e) {
          console.error(e);
        }
        setTranscribing(false);
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch (e) {
      console.error(e);
    }
  };

  const stopRec = () => {
    recRef.current?.stop();
    setRecording(false);
  };

  return (
    <div className="shell narrow" style={{ maxWidth: 560, display: "flex", flexDirection: "column", minHeight: "100dvh", justifyContent: "center", paddingBottom: 40 }}>
      {step === -1 ? (
        <div className="pop" style={{ display: "flex", flexDirection: "column", gap: 18, alignItems: "center", textAlign: "center" }}>
          <span className="logo-tile zh" style={{ width: 56, height: 56, fontSize: 22, borderRadius: 12 }}>语伴</span>
          <h1 style={{ fontSize: 40 }}>Before we start, let me get to know you</h1>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: "var(--body)", maxWidth: 420 }}>
            Everything I teach you comes from your own life, so I need a
            little of it. Seven quick questions. Type or talk, skip anything.
          </p>
          <button className="btn" style={{ marginTop: 8 }} onClick={() => setStep(0)}>Let's go</button>
        </div>
      ) : done ? (
        <div className="pop" style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", textAlign: "center" }}>
          <span className="zh" style={{ fontSize: 44, color: "var(--jade)" }}>搞定</span>
          <h1 style={{ fontSize: 34 }}>{answers.name ? `Nice to meet you, ${answers.name}` : "Nice to meet you"}</h1>
          <p className="muted" style={{ fontSize: 16 }}>Setting up your practice…</p>
          <div className="breath-dots"><span /><span /><span /></div>
        </div>
      ) : (
        <div key={q.key} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", gap: 6 }} className="rise">
            {QUESTIONS.map((_, i) => (
              <span key={i} style={{ flex: 1, height: 4, borderRadius: 99, background: i < step ? "var(--jade)" : i === step ? "var(--red)" : "var(--bd-3)", transition: "background .3s" }} />
            ))}
          </div>
          <div className="rise r1">
            <span className="zh" style={{ fontSize: 22, color: "var(--red)" }}>{q.zh}</span>
            <h1 style={{ fontSize: 38, marginTop: 6 }}>{q.ask}</h1>
            <p className="muted" style={{ fontSize: 15, marginTop: 8 }}>{q.hint}</p>
          </div>

          {q.chips ? (
            <div className="rise r2" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {q.chips.map((c) => (
                <button key={c} className="btn outline" style={{ justifyContent: "flex-start" }} onClick={() => submit(c)}>
                  {c}
                </button>
              ))}
            </div>
          ) : (
            <div className="rise r2" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="composer">
                <input
                  autoFocus
                  value={transcribing ? "listening back…" : input}
                  disabled={recording || transcribing}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && input.trim() && void submit(input)}
                  placeholder={recording ? "recording… tap the mic to stop" : "type, or use the mic"}
                />
                {sttOk && (
                  <button
                    className="send"
                    style={{ background: recording ? "var(--jade)" : "var(--ink)" }}
                    onClick={recording ? stopRec : startRec}
                    disabled={transcribing}
                    title={recording ? "stop" : "speak your answer"}
                  >
                    {recording ? "■" : "🎙"}
                  </button>
                )}
                <button className="send" onClick={() => input.trim() && void submit(input)} disabled={!input.trim() || recording}>
                  ↑
                </button>
              </div>
              <button
                onClick={() => void submit("")}
                style={{ background: "none", border: "none", color: "var(--muted)", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", alignSelf: "center" }}
              >
                Skip this one
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
