"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { apiGet, apiPost, playUrl } from "@/lib/api";

const NAV = [
  { href: "/today", label: "Today", glyph: "今", tab: "TODAY" },
  { href: "/chat", label: "Chat", glyph: "聊", tab: "CHAT" },
  { href: "/flashcards", label: "Flashcards", glyph: "忆", tab: "CARDS" },
  { href: "/tones", label: "Tones", glyph: "声", tab: "TONES" },
  { href: "/listening", label: "Listening", glyph: "听", tab: "LISTEN" },
];

export function Nav({ streak, words }: { streak?: number; words?: number }) {
  const path = usePathname();
  return (
    <>
      <nav className="nav">
        <span style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 6 }}>
          <span className="logo-tile zh">语伴</span>
          <span className="brand-name">yuban</span>
        </span>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`nav-link ${path === n.href ? "active" : ""}`}>
            {n.label}
          </Link>
        ))}
        <span style={{ flex: 1 }} />
        {streak !== undefined && streak > 0 && <span className="pill jade">{streak} day streak</span>}
        {words !== undefined && words > 0 && <span className="pill">{words} words</span>}
      </nav>
      <nav className="tabbar">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`tab ${path === n.href ? "active" : ""}`}>
            <span className="g">{n.glyph}</span>
            <span className="t">{n.tab}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}

/** Drill-session header: quit link left, progress label right. */
export function SessionHead({ endTo = "/today", right }: { endTo?: string; right?: string }) {
  return (
    <div className="session-head">
      <Link href={endTo} className="end">✕ &nbsp;End session</Link>
      {right && <span className="count">{right}</span>}
    </div>
  );
}

/** Opens the bot deep link and polls until /start claims (or merges) it. */
export function ConnectTelegramButton({ label = "Connect Telegram" }: { label?: string }) {
  const [link, setLink] = useState<{ token: string; url: string } | null>(null);

  useEffect(() => {
    if (!link) return;
    const poll = setInterval(async () => {
      try {
        const s = await apiGet<{ linked: boolean }>(`/api/link/status?token=${link.token}`);
        if (s.linked) {
          clearInterval(poll);
          location.href = "/today";
        }
      } catch {
        /* keep polling */
      }
    }, 2500);
    const giveUp = setTimeout(() => clearInterval(poll), 10 * 60_000);
    return () => {
      clearInterval(poll);
      clearTimeout(giveUp);
    };
  }, [link]);

  const connect = async () => {
    const d = await apiPost<{ token: string; url: string }>("/api/link/start", {});
    setLink(d);
    window.open(d.url, "_blank");
  };

  if (!link) {
    return (
      <button className="btn" onClick={connect}>
        {label}
      </button>
    );
  }
  return (
    <div className="card pop" style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center", textAlign: "center", maxWidth: 380 }}>
      <div className="breath-dots"><span /><span /><span /></div>
      <div className="serif" style={{ fontSize: 26, lineHeight: 1.15 }}>Go tap Start in Telegram</div>
      <div style={{ fontSize: 15, color: "var(--body)", lineHeight: 1.55 }}>
        We opened the bot for you. Tap Start there, then come back to this tab.
        We will notice on our own and sign you in.
      </div>
      <div style={{ fontSize: 13 }} className="muted">This link is good for 10 minutes.</div>
      <div style={{ display: "flex", gap: 16, fontSize: 14, fontWeight: 700 }}>
        <a href={link.url} target="_blank" style={{ color: "var(--red)" }}>Open Telegram again</a>
        <button onClick={() => setLink(null)} style={{ background: "none", border: "none", color: "var(--muted)", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function Connect() {
  const guest = async () => {
    await apiPost("/api/guest", {});
    location.href = "/welcome"; // first-run onboarding before the gym
  };

  return (
    <div className="landing">
      <div className="landing-head rise">
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="logo-tile zh">语伴</span>
          <span className="serif" style={{ fontSize: 21 }}>yuban</span>
        </span>
        <span style={{ fontSize: 13, color: "var(--muted-deep)" }}>
          Already use the bot? Send <b style={{ color: "var(--ink)" }}>/app</b> to it for a login link.
        </span>
      </div>

      <div className="landing-hero">
        <div className="landing-copy">
          <h1 className="rise r1" style={{ fontSize: 56 }}>A Mandarin tutor that texts like a friend.</h1>
          <p className="rise r2" style={{ fontSize: 19, lineHeight: 1.5, color: "var(--body)" }}>
            It chats about your actual life, saves the words you needed, and
            every drill is built from them. No curriculum, no textbook lists.
          </p>
          <div className="rise r3" style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 6 }}>
            <ConnectTelegramButton />
            <button className="btn outline" onClick={guest}>Just play on the web</button>
          </div>
          <p className="rise r4 muted" style={{ fontSize: 14 }}>
            The web is instant, no form of any kind. 10 starter words and 25 free messages are waiting.
          </p>
        </div>

        <ChatPreview />
      </div>
    </div>
  );
}

/**
 * Landing decoration that texts like the product: bubbles land one at a
 * time with typing pauses, then rest. Replays on every page load.
 */
function ChatPreview() {
  const [stage, setStage] = useState(0);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStage(4);
      return;
    }
    const script: Array<[number, () => void]> = [
      [400, () => setStage(1)],
      [900, () => setTyping(true)],
      [1800, () => { setTyping(false); setStage(2); }],
      [2250, () => setTyping(true)],
      [3400, () => { setTyping(false); setStage(3); }],
      [3850, () => setTyping(true)],
      [5000, () => { setTyping(false); setStage(4); }],
    ];
    const timers = script.map(([at, fn]) => setTimeout(fn, at));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="chat-preview pop">
      {stage >= 1 && <div className="pb u pop">how do I say my dog hates rain</div>}
      {stage >= 2 && <div className="pb b pop">Ha, poor thing. Here you go.</div>}
      {stage >= 3 && (
        <div className="pb b pop" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="zh" style={{ fontSize: 19 }}>我的狗讨厌下雨。</span>
            <button className="playbtn" onClick={() => playUrl("/audio/preview-dog-rain.mp3")}>▶</button>
          </span>
          <span style={{ fontSize: 13, color: "var(--muted)", fontStyle: "italic" }}>Wǒ de gǒu tǎoyàn xià yǔ.</span>
          <span style={{ fontSize: 13, color: "var(--body)" }}>My dog hates rain.</span>
        </div>
      )}
      {stage >= 4 && <div className="pb b pop">讨厌 tǎoyàn is to hate. It went in your word book. Does he refuse walks too?</div>}
      {typing && (
        <div className="typing pop" style={{ alignSelf: "flex-start", padding: "12px 14px" }}>
          <span /><span /><span />
        </div>
      )}
    </div>
  );
}

/* Kept for older imports */
export function TopBar({ streak }: { streak?: number; backTo?: string }) {
  return <Nav streak={streak} />;
}
