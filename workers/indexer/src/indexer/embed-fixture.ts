import { db } from "../db/client.ts";

const FIXTURE_USER_ID = "embed-fixture-user";
const FIXTURE_GITHUB_ID = 9_999_990_01;

export async function ensureEmbedFixtureRepository(
  repositoryId = process.env.EMBED_FIXTURE_REPO_ID?.trim() || "embed-fixture-repo",
): Promise<string> {
  await db.user.upsert({
    where: { id: FIXTURE_USER_ID },
    create: {
      id: FIXTURE_USER_ID,
      name: "Embed Fixture User",
      email: "embed-fixture@local.test",
    },
    update: {},
  });

  const repository = await db.repository.upsert({
    where: { githubId: FIXTURE_GITHUB_ID },
    create: {
      id: repositoryId,
      userId: FIXTURE_USER_ID,
      githubId: FIXTURE_GITHUB_ID,
      name: "embed-fixture",
      fullName: "test/embed-fixture",
      htmlUrl: "https://github.com/test/embed-fixture",
    },
    update: {},
  });

  return repository.id;
}
