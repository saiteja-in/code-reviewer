import { Resend } from "resend";

let resendClient: Resend | null = null;

export function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }

  return resendClient;
}

function formatFromAddress(rawFrom: string) {
  const trimmed = rawFrom.trim();
  if (trimmed.includes("<")) {
    return trimmed;
  }
  return `AI Code Review <${trimmed}>`;
}

export function getResendFromAddress() {
  const configured = process.env.RESEND_FROM_EMAIL?.trim();
  if (configured) {
    return formatFromAddress(configured);
  }

  return "AI Code Review <onboarding@resend.dev>";
}

export async function sendVerificationEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const { data, error } = await getResend().emails.send({
    from: getResendFromAddress(),
    to: [to],
    subject,
    html,
  });

  if (error) {
    throw new Error(
      error.message ??
        "Failed to send verification email. Check your Resend domain and API key.",
    );
  }

  return data;
}
