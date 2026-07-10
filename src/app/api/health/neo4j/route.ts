import { NextResponse } from "next/server";
import { pingNeo4j } from "@/server/services/neo4j";

/** GET /api/health/neo4j — Bolt connectivity probe (Step 5). */
export async function GET() {
  const result = await pingNeo4j();

  if (result.ok) {
    return NextResponse.json({ status: "ok", neo4j: "connected" });
  }

  return NextResponse.json(
    {
      status: "error",
      neo4j: result.configured ? "unreachable" : "not_configured",
      error: result.error,
    },
    { status: result.configured ? 503 : 503 },
  );
}
