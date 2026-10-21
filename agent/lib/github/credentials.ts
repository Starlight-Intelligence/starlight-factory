import { connectGitHubCredentials } from "@vercel/connect/eve";
import { onRailway } from "../platform.js";
import { selfManagedGitHubCredentials } from "./app-auth.js";

/**
 * Vercel Connect connector UID for the factory's GitHub App installation.
 *
 * @remarks
 * One connector serves every GitHub surface: the channel (webhooks, replies),
 * the `github` extension's tools, and the brokered git credential the station
 * sandboxes clone, fetch, and push with. The fallback is this template's own
 * connector UID; deployments set `GITHUB_CONNECTOR` to their own. Unused on
 * Railway, where the deployer's own GitHub App stands in for the connector.
 */
export const GITHUB_CONNECTOR =
  process.env.GITHUB_CONNECTOR ?? "github/foreman-agent";

/**
 * GitHub App credentials shared by the channel and the git helpers: brokered
 * by Connect on Vercel, self-managed on Railway (see `./app-auth.ts`).
 *
 * @remarks
 * Tokens are resolved lazily per use and never exposed to the model; the git
 * helpers inject them at the sandbox firewall (see
 * `agent/lib/github/git-remote.ts`), so they never enter the sandbox either.
 */
export const githubCredentials = onRailway
  ? selfManagedGitHubCredentials()
  : connectGitHubCredentials(GITHUB_CONNECTOR);
