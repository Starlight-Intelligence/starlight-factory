import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { requireEnv } from "./constants.js";

// One place to change every agent's model. Ids are Vercel AI Gateway strings (<provider>/<model>);
// each agent.ts reads its entry here (model: MODELS.<agent>) instead of hardcoding a string.
const GATEWAY_IDS = {
  analyst: "openai/gpt-5.6-terra-fast",
  classifier: "openai/gpt-5.6-terra-fast",
  implementer: "anthropic/claude-fable-5", // the station that writes the code gets the strongest coding model
  orchestrator: "openai/gpt-5.6-terra-fast",
  researcher: "openai/gpt-5.6-terra-fast",
  reviewer: "openai/gpt-5.6-terra-fast", // different vendor than implementer on purpose: independent review
} as const;

export type FactoryAgent = keyof typeof GATEWAY_IDS;

/**
 * How model calls leave the factory, chosen with `MODEL_ROUTE`:
 *
 * - `vercel-gateway` (default): the gateway strings above, through the Vercel AI Gateway.
 * - `cloudflare`: the same vendors' own APIs through a Cloudflare AI Gateway, which logs, caches,
 *   rate-limits and retries every call in one place for both vendors. Needs
 *   `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_GATEWAY` and the vendor keys; `CF_AIG_TOKEN` when the
 *   gateway has authentication on.
 * - `direct`: the vendors' own APIs with the deployer's keys and nothing in between.
 *
 * The non-gateway routes strip the `<provider>/` prefix to get the vendor's model id, and the
 * deployer's `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` pay for the calls: the factory never holds
 * a shared key.
 */
const ROUTES = ["vercel-gateway", "cloudflare", "direct"] as const;
type ModelRoute = (typeof ROUTES)[number];

const parseRoute = (value: string | undefined): ModelRoute => {
  if (value === undefined || value === "") {
    return "vercel-gateway";
  }
  if ((ROUTES as readonly string[]).includes(value)) {
    return value as ModelRoute;
  }
  throw new Error(
    `MODEL_ROUTE must be one of ${ROUTES.join(", ")}, got '${value}'.`
  );
};

const MODEL_ROUTE = parseRoute(process.env.MODEL_ROUTE);

const cloudflareBase = (): string =>
  `https://gateway.ai.cloudflare.com/v1/${requireEnv(
    "CLOUDFLARE_ACCOUNT_ID",
    "your Cloudflare account id"
  )}/${requireEnv("CLOUDFLARE_AI_GATEWAY", "starlight-factory")}`;

const cloudflareHeaders = (): Record<string, string> | undefined => {
  const token = process.env.CF_AIG_TOKEN;
  return token ? { "cf-aig-authorization": `Bearer ${token}` } : undefined;
};

const providerModel = (gatewayId: string): LanguageModel => {
  const slash = gatewayId.indexOf("/");
  const vendor = gatewayId.slice(0, slash);
  const modelId = gatewayId.slice(slash + 1);
  const viaCloudflare = MODEL_ROUTE === "cloudflare";
  if (vendor === "anthropic") {
    return createAnthropic(
      viaCloudflare
        ? {
            baseURL: `${cloudflareBase()}/anthropic/v1`,
            headers: cloudflareHeaders(),
          }
        : {}
    )(modelId);
  }
  if (vendor === "openai") {
    return createOpenAI(
      viaCloudflare
        ? {
            baseURL: `${cloudflareBase()}/openai`,
            headers: cloudflareHeaders(),
          }
        : {}
    )(modelId);
  }
  throw new Error(
    `MODEL_ROUTE=${MODEL_ROUTE} has no provider for '${gatewayId}'. Add one in agent/lib/models.ts or use the Vercel AI Gateway.`
  );
};

const resolve = (gatewayId: string): string | LanguageModel =>
  MODEL_ROUTE === "vercel-gateway" ? gatewayId : providerModel(gatewayId);

export const MODELS: Record<FactoryAgent, string | LanguageModel> = {
  analyst: resolve(GATEWAY_IDS.analyst),
  classifier: resolve(GATEWAY_IDS.classifier),
  implementer: resolve(GATEWAY_IDS.implementer),
  orchestrator: resolve(GATEWAY_IDS.orchestrator),
  researcher: resolve(GATEWAY_IDS.researcher),
  reviewer: resolve(GATEWAY_IDS.reviewer),
};
