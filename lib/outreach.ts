import nodemailer from "nodemailer";

export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (trimmed.startsWith("+") && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function normalizeEmail(input: string): string | null {
  const value = input.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
  return value;
}

// Sending is limited to recipients the operator lists in .env.local (OUTREACH_ALLOW_TO, DEMO_EMAIL,
// DEMO_PHONE). The on-screen approval box is only a flag from the browser, so without this a deployed
// copy could be scripted into sending spam or placing calls to anyone.
function allowedRecipient(kind: "email" | "phone", to: string) {
  const own = kind === "email" ? process.env.DEMO_EMAIL : process.env.DEMO_PHONE;
  const listed = [process.env.OUTREACH_ALLOW_TO, own]
    .filter(Boolean)
    .join(",")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => (kind === "email" ? value.toLowerCase() : normalizePhone(value)));
  return listed.includes(kind === "email" ? to.toLowerCase() : to);
}

function xml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendEmail(input: { to: string; subject: string; body: string }) {
  if (!allowedRecipient("email", input.to)) {
    throw new Error("This demo only emails addresses listed in OUTREACH_ALLOW_TO or DEMO_EMAIL in .env.local.");
  }
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("Set EMAIL_FROM in .env.local before sending.");

  if (process.env.RESEND_API_KEY) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        text: input.body,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!response.ok) throw new Error(payload.message || `Resend returned ${response.status}`);
    return { providerId: payload.id ?? "resend" };
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_PORT === "465",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    const info = await transport.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.body,
    });
    return { providerId: info.messageId };
  }

  throw new Error("Set RESEND_API_KEY or SMTP_HOST, SMTP_USER, and SMTP_PASS in .env.local.");
}

export async function placeCall(input: { to: string; script: string }) {
  if (!allowedRecipient("phone", input.to)) {
    throw new Error("This demo only calls numbers listed in OUTREACH_ALLOW_TO or DEMO_PHONE in .env.local.");
  }
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) {
    throw new Error("Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM in .env.local.");
  }
  const spoken = input.script.length > 550 ? `${input.script.slice(0, 540).trim()}…` : input.script;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${xml(spoken)}</Say></Response>`;
  const body = new URLSearchParams({ To: input.to, From: from, Twiml: twiml });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = (await response.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!response.ok) throw new Error(payload.message || `Twilio returned ${response.status}`);
  return { providerId: payload.sid ?? "twilio" };
}
