import { runWrite } from "../db/neo4j.ts";
import { logger } from "../lib/logger.ts";

export async function purgeGraphForRepository(repositoryId: string): Promise<number> {
  await runWrite(
    `
      MATCH (n {repoId: $repoId})
      DETACH DELETE n
    `,
    { repoId: repositoryId },
  );

  logger.info("graph-purge: repository cleared", { repositoryId });
  return 1;
}

export async function purgeGraphForPaths(
  repositoryId: string,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) {
    return;
  }

  await runWrite(
    `
      MATCH (n {repoId: $repoId})
      WHERE n.path IN $paths
      DETACH DELETE n
    `,
    { repoId: repositoryId, paths },
  );

  logger.info("graph-purge: paths cleared", {
    repositoryId,
    pathCount: paths.length,
  });
}
