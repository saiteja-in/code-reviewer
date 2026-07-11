const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const DEFAULT_MODEL = "voyage-code-3";
const DEFAULT_DIMENSIONS = 1024;
const MAX_RETRIES = 3;

type VoyageEmbeddingResponse = {
  data: Array<{ embedding: number[]; index: number }>;
};

function getApiKey(): string | null {
  return process.env.VOYAGE_API_KEY?.trim() || null;
}

function getModel(): string {
  return process.env.VOYAGE_EMBEDDING_MODEL?.trim() || DEFAULT_MODEL;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestEmbedding(
  text: string,
  inputType: "query" | "document",
): Promise<number[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("VOYAGE_API_KEY is not set");
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(VOYAGE_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: text,
          model: getModel(),
          input_type: inputType,
          output_dimension: DEFAULT_DIMENSIONS,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Voyage API ${response.status}: ${body.slice(0, 500)}`);
      }

      const payload = (await response.json()) as VoyageEmbeddingResponse;
      const vector = payload.data[0]?.embedding;
      if (!vector || vector.length !== DEFAULT_DIMENSIONS) {
        throw new Error("Voyage returned an invalid embedding vector");
      }
      return vector;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES - 1) {
        await sleep(500 * 2 ** attempt);
      }
    }
  }

  throw lastError ?? new Error("Voyage embedding request failed");
}

export function isVoyageConfigured(): boolean {
  return getApiKey() !== null;
}

export async function embedQuery(text: string): Promise<number[]> {
  return requestEmbedding(text, "query");
}
