import { pullRequestRouter } from "./routers/pull-request";
import { repositoryRouter } from "./routers/repository";
import { reviewRouter } from "./routers/review";
import { pingNeo4j } from "@/server/services/neo4j";
import { createCallerFactory,createTRPCRouter,publicProcedure } from "./trpc";

export const appRouter=createTRPCRouter({
    health:publicProcedure.query(async ()=>{
        const neo4j = await pingNeo4j();
        return {
            status:"ok",
            timestamps:Date.now(),
            neo4j: neo4j.ok
              ? { status: "ok" as const }
              : {
                  status: "error" as const,
                  configured: neo4j.configured,
                  error: neo4j.error,
                },
        };
    }),
    repository: repositoryRouter,
    pullRequest: pullRequestRouter,
    review: reviewRouter,
})

export type AppRouter=typeof appRouter;

export const createCaller = createCallerFactory(appRouter);