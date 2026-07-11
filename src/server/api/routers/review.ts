import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  fetchPullRequest,
  getGitHubAccessToken,
} from "@/server/services/github";
import { GITHUB_APP_INSTALLATION_REQUIRED } from "@/server/services/github-app";
import {
  isRepositoryIndexedForCommit,
  schedulePrReview,
} from "@/server/services/graph-review-after-index";
import {
  parseOwnerRepo,
  requestRepoIndex,
} from "@/server/services/github-webhook-index";
import { queueReviewJob } from "@/server/services/review-queue";
import { resolveReviewMode } from "@/server/services/review-mode";

export const reviewRouter = createTRPCRouter({
  trigger: protectedProcedure
    .input(
      z.object({
        repositoryId: z.string(),
        prNumber: z.number(),
        /** Override REVIEW_MODE env for A/B runs (diff vs graph on same commit). */
        mode: z.enum(["diff", "graph"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const repository = await ctx.db.repository.findUnique({
        where: { id: input.repositoryId, userId: ctx.user.id },
        include: { installation: true },
      });

      if (!repository) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Repository not found",
        });
      }

      const accessToken = await getGitHubAccessToken(ctx.user.id);
      if (!accessToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "GitHub account not connected",
        });
      }

      const names = parseOwnerRepo(repository.fullName);
      if (!names) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid repository name",
        });
      }

      const pr = await fetchPullRequest(
        accessToken,
        names.owner,
        names.repo,
        input.prNumber,
      );

      const installationId = repository.installation?.installationId
        ? Number(repository.installation.installationId)
        : null;

      if (!installationId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: GITHUB_APP_INSTALLATION_REQUIRED,
        });
      }

      const mode = resolveReviewMode(input.mode);

      const indexResult =
        mode === "graph"
          ? await requestRepoIndex({
              repositoryId: repository.id,
              installationId,
              owner: names.owner,
              repo: names.repo,
              headSha: pr.head.sha,
              branch: pr.head.ref,
            })
          : null;

      const scheduled = await schedulePrReview({
        repositoryId: repository.id,
        userId: ctx.user.id,
        prNumber: pr.number,
        prTitle: pr.title,
        prUrl: pr.html_url,
        headSha: pr.head.sha,
        mode,
        installationId,
        indexResult,
      });

      return {
        reviewId: scheduled.reviewId,
        reviewQueued: scheduled.reviewQueued,
        message: scheduled.message,
      };
    }),
  requeue: protectedProcedure
    .input(z.object({ reviewId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const review = await ctx.db.review.findUnique({
        where: { id: input.reviewId, userId: ctx.user.id },
        include: { repository: { include: { installation: true } } },
      });

      if (!review) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Review not found",
        });
      }

      if (review.status !== "PENDING") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only queued reviews can be retried",
        });
      }

      const installationId = review.repository.installation?.installationId
        ? Number(review.repository.installation.installationId)
        : null;

      if (!installationId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: GITHUB_APP_INSTALLATION_REQUIRED,
        });
      }

      if (!review.headSha) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Review is missing head commit SHA",
        });
      }

      const mode = resolveReviewMode(review.mode);
      if (mode === "graph") {
        const indexReady = await isRepositoryIndexedForCommit(
          review.repositoryId,
          review.headSha,
        );
        if (!indexReady) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Repository index is not ready yet — review starts automatically after indexing",
          });
        }
      }

      await queueReviewJob({
        reviewId: review.id,
        repositoryId: review.repositoryId,
        prNumber: review.prNumber,
        userId: review.userId,
        headSha: review.headSha,
        mode,
        installationId,
      });

      return { reviewId: review.id };
    }),
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const review = await ctx.db.review.findUnique({
        where: { id: input.id, userId: ctx.user.id },
        include: { repository: true },
      });

      if (!review) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Review not found",
        });
      }

      return review;
    }),
  list: protectedProcedure
    .input(
      z.object({
        repositoryId: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const reviews = await ctx.db.review.findMany({
        where: {
          userId: ctx.user.id,
          ...(input.repositoryId && { repositoryId: input.repositoryId }),
        },
        include: { repository: true },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });

      return reviews;
    }),
  getLatestForPR: protectedProcedure
    .input(
      z.object({
        repositoryId: z.string(),
        prNumber: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const review = await ctx.db.review.findFirst({
        where: {
          repositoryId: input.repositoryId,
          prNumber: input.prNumber,
          userId: ctx.user.id,
        },
        orderBy: { createdAt: "desc" },
      });

      return review;
    }),
});
