import { headers } from "next/headers";
import { createCaller } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";

/**
 * Server-side tRPC caller for React Server Components.
 *
 * Builds the same context (`db`, `session`) the HTTP route uses, then invokes
 * procedures in-process — no fetch round-trip. Use this in Server Components to
 * read data on the server (e.g. `(await getServerApi()).repository.list()`).
 *
 * Importing `next/headers` makes this module server-only; importing it from a
 * Client Component is a build error.
 */
export const getServerApi = async () =>
  createCaller(await createTRPCContext({ headers: await headers() }));
