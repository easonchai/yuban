// Regression guard for the 2026-08-21 SDK bug: passing { body } as the
// second create() argument REPLACES the whole request payload. This boots a
// local capture server and asserts the wire body carries BOTH the params and
// the thinking-off override.
import { describe, it, expect } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

describe("llm request body", () => {
  it("keeps model/messages AND thinking-off in the outgoing payload", async () => {
    let captured: Record<string, unknown> | null = null;
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => {
        captured = JSON.parse(body);
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            id: "test", object: "chat.completion", created: 0, model: "m",
            choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
          }),
        );
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;

    process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${port}`;
    process.env.DEEPSEEK_API_KEY = "test-key";
    const { chat } = await import("../src/tutor.js"); // env must be set before import

    try {
      const resp = await chat({
        model: "deepseek-v4-flash",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5,
      });
      expect(resp.choices[0].message.content).toBe("ok");
      expect(captured).not.toBeNull();
      expect(captured!.model).toBe("deepseek-v4-flash");
      expect(captured!.messages).toEqual([{ role: "user", content: "hi" }]);
      expect(captured!.thinking).toEqual({ type: "disabled" });
    } finally {
      server.close();
    }
  }, 15_000);
});
