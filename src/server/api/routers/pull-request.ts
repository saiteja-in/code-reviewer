import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { ReviewStatus } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  fetchPullRequestsGraphQL,
  fetchPullRequest,
  getGitHubAccessToken,
  fetchPullRequestFiles,
  type PullRequestSummary,
} from "@/server/services/github";

/** Plain DTO so tRPC `inferRouterOutputs` does not collapse Prisma payloads to `{}`. */
export type PullRequestListReview = {
  prNumber: number;
  status: ReviewStatus;
  createdAt: Date;
};

export type PullRequestListItem = PullRequestSummary & {
  review: PullRequestListReview | null;
};

export const pullRequestRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ repositoryId: z.string() }))
    .query(async ({ ctx, input }): Promise<PullRequestListItem[]> => {
      const repository = await ctx.db.repository.findUnique({
        where: { id: input.repositoryId, userId: ctx.user.id },
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
          message: "Github account not connected",
        });
      }

      const [owner, repo] = repository.fullName.split("/");
      if (!owner || !repo) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid repository name",
        });
      }

      // One GraphQL call returns all PRs with their additions/deletions/
      // changedFiles. The client filters open/closed/all from this set.
      const prs = await fetchPullRequestsGraphQL(accessToken, owner, repo);

      const existingReviews = await ctx.db.review.findMany({
        where: {
          repositoryId: repository.id,
          prNumber: { in: prs.map((pr) => pr.number) },
        },
        select: {
          prNumber: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });

      const reviewMap = new Map(
        existingReviews.map((r) => [
          r.prNumber,
          {
            prNumber: r.prNumber,
            status: r.status,
            createdAt: r.createdAt,
          } satisfies PullRequestListReview,
        ]),
      );

      return prs.map((pr) => ({
        ...pr,
        review: reviewMap.get(pr.number) ?? null,
      }));
    }),

  get: protectedProcedure
    .input(
      z.object({
        repositoryId: z.string(),
        prNumber: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const repository = await ctx.db.repository.findUnique({
        where: { id: input.repositoryId, userId: ctx.user.id },
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

      const [owner, repo] = repository.fullName.split("/");
      if (!owner || !repo) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid repository name",
        });
      }

      const pr = await fetchPullRequest(
        accessToken,
        owner,
        repo,
        input.prNumber,
      );

      const existingReview = await ctx.db.review.findFirst({
        where: {
          repositoryId: repository.id,
          prNumber: pr.number,
        },
        orderBy: { createdAt: "desc" },
      });

      return {
        id: pr.id,
        number: pr.number,
        title: pr.title,
        state: pr.state,
        draft: pr.draft,
        htmlUrl: pr.html_url,
        author: {
          login: pr.user.login,
          avatarUrl: pr.user.avatar_url,
        },
        headRef: pr.head.ref,
        headSha: pr.head.sha,
        baseRef: pr.base.ref,
        additions: pr.additions,
        deletions: pr.deletions,
        changedFiles: pr.changed_files,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        mergedAt: pr.merged_at,
        review: existingReview,
      };
    }),
    
    files: protectedProcedure
    .input(
      z.object({
        repositoryId: z.string(),
        prNumber: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const repository = await ctx.db.repository.findUnique({
        where: { id: input.repositoryId, userId: ctx.user.id },
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

      const [owner, repo] = repository.fullName.split("/");
      if (!owner || !repo) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid repository name",
        });
      }

      const files = await fetchPullRequestFiles(
        accessToken,
        owner,
        repo,
        input.prNumber,
      );

      return files.map((file) => ({
        sha: file.sha,
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: file.patch,
        previousFilename: file.previous_filename,
      }));
    }),
});
