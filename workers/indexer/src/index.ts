import "dotenv/config";
import neo4j from "neo4j-driver";
import pg from "pg";

const { Client } = pg;

async function probePostgres(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query("SELECT 1 AS n");
    if (result.rows[0]?.n !== 1) {
      throw new Error("Unexpected Postgres probe result");
    }
    console.log("indexer-worker: postgres ok");
  } finally {
    await client.end();
  }
}

async function probeNeo4j(): Promise<void> {
  const uri = process.env.NEO4J_URI;
  const password = process.env.NEO4J_PASSWORD;
  if (!uri || !password) {
    throw new Error("NEO4J_URI and NEO4J_PASSWORD are required");
  }

  const user = process.env.NEO4J_USER?.trim() || "neo4j";
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  try {
    await driver.verifyConnectivity();
    console.log("indexer-worker: neo4j ok");
  } finally {
    await driver.close();
  }
}

async function main(): Promise<void> {
  const workspace = process.env.INDEXER_WORKSPACE_DIR ?? "/tmp/repos";
  console.log("indexer-worker: starting…");
  console.log(`indexer-worker: workspace=${workspace}`);

  await probePostgres();
  await probeNeo4j();

  console.log("indexer-worker: ready");
  console.log(
    "indexer-worker: Inngest Connect + index-repo function — Step 13",
  );

  // Keep container alive until Step 13 registers Inngest Connect.
  await new Promise(() => {});
}

main().catch((err) => {
  console.error("indexer-worker: fatal", err);
  process.exit(1);
});
