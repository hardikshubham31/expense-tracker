import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

type Email = { to: string | string[]; subject: string; html: string; text: string };

const FROM = "Expense Tracker <no-reply@localhost>";
const OUTBOX = process.env.OUTBOX_DIR || path.join(process.cwd(), ".outbox");
// Outbox files in development, and wherever OUTBOX_DIR is set explicitly (the test suite)
const WRITE_OUTBOX = process.env.NODE_ENV !== "production" || Boolean(process.env.OUTBOX_DIR);

/**
 * There is no email provider: each email is printed to the server console
 * (and saved as JSON in .outbox/ during development and tests). To send real
 * email later, deliver `email` here with a provider (SMTP, Resend, Postmark...).
 * Never throws: a failed email must not fail the request that triggered it.
 */
export async function sendEmail(email: Email) {
  try {
    console.info(`\n[email] To: ${[email.to].flat().join(", ")}\nSubject: ${email.subject}\n\n${email.text}\n`);
    if (!WRITE_OUTBOX) return;
    await fs.mkdir(OUTBOX, { recursive: true });
    const file = path.join(OUTBOX, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
    // Write then rename, so readers never see a half-written file
    await fs.writeFile(`${file}.tmp`, JSON.stringify({ ...email, from: FROM, sentAt: new Date().toISOString() }, null, 2));
    await fs.rename(`${file}.tmp`, file);
  } catch (error) {
    console.error("[email] failed to write:", error);
  }
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Minimal, client-safe HTML layout with one call-to-action button. */
function layout({ heading, body, cta, url, footer }: { heading: string; body: string[]; cta?: string; url?: string; footer?: string }) {
  const paragraphs = body.map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46">${escape(p)}</p>`).join("");
  const button =
    cta && url
      ? `<p style="margin:24px 0"><a href="${escape(url)}" style="display:inline-block;background:#059669;color:#fff;font-weight:600;font-size:15px;text-decoration:none;padding:12px 20px;border-radius:8px">${escape(cta)}</a></p>
         <p style="margin:0 0 16px;font-size:13px;color:#71717a">Or paste this link into your browser:<br><a href="${escape(url)}" style="color:#047857;word-break:break-all">${escape(url)}</a></p>`
      : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:12px;padding:32px" cellpadding="0" cellspacing="0"><tr><td>
  <p style="margin:0 0 24px;font-weight:700;font-size:16px;color:#18181b">Expense Tracker</p>
  <h1 style="margin:0 0 16px;font-size:22px;color:#18181b">${escape(heading)}</h1>
  ${paragraphs}${button}
  ${footer ? `<p style="margin:24px 0 0;font-size:12px;color:#a1a1aa">${escape(footer)}</p>` : ""}
  </td></tr></table></td></tr></table></body></html>`;
}

function text({ heading, body, url, footer }: { heading: string; body: string[]; url?: string; footer?: string }) {
  return [heading, "", ...body, ...(url ? ["", url] : []), ...(footer ? ["", footer] : [])].join("\n");
}

function build(to: string, subject: string, parts: Parameters<typeof layout>[0]): Email {
  return { to, subject, html: layout(parts), text: text(parts) };
}

export const emails = {
  resetPassword: (to: string, url: string) =>
    build(to, "Reset your password", {
      heading: "Reset your password",
      body: ["We received a request to reset your password. This link expires in 1 hour."],
      cta: "Choose a new password",
      url,
      footer: "If you didn't ask for this, you can ignore this email. Your password won't change.",
    }),

  invite: (to: string, url: string, inviter: string, ledger: string) =>
    build(to, `${inviter} invited you to ${ledger}`, {
      heading: `Join ${ledger}`,
      body: [`${inviter} invited you to share expenses in “${ledger}” on Expense Tracker. The invite expires in 7 days.`],
      cta: "Accept invite",
      url,
    }),

  budgetAlert: (to: string, url: string, opts: { ledger: string; budget: string; month: string; threshold: number; spent: string; limit: string }) =>
    build(to, `${opts.budget}: ${opts.threshold >= 100 ? "budget exceeded" : `${opts.threshold}% of budget used`}`, {
      heading: opts.threshold >= 100 ? `You've gone over your ${opts.budget} budget` : `${opts.budget} is at ${opts.threshold}% of budget`,
      body: [
        `${opts.ledger} · ${opts.month}: ${opts.spent} spent of ${opts.limit}.`,
        opts.threshold >= 100 ? "Any further spending in this category is over budget." : "You might want to slow down for the rest of the month.",
      ],
      cta: "View overview",
      url,
      footer: "You can turn off budget alerts in your account settings.",
    }),
};
