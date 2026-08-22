"use client";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

export default function AuthExpired() {
  const [botUrl, setBotUrl] = useState<string | null>(null);
  useEffect(() => {
    apiGet<{ username: string }>("/api/bot")
      .then((d) => setBotUrl(`https://t.me/${d.username}`))
      .catch(() => {});
  }, []);

  return (
    <div className="shell narrow" style={{ paddingTop: 90, display: "flex", justifyContent: "center" }}>
      <div className="card pop" style={{ maxWidth: 400, padding: "44px 30px", display: "flex", flexDirection: "column", gap: 14, alignItems: "center", textAlign: "center" }}>
        <span className="zh" style={{ fontSize: 30, color: "var(--muted)" }}>哎呀</span>
        <span className="serif" style={{ fontSize: 25, lineHeight: 1.15 }}>That link has expired</span>
        <span style={{ fontSize: 15, color: "var(--body)", lineHeight: 1.55 }}>
          Login links work once and go stale fast. Send <b style={{ color: "var(--ink)" }}>/app</b> to
          the bot again and use the fresh one.
        </span>
        {botUrl && (
          <a href={botUrl} className="btn dark" style={{ textDecoration: "none" }}>Open the bot</a>
        )}
        <span style={{ fontSize: 13 }} className="muted">Nothing is lost. Your account is fine.</span>
      </div>
    </div>
  );
}
