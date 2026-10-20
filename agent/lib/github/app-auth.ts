import { createSign } from "node:crypto";
import type { GitHubChannelCredentials } from "eve/channels/github";
import { factoryRepo, requireEnv } from "../constants.js";

/**
 * Self-managed GitHub App credentials, for hosts without Vercel Connect.
 *
 * @remarks
 * The deployer registers their own GitHub App and sets `GITHUB_APP_ID`,
 * `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET` and `GITHUB_APP_SLUG`.
 * Every surface still sees one `GitHubChannelCredentials` value, so the
 * channel, the `github` extension and the station git helpers keep the shape
 * they have under Connect: the installation token is resolved lazily, never
 * exposed to the model, and injected at the sandbox firewall by the git
 * helpers.
 *
 * Tokens are minted for the installation that covers `FACTORY_REPO` and
 * narrowed to that one repository, so a leaked token reaches nothing else
 * the app happens to be installed on.
 */

const GITHUB_API = "https://api.github.com";

// GitHub caps App JWTs at 10 minutes; backdating `iat` absorbs clock drift.
const JWT_BACKDATE_SECONDS = 60;
const JWT_LIFETIME_SECONDS = 9 * 60;

// Re-mint this long before GitHub's reported expiry, so a token never dies mid-clone.
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

const base64Url = (input: string | Buffer): string =>
  Buffer.from(input).toString("base64url");

/** Hosted platforms often store a PEM with literal `\n` sequences; restore real newlines. */
const normalizePrivateKey = (key: string): string =>
  key.includes("\\n") ? key.replaceAll("\\n", "\n") : key;

const appJwt = (): string => {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      exp: now + JWT_LIFETIME_SECONDS,
      iat: now - JWT_BACKDATE_SECONDS,
      iss: requireEnv("GITHUB_APP_ID", "123456"),
    })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(
    normalizePrivateKey(
      requireEnv("GITHUB_APP_PRIVATE_KEY", "the app's PEM private key")
    )
  );
  return `${header}.${payload}.${base64Url(signature)}`;
};

const githubAppRequest = async <T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<T> => {
  const response = await fetch(`${GITHUB_API}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${appJwt()}`,
      "x-github-api-version": "2022-11-28",
    },
    method,
  });
  if (!response.ok) {
    throw new Error(
      `GitHub App request ${method} ${path} failed with ${response.status}. Check that the app is installed on ${factoryRepo.owner}/${factoryRepo.repo} and that GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY belong to the same app.`
    );
  }
  return (await response.json()) as T;
};

interface CachedToken {
  readonly expiresAt: number;
  readonly token: string;
}

let cached: CachedToken | undefined;
let inflight: Promise<string> | undefined;

const mintRepositoryToken = async (): Promise<string> => {
  const installation = await githubAppRequest<{ id: number }>(
    "GET",
    `/repos/${factoryRepo.owner}/${factoryRepo.repo}/installation`
  );
  const minted = await githubAppRequest<{ expires_at: string; token: string }>(
    "POST",
    `/app/installations/${installation.id}/access_tokens`,
    { repositories: [factoryRepo.repo] }
  );
  cached = {
    expiresAt: Date.parse(minted.expires_at),
    token: minted.token,
  };
  return minted.token;
};

/**
 * Returns a cached installation token for `FACTORY_REPO`, minting a fresh one
 * when the cache is empty or close to expiry. Concurrent callers share one
 * mint.
 */
export const installationToken = (): Promise<string> => {
  if (cached && cached.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) {
    return Promise.resolve(cached.token);
  }
  inflight ??= mintRepositoryToken().finally(() => {
    inflight = undefined;
  });
  return inflight;
};

/**
 * Channel credentials backed by the self-managed app. Webhooks are verified
 * with `GITHUB_WEBHOOK_SECRET`; the slug becomes the channel's mention name.
 */
export const selfManagedGitHubCredentials = (): GitHubChannelCredentials => ({
  appSlug: () => requireEnv("GITHUB_APP_SLUG", "starlight-factory"),
  installationToken,
  webhookSecret: () =>
    requireEnv("GITHUB_WEBHOOK_SECRET", "a long random string"),
});
