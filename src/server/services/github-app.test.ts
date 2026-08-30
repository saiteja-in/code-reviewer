import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parsePrivateKey,
  requireInstallationAccessToken,
  GitHubAppInstallationError,
  GITHUB_APP_INSTALLATION_REQUIRED,
} from "./github-app.ts";

describe("parsePrivateKey", () => {
  it("expands \\n escapes from .env", () => {
    const raw = "-----BEGIN RSA PRIVATE KEY-----\\nline2\\n-----END RSA PRIVATE KEY-----";
    const pem = parsePrivateKey(raw);
    assert.ok(pem.includes("\nline2\n"));
    assert.ok(!pem.includes("\\n"));
  });

  it("returns trimmed PEM unchanged when already multiline", () => {
    const raw = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n";
    assert.equal(parsePrivateKey(raw), raw.trim());
  });
});

describe("requireInstallationAccessToken", () => {
  it("throws when installation id is missing", async () => {
    await assert.rejects(
      () => requireInstallationAccessToken(null),
      (err: unknown) => {
        assert.ok(err instanceof GitHubAppInstallationError);
        assert.equal(err.message, GITHUB_APP_INSTALLATION_REQUIRED);
        return true;
      },
    );
  });
});
