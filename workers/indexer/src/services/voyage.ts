import { logger } from "../lib/logger.ts";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const DEFAULT_MODEL = "voyage-code-3";
const DEFAULT_DIMENSIONS = 1024;
const DEFAULT_BATCH_SIZE = 32;
const MAX_RETRIES = 3;

export type VoyageConfig = {
  apiKey: string;
  model: string;
  dimensions: number;
  batchSize: number;
};

export function getVoyageConfig(): VoyageConfig {
  const apiKey = process.env.VOYAGE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing required environment variable: VOYAGE_API_KEY");
  }

  const batchSize = Number(process.env.VOYAGE_EMBED_BATCH_SIZE?.trim() || DEFAULT_BATCH_SIZE);
  return {
    apiKey,
    model: process.env.VOYAGE_EMBEDDING_MODEL?.trim() || DEFAULT_MODEL,
    dimensions: DEFAULT_DIMENSIONS,
    batchSize: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : DEFAULT_BATCH_SIZE,
  };
}

type VoyageEmbeddingResponse = {
  data: Array<{ embedding: number[]; index: number }>;
};

function chunkArray<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestEmbeddings(
  config: VoyageConfig,
  texts: string[],
): Promise<number[][]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(VOYAGE_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: texts,
          model: config.model,
          input_type: "document",
          output_dimension: config.dimensions,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Voyage API ${response.status}: ${body.slice(0, 500)}`);
      }

      const payload = (await response.json()) as VoyageEmbeddingResponse;
      const ordered = [...payload.data].sort((a, b) => a.index - b.index);
      return ordered.map((row) => row.embedding);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES - 1) {
        await sleep(500 * 2 ** attempt);
      }
    }
  }

  throw lastError ?? new Error("Voyage embedding request failed");
}

export async function embedDocuments(
  texts: string[],
  config: VoyageConfig = getVoyageConfig(),
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const embeddings: number[][] = [];
  const batches = chunkArray(texts, config.batchSize);

  for (const batch of batches) {
    const batchEmbeddings = await requestEmbeddings(config, batch);
    for (const vector of batchEmbeddings) {
      if (vector.length !== config.dimensions) {
        throw new Error(
          `Unexpected embedding dimension ${vector.length}; expected ${config.dimensions}`,
        );
      }
      embeddings.push(vector);
    }
  }

  logger.info("voyage: embedded documents", {
    model: config.model,
    count: texts.length,
    batches: batches.length,
  });

  return embeddings;
}
