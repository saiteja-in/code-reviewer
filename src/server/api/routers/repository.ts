import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { inngest } from "@/server/inngest";
import { removeRepoWebhookBestEffort } from "@/server/inngest/functions/register-repo-webhook";
import {
  fetchGitHubRepos,
  getGitHubAccessToken,
} from "@/server/services/github";

export const repositoryRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const repositories = await ctx.db.repository.findMany({
      where: { userId: ctx.user.id },
      orderBy: { createdAt: "desc" },
    });
    return repositories;
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const repository = await ctx.db.repository.findUnique({
        where: { id: input.id, userId: ctx.user.id },
      });

      if (!repository) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Repository not found",
        });
      }

      return repository;
    }),

  fetchFromGithub: protectedProcedure.query(async ({ ctx }) => {
    const accessToken = await getGitHubAccessToken(ctx.user.id);

    if (!accessToken) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "User has not authorized GitHub access",
      });
    }

    const repos = await fetchGitHubRepos(accessToken);
    return repos.map((repo) => ({
      githubId: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      private: repo.private,
      htmlUrl: repo.html_url,
      description: repo.description,
      language: repo.language,
      stars: repo.stargazers_count,
      updatedAt: repo.updated_at,
    }));
  }),

  connect: protectedProcedure
    .input(
      z.object({
        repos: z.array(
          z.object({
            githubId: z.number(),
            name: z.string(),
            fullName: z.string(),
            private: z.boolean(),
            htmlUrl: z.string(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await Promise.all(
        input.repos.map((repo) =>
          ctx.db.repository.upsert({
            where: { githubId: repo.githubId },
            create: {
              userId: ctx.user.id,
              githubId: repo.githubId,
              name: repo.name,
              fullName: repo.fullName,
              private: repo.private,
              htmlUrl: repo.htmlUrl,
            },
            update: {
              name: repo.name,
              fullName: repo.fullName,
              private: repo.private,
              htmlUrl: repo.htmlUrl,
              updatedAt: new Date(),
            },
          }),
        ),
      );

      await Promise.all(
        result.map((repository) =>
          inngest.send({
            name: "repo/connected",
            data: {
              repositoryId: repository.id,
              userId: ctx.user.id,
            },
          }),
        ),
      );

      return { connected: result.length };
    }),

  disconnect: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const repository = await ctx.db.repository.findUnique({
        where: { id: input.id, userId: ctx.user.id },
      });

      if (!repository) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Repository not found",
        });
      }

      const accessToken = await getGitHubAccessToken(ctx.user.id);
      if (accessToken && repository.webhookId) {
        await removeRepoWebhookBestEffort(
          accessToken,
          repository.fullName,
          repository.webhookId,
        );
      }

      await ctx.db.repository.delete({
        where: { id: input.id, userId: ctx.user.id },
      });
      return { success: true };
    }),
});
