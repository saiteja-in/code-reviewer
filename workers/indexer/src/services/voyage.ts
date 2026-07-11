import { logger } from "../lib/logger.ts";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const DEFAULT_MODEL = "voyage-code-3";
const DEFAULT_DIMENSIONS = 1024;
const DEFAULT_BATCH_SIZE = 32;
const MAX_RETRIES = 3;
/** Minimum wait when Voyage returns 429 (3 RPM free tier ≈ one request per 20s). */
const RATE_LIMIT_MIN_WAIT_MS = 20_000;
const RATE_LIMIT_MAX_RETRIES = 10;

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

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) {
    return null;
  }

  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return Math.max(seconds * 1000, 1000);
  }

  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) {
    return Math.max(dateMs - Date.now(), 1000);
  }

  return null;
}

function getBatchDelayMs(): number {
  const value = Number(process.env.VOYAGE_EMBED_BATCH_DELAY_MS?.trim() || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

async function requestEmbeddings(
  config: VoyageConfig,
  texts: string[],
): Promise<number[][]> {
  let lastError: Error | null = null;
  let rateLimitAttempts = 0;

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

      if (response.status === 429) {
        rateLimitAttempts += 1;
        const body = await response.text();
        lastError = new Error(`Voyage API 429: ${body.slice(0, 500)}`);

        if (rateLimitAttempts >= RATE_LIMIT_MAX_RETRIES) {
          throw lastError;
        }

        const waitMs = retryAfterMs(response) ?? RATE_LIMIT_MIN_WAIT_MS;
        logger.warn("voyage: rate limited, waiting before retry", {
          waitMs,
          rateLimitAttempt: rateLimitAttempts,
          maxRateLimitRetries: RATE_LIMIT_MAX_RETRIES,
        });
        await sleep(waitMs);
        attempt -= 1;
        continue;
      }

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
  const batchDelayMs = getBatchDelayMs();

  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i]!;
    const batchEmbeddings = await requestEmbeddings(config, batch);
    for (const vector of batchEmbeddings) {
      if (vector.length !== config.dimensions) {
        throw new Error(
          `Unexpected embedding dimension ${vector.length}; expected ${config.dimensions}`,
        );
      }
      embeddings.push(vector);
    }

    if (batchDelayMs > 0 && i < batches.length - 1) {
      await sleep(batchDelayMs);
    }
  }

  logger.info("voyage: embedded documents", {
    model: config.model,
    count: texts.length,
    batches: batches.length,
  });

  return embeddings;
}
