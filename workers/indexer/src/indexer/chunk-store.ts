import { randomUUID } from "node:crypto";
import { db } from "../db/client.ts";
import { logger } from "../lib/logger.ts";
import type { SourceChunk } from "./chunk.ts";

const INSERT_BATCH_SIZE = 50;

export type ChunkWithEmbedding = SourceChunk & {
  embedding: number[];
};

function toPgVector(values: number[]): string {
  return `[${values.join(",")}]`;
}

export async function deleteFileChunksForRepository(
  repositoryId: string,
): Promise<number> {
  const deleted = await db.$executeRaw`
    DELETE FROM "FileChunk"
    WHERE "repositoryId" = ${repositoryId}
  `;
  return Number(deleted);
}

async function insertChunkRow(
  tx: Pick<typeof db, "$executeRawUnsafe">,
  repositoryId: string,
  commitSha: string,
  row: ChunkWithEmbedding,
): Promise<void> {
  await tx.$executeRawUnsafe(
    `INSERT INTO "FileChunk" (
       id,
       "repositoryId",
       path,
       symbol,
       "startLine",
       "endLine",
       content,
       embedding,
       "commitSha",
       "createdAt"
     ) VALUES (
       $1::text,
       $2::text,
       $3::text,
       $4::text,
       $5::int,
       $6::int,
       $7::text,
       $8::vector,
       $9::text,
       NOW()
     )`,
    randomUUID(),
    repositoryId,
    row.path,
    row.symbol,
    row.startLine,
    row.endLine,
    row.content,
    toPgVector(row.embedding),
    commitSha,
  );
}

export async function replaceFileChunks(
  repositoryId: string,
  commitSha: string,
  chunks: ChunkWithEmbedding[],
): Promise<number> {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`
      DELETE FROM "FileChunk"
      WHERE "repositoryId" = ${repositoryId}
    `;

    for (let i = 0; i < chunks.length; i += INSERT_BATCH_SIZE) {
      const batch = chunks.slice(i, i + INSERT_BATCH_SIZE);
      for (const row of batch) {
        await insertChunkRow(tx, repositoryId, commitSha, row);
      }
    }
  });

  logger.info("chunk-store: replaced file chunks", {
    repositoryId,
    commitSha,
    chunksWritten: chunks.length,
  });

  return chunks.length;
}

export async function countFileChunks(repositoryId: string): Promise<number> {
  const rows = await db.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "FileChunk"
    WHERE "repositoryId" = ${repositoryId}
  `;
  return Number(rows[0]?.count ?? 0);
}
