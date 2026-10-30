// LOCAL TEST HARNESS — not a mail server. Accepts SMTP from GoTrue on :1025 and exposes the messages over a subset of the
// Mailpit HTTP API on :8025 (/api/v1/messages, /api/v1/message/{id}), so the E2E specs read mail the same way against this
// sink (laptop, when the Supabase CLI's own Mailpit is not running) and against the real Mailpit (CI).
// Start it with scripts/dev/start-mail-sink.sh. It never relays anything anywhere.
import net from "node:net";
import http from "node:http";
import { randomUUID } from "node:crypto";

const messages = [];   // newest first

const qp = (s) => s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
const decodeWords = (s) => s.replace(/=\?([^?]+)\?([bqBQ])\?([^?]*)\?=/g, (_, _cs, enc, t) => enc.toLowerCase() === "b" ? Buffer.from(t, "base64").toString("utf8") : Buffer.from(qp(t.replace(/_/g, " ")), "latin1").toString("utf8"));

function parse(raw) {
  const [head, ...rest] = raw.split(/\r?\n\r?\n/); const body = rest.join("\n\n");
  const hdr = (name, h = head) => { const m = new RegExp(`^${name}:\\s*([^\\r\\n]*(?:\\r?\\n[ \\t][^\\r\\n]*)*)`, "im").exec(h); return m ? decodeWords(m[1].replace(/\r?\n[ \t]+/g, " ")) : ""; };
  const out = { Subject: hdr("Subject"), To: hdr("To"), From: hdr("From"), Text: "", HTML: "" };
  const walk = (headers, content) => {
    const ct = hdr("Content-Type", headers), cte = hdr("Content-Transfer-Encoding", headers).toLowerCase();
    const b = /boundary="?([^";\s]+)"?/i.exec(ct);
    if (b) { for (const part of content.split(`--${b[1]}`).slice(1)) { if (part.startsWith("--")) break; const [ph, ...pc] = part.replace(/^\r?\n/, "").split(/\r?\n\r?\n/); walk(ph, pc.join("\n\n")); } return; }
    let text = content; if (cte === "quoted-printable") text = qp(text); else if (cte === "base64") text = Buffer.from(text.replace(/\s+/g, ""), "base64").toString("utf8");
    if (/text\/html/i.test(ct)) out.HTML += text; else out.Text += text;
  };
  walk(head, body);
  return out;
}

net.createServer((sock) => {
  let buf = "", data = null, rcpt = [];
  const send = (l) => sock.write(`${l}\r\n`);
  send("220 mail-sink ESMTP ready");
  sock.on("data", (d) => {
    buf += d.toString("latin1");
    for (;;) {
      if (data !== null) { const i = buf.indexOf("\r\n.\r\n"); if (i < 0) return; const raw = (data + buf.slice(0, i)).replace(/\r\n\.\./g, "\r\n."); buf = buf.slice(i + 5); data = null;
        const p = parse(raw); messages.unshift({ ID: randomUUID(), Created: new Date().toISOString(), Envelope: rcpt, ...p }); send("250 queued"); continue; }
      const i = buf.indexOf("\r\n"); if (i < 0) return; const line = buf.slice(0, i); buf = buf.slice(i + 2); const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === "EHLO" || cmd === "HELO") { send("250-mail-sink"); send("250 8BITMIME"); }
      else if (cmd === "MAIL") { rcpt = []; send("250 ok"); }
      else if (cmd === "RCPT") { rcpt.push(/<([^>]*)>/.exec(line)?.[1] ?? ""); send("250 ok"); }
      else if (cmd === "DATA") { data = ""; send("354 end with <CRLF>.<CRLF>"); }
      else if (cmd === "RSET" || cmd === "NOOP") send("250 ok");
      else if (cmd === "QUIT") { send("221 bye"); sock.end(); return; }
      else send("502 not implemented");
    }
  });
  sock.on("error", () => {});
}).listen(1025, "0.0.0.0");

const pick = (m) => ({ ID: m.ID, Created: m.Created, Subject: m.Subject, From: { Address: m.From.replace(/.*<|>.*/g, "") }, To: m.Envelope.map((a) => ({ Address: a })) });
http.createServer((req, res) => {
  const json = (o, s = 200) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
  const u = new URL(req.url, "http://x");
  if (req.method === "DELETE" && u.pathname === "/api/v1/messages") { messages.length = 0; return json({ ok: true }); }
  if (u.pathname === "/api/v1/messages") return json({ total: messages.length, messages: messages.map(pick) });
  const m = /^\/api\/v1\/message\/([\w-]+)$/.exec(u.pathname);
  if (m) { const found = messages.find((x) => x.ID === m[1]); return found ? json({ ...pick(found), Text: found.Text, HTML: found.HTML }) : json({ error: "not found" }, 404); }
  json({ error: "not found" }, 404);
}).listen(8025, "0.0.0.0");
console.log("mail-sink: SMTP :1025, HTTP :8025");
