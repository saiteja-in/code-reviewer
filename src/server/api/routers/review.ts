import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { inngest } from "@/server/inngest";
import { GITHUB_APP_INSTALLATION_REQUIRED } from "@/server/services/github-app";
import {
  fetchPullRequest,
  getGitHubAccessToken,
} from "@/server/services/github";

export const reviewRouter = createTRPCRouter({
  trigger: protectedProcedure
    .input(
      z.object({
        repositoryId: z.string(),
        prNumber: z.number(),
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

      const installationId = repository.installation?.installationId
        ? Number(repository.installation.installationId)
        : null;

      if (!installationId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: GITHUB_APP_INSTALLATION_REQUIRED,
        });
      }

      const accessToken = await getGitHubAccessToken(ctx.user.id);
      if (!accessToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "GitHub account not connected",
        });
      }

      const [owner, repo] = repository.fullName.split("/");
      if (!owner || !repo) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid repository name",
        });
      }

      let pr;
      try {
        pr = await fetchPullRequest(
          accessToken,
          owner,
          repo,
          input.prNumber,
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to fetch pull request";
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `GitHub API: ${message}`,
          cause: err,
        });
      }

      const review = await ctx.db.review.create({
        data: {
          repositoryId: repository.id,
          userId: ctx.user.id,
          prNumber: pr.number,
          prTitle: pr.title,
          prUrl: pr.html_url,
          status: "PENDING",
        },
      });

      try {
        await inngest.send({
          name: "review/pr.requested",
          data: {
            reviewId: review.id,
            repositoryId: repository.id,
            prNumber: pr.number,
            userId: ctx.user.id,
            installationId,
          },
        });
      } catch (err) {
        const raw =
          err instanceof Error ? err.message : "Failed to queue review job";
        const inngestDev = process.env.INNGEST_DEV === "1";
        const hint = inngestDev
          ? " INNGEST_DEV=1 is set — remove it in production and configure INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY."
          : !process.env.INNGEST_EVENT_KEY
            ? " Set INNGEST_EVENT_KEY in production (Inngest dashboard → Event Keys)."
            : "";
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Inngest: ${raw}.${hint}`,
          cause: err,
        });
      }

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
