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
 * eve's workflow state, and a private bucket for the brain, preferences,
 * handoff artifacts and delivery claims. `railway config plan` previews it,
 * `railway config apply` creates it in the deployer's own account.
 *
 * @remarks
 * Every variable the factory reads is declared here, because `apply`
 * reconciles the service's variables against this list and would propose
 * deleting one that is missing. Values the deployer owns are declared
 * preserved, so `apply` never overwrites or removes what someone set in the
 * dashboard; secrets are also sealed. Nothing secret is generated here:
 * `ctx.randomString` is derived from the environment name, not from entropy,
 * so the route password comes from `scripts/create-github-app.mjs` instead.
 * Build, start and health come from `railway.json`, so the two files can't
 * disagree.
 */

const secret = (description: string) => ({
  description,
  isSealed: true,
  preserveExisting: true,
});

const optionalSecret = (description: string) => ({
  ...secret(description),
  isOptional: true,
});

const setting = (description: string, defaultValue?: string) => ({
  defaultValue,
  description,
  preserveExisting: true,
});

const optionalSetting = (description: string, defaultValue?: string) => ({
  ...setting(description, defaultValue),
  isOptional: true,
});

export default defineRailway((_ctx, project) => {
  const workflowData = volume("factory-workflow-data", { sizeMB: 1024 });
  const store = bucket("factory-store");

  const factory = service("factory", {
    configFile: "railway.json",
    env: {
      AI_GATEWAY_API_KEY: optionalSecret(
        "Vercel AI Gateway key, for MODEL_ROUTE=vercel-gateway."
      ),
      ANTHROPIC_API_KEY: optionalSecret(
        "Anthropic key, for MODEL_ROUTE=cloudflare or direct."
      ),
      CF_AIG_TOKEN: optionalSecret(
        "Cloudflare AI Gateway token, when the gateway requires authentication."
      ),
      CLOUDFLARE_ACCOUNT_ID: optionalSetting(
        "Cloudflare account id, for MODEL_ROUTE=cloudflare."
      ),
      CLOUDFLARE_AI_GATEWAY: optionalSetting(
        "Cloudflare AI Gateway name, for MODEL_ROUTE=cloudflare."
      ),
      FACTORY_BOT_NAME: optionalSetting(
        "Override for the @mention name; defaults to GITHUB_APP_SLUG."
      ),
      FACTORY_BRANCH_PREFIX: optionalSetting(
        "Prefix of the factory's own branches.",
        "factory/"
      ),
      FACTORY_LABEL: optionalSetting(
        "Label that hands an issue to the factory.",
        "factory"
      ),
      FACTORY_PLATFORM: "railway",
      FACTORY_REPO: setting("owner/repo the GitHub App is installed on."),
      FACTORY_ROUTE_PASSWORD: secret(
        "Basic-auth password for /eve/; scripts/create-github-app.mjs generates one."
      ),
      FACTORY_ROUTE_USER: optionalSetting(
        "Basic-auth user for /eve/.",
        "factory"
      ),
      FACTORY_SETUP_COMMAND: optionalSetting(
        "Runs in each station's checkout, e.g. pnpm install."
      ),
      GITHUB_APP_ID: secret("Your GitHub App's numeric id."),
      GITHUB_APP_PRIVATE_KEY: secret("Your GitHub App's PEM private key."),
      GITHUB_APP_SLUG: setting("Your GitHub App's slug, the @mention name."),
      GITHUB_WEBHOOK_SECRET: secret("Your GitHub App's webhook secret."),
      LINEAR_AGENT_ACCESS_TOKEN: optionalSecret(
        "Your Linear app's token, to take Linear Agent Sessions."
      ),
      LINEAR_WEBHOOK_SECRET: optionalSecret(
        "Your Linear app's webhook signing secret."
      ),
      MODEL_ROUTE: optionalSetting(
        "vercel-gateway, cloudflare or direct.",
        "vercel-gateway"
      ),
      OPENAI_API_KEY: optionalSecret(
        "OpenAI key, for MODEL_ROUTE=cloudflare or direct."
      ),
      S3_ACCESS_KEY_ID: ref(store, "ACCESS_KEY_ID"),
      S3_BUCKET: ref(store, "BUCKET"),
      S3_ENDPOINT: ref(store, "ENDPOINT"),
      S3_FORCE_PATH_STYLE: optionalSetting(
        "true only for buckets that show path-style URLs.",
        "false"
      ),
      S3_REGION: ref(store, "REGION"),
      S3_SECRET_ACCESS_KEY: ref(store, "SECRET_ACCESS_KEY"),
      VERCEL_PROJECT_ID: setting(
        "Vercel project that owns the station sandboxes."
      ),
      VERCEL_TEAM_ID: setting("Vercel team that owns the project."),
      VERCEL_TOKEN: secret(
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
