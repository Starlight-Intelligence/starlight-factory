import {
  bucket,
  defineRailway,
  github,
  ref,
  service,
  volume,
} from "railway/iac";

/**
 * The whole Railway project for Starlight Factory: one service, a volume for
 * eve's workflow state, and a private bucket for the brain, preferences and
 * handoff artifacts. `railway config plan` previews it, `railway config apply`
 * creates it in the deployer's own account.
 *
 * @remarks
 * Secrets the deployer owns (the GitHub App, Vercel Sandbox, model keys) are
 * declared sealed and preserved, so applying the config never overwrites a
 * value someone set in the dashboard. The route password is generated once.
 * Build, start and health come from `railway.json`, so the two files can't
 * disagree.
 */

const deployerSecret = (description: string) => ({
  description,
  isSealed: true,
  preserveExisting: true,
});

const deployerSetting = (description: string, defaultValue?: string) => ({
  defaultValue,
  description,
  preserveExisting: true,
});

export default defineRailway((ctx, project) => {
  const workflowData = volume("factory-workflow-data", { sizeMB: 1024 });
  const store = bucket("factory-store");

  const factory = service("factory", {
    configFile: "railway.json",
    env: {
      AI_GATEWAY_API_KEY: deployerSecret(
        "Vercel AI Gateway key. Leave empty when MODEL_ROUTE=cloudflare or direct."
      ),
      FACTORY_PLATFORM: "railway",
      FACTORY_REPO: deployerSetting(
        "owner/repo the GitHub App is installed on."
      ),
      FACTORY_ROUTE_PASSWORD: {
        isSealed: true,
        preserveExisting: true,
        value: ctx.randomString("factory-route-password", 24),
      },
      GITHUB_APP_ID: deployerSecret("Your GitHub App's numeric id."),
      GITHUB_APP_PRIVATE_KEY: deployerSecret(
        "Your GitHub App's PEM private key."
      ),
      GITHUB_APP_SLUG: deployerSetting(
        "Your GitHub App's slug, the @mention name."
      ),
      GITHUB_WEBHOOK_SECRET: deployerSecret(
        "Your GitHub App's webhook secret."
      ),
      S3_ACCESS_KEY_ID: ref(store, "ACCESS_KEY_ID"),
      S3_BUCKET: ref(store, "BUCKET"),
      S3_ENDPOINT: ref(store, "ENDPOINT"),
      S3_REGION: ref(store, "REGION"),
      S3_SECRET_ACCESS_KEY: ref(store, "SECRET_ACCESS_KEY"),
      VERCEL_PROJECT_ID: deployerSetting(
        "Vercel project that owns the station sandboxes."
      ),
      VERCEL_TEAM_ID: deployerSetting("Vercel team that owns the project."),
      VERCEL_TOKEN: deployerSecret(
        "Vercel access token scoped to that team, for Vercel Sandbox only."
      ),
    },
    source: github("Starlight-Intelligence/starlight-factory", {
      branch: "main",
    }),
    volumeMounts: {
      "/app/.eve/.workflow-data": workflowData,
    },
  });

  return project("starlight-factory", {
    resources: [factory, workflowData, store],
  });
});
