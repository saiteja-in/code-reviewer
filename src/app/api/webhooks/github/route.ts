import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/server/db";
import { inngest } from "@/server/inngest";

interface PullRequestPayload {
  action: string;
  number: number;
  pull_request: {
    id: number;
    number: number;
    title: string;
    html_url: string;
    state: string;
    draft: boolean;
  };
  repository: {
    id: number;
    full_name: string;
  };
}

function verifySignature(payload: string, signature: string | null): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed in production; allow locally for convenience.
    if (process.env.NODE_ENV === "production") {
      console.error("GITHUB_WEBHOOK_SECRET is not set — rejecting webhook");
      return false;
    }
    console.warn("GITHUB_WEBHOOK_SECRET not set, skipping verification (dev)");
    return true;
  }

  if (!signature) {
    return false;
  }

  const hmac = crypto.createHmac("sha256", secret);
  const digest = "sha256=" + hmac.update(payload).digest("hex");

  // timingSafeEqual throws if the buffers differ in length, so guard first.
  const digestBuf = Buffer.from(digest);
  const signatureBuf = Buffer.from(signature);
  if (digestBuf.length !== signatureBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(digestBuf, signatureBuf);
}

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const event = request.headers.get("x-github-event");

  // Verify the webhook signature
  if (!verifySignature(payload, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Only handle pull_request events
  if (event !== "pull_request") {
    return NextResponse.json({ message: "Event ignored" }, { status: 200 });
  }

  let data: PullRequestPayload;
  try {
    data = JSON.parse(payload) as PullRequestPayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 },
    );
  }

  // Only trigger on open, synchronize (new commits), or reopen
  if (!["opened", "synchronize", "reopened"].includes(data.action)) {
    return NextResponse.json(
      { message: `Action '${data.action}' ignored` },
      { status: 200 },
    );
  }

  // Skip draft PRs
  if (data.pull_request.draft) {
    return NextResponse.json({ message: "Draft PR ignored" }, { status: 200 });
  }

  // Find the repository in our database
  const repository = await db.repository.findUnique({
    where: { githubId: data.repository.id },
    include: { user: true },
  });

  if (!repository) {
    return NextResponse.json(
      { message: "Repository not connected" },
      { status: 200 },
    );
  }

  // Check if there's already a review in progress
  const existingReview = await db.review.findFirst({
    where: {
      repositoryId: repository.id,
      prNumber: data.pull_request.number,
      status: { in: ["PENDING", "PROCESSING"] },
    },
  });

  if (existingReview) {
    return NextResponse.json(
      { message: "Review already in progress" },
      { status: 200 },
    );
  }

  // Create a new review record
  const review = await db.review.create({
    data: {
      repositoryId: repository.id,
      userId: repository.userId,
      prNumber: data.pull_request.number,
      prTitle: data.pull_request.title,
      prUrl: data.pull_request.html_url,
      status: "PENDING",
    },
  });

  // Trigger the Inngest job
  await inngest.send({
    name: "review/pr.requested",
    data: {
      reviewId: review.id,
      repositoryId: repository.id,
      prNumber: data.pull_request.number,
      userId: repository.userId,
    },
  });

  return NextResponse.json(
    { message: "Review triggered", reviewId: review.id },
    { status: 200 },
  );
}
