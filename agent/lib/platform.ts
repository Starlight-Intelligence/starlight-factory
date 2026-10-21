/**
 * The host the factory runs on: `vercel` (the upstream template, credentials brokered by
 * Vercel Connect, storage in Vercel Blob, route auth by Vercel OIDC) or `railway` (a
 * self-managed GitHub App, an S3-compatible Railway Bucket, and HTTP Basic route auth).
 *
 * @remarks
 * Chosen explicitly through `FACTORY_PLATFORM` rather than inferred from whichever
 * variables happen to be set, so a half-configured deployment fails at discovery instead
 * of silently mixing two credential models. Sandboxes are the same on both hosts: Vercel
 * Sandbox, which a Railway deployment reaches with `VERCEL_TOKEN`, `VERCEL_TEAM_ID` and
 * `VERCEL_PROJECT_ID`, because the station git helpers need its egress firewall to keep
 * the installation token out of the sandbox.
 */
const PLATFORMS = ["vercel", "railway"] as const;

export type FactoryPlatform = (typeof PLATFORMS)[number];

const parsePlatform = (value: string | undefined): FactoryPlatform => {
  if (value === undefined || value === "") {
    return "vercel";
  }
  if ((PLATFORMS as readonly string[]).includes(value)) {
    return value as FactoryPlatform;
  }
  throw new Error(
    `FACTORY_PLATFORM must be one of ${PLATFORMS.join(", ")}, got '${value}'.`
  );
};

export const FACTORY_PLATFORM = parsePlatform(process.env.FACTORY_PLATFORM);

export const onRailway = FACTORY_PLATFORM === "railway";
