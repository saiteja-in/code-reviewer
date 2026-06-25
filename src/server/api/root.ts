import { pullRequestRouter } from "./routers/pull-request";
import { repositoryRouter } from "./routers/repository";
import { createCallerFactory,createTRPCRouter,publicProcedure } from "./trpc";

export const appRouter=createTRPCRouter({
    health:publicProcedure.query(()=>{
        return {status:"ok",timestamps:Date.now()}
    }),
    repository: repositoryRouter,
    pullRequest: pullRequestRouter,
})

export type AppRouter=typeof appRouter;

export const createCaller = createCallerFactory(appRouter);