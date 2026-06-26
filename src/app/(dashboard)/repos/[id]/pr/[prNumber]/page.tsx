import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { getServerApi } from "@/lib/trpc/server";
import { PrHeader } from "./_components/pr-header";
import { PrFilesTabs } from "./_components/pr-files-tabs";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; prNumber: string }>;
}): Promise<Metadata> {
  const { prNumber } = await params;
  return { title: `Pull Request #${prNumber}` };
}

export default async function PullRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string; prNumber: string }>;
}) {
  const { id, prNumber } = await params;
  const prNum = Number(prNumber);
  console.log("pr num",prNum)

  if (!Number.isInteger(prNum)) {
    notFound();
  }

  const api = await getServerApi();
  const pr = await api.pullRequest
    .get({ repositoryId: id, prNumber: prNum })
    .catch((error) => {
      if (error instanceof TRPCError && error.code === "NOT_FOUND") {
        notFound();
      }
      throw error;
    });
  console.log("pr is ",pr)

  // Seed the Reviews tab so it renders server-side; the island then polls.
  const initialLatestReview = await api.review.getLatestForPR({
    repositoryId: id,
    prNumber: prNum,
  });

  return (
    <div className="space-y-8">
      <PrHeader pr={pr} repositoryId={id} />
      <PrFilesTabs
        repositoryId={id}
        prNumber={prNum}
        initialLatestReview={initialLatestReview}
      />
    </div>
  );
}
