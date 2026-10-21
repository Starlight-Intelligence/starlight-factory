---
name: eve-host-port
description: Change or write the host adapters that let an eve agent app run off Vercel, or port another eve app (a fork of a Vercel eve template such as the marketing team or personal agent) to Railway, Docker Compose hosts or any Node host. Use when someone asks what breaks without Vercel Connect, Blob, OIDC, Vercel Sandbox or Vercel Workflow, or needs to build memory backends, sandbox providers, schedules, auth or webhook intake for a self-hosted eve app. Not for deploying, configuring or troubleshooting this already-built factory; that belongs to factory-launch.
---

# Port an eve app off Vercel

eve (0.67) self-hosts as a Node server: `eve build` writes a Nitro server to `.output/`, and `eve start --host 0.0.0.0` serves it on `PORT`. A port replaces what Vercel provided implicitly. Read the matching page in `node_modules/eve/docs/` before changing each seam. This repo's `agent/lib/` has worked examples of the adapters the factory needed; memory and schedules aren't implemented here yet.

## Hard rules

- **Never handle a secret value.** App keys, tokens and passwords go into the host's variables by the owner's own hand, never through chat, files or tool calls.
- **Get an explicit go-ahead before anything that spends:** a normal `eve build` (it prewarms paid sandboxes), a deploy, an authenticated agent turn, or a real webhook test. Name the items and a spending limit.
- **One explicit host switch.** Pick the host with one variable (here `FACTORY_PLATFORM`), never by sniffing which variables exist, and keep the Vercel path working when it's unset, so upstream merges stay small.
- **Change the edges, not upstream files.** New adapters go in new files under `agent/lib/`; upstream files only call them.
- **Fail at load when required config is missing,** naming the variable.
- **Never generate a secret with `ctx.randomString` in Railway IaC.** It is derived from the environment name, not from entropy.

This skill is guidance; none of it is enforced at runtime.

## The seams

| Vercel gave you | Self-hosted replacement | eve doc | Worked example here |
| --- | --- | --- | --- |
| Connect credentials for GitHub and Linear | Credentials passed to the channel: `appId`, `privateKey`, `webhookSecret`, or a lazy `installationToken`; Linear `accessToken` and `webhookSecret` | `channels/github.mdx`, `channels/linear.mdx` | `agent/lib/github/app-auth.ts`, `agent/channels/linear.ts` |
| Vercel OIDC route auth | `httpBasic`, `jwtHmac`, `jwtEcdsa` or `oidc` from `eve/channels/auth` | `guides/auth-and-route-protection.md` | `agent/channels/eve.ts` |
| Vercel Blob | Any S3 API (Railway Bucket, Cloudflare R2) behind the app's document helpers | — | `agent/lib/s3-store.ts` |
| Vercel Workflow | Local world on a persistent volume at `.eve/.workflow-data`, or `experimental.workflow.world` set to `@workflow/world-postgres` | `guides/deployment/self-hosting.md` | `railway.json` plus a volume |
| Vercel Sandbox via OIDC | Vercel Sandbox via `VERCEL_TOKEN`, `VERCEL_TEAM_ID` and `VERCEL_PROJECT_ID`, or a custom `defineSandboxProvider()` | `sandbox/*.mdx` | environment only |
| AI Gateway via OIDC | `AI_GATEWAY_API_KEY`, or provider `LanguageModel`s with your own base URL | `agent-config.md` | `agent/lib/models.ts` |
| `fileMemory` on Blob | A custom memory backend with read, write and compare-and-set; `fileMemory` throws off Vercel without one | `memory/file.md`, `memory/custom-provider.md` | not yet |
| Vercel Cron | Nitro scheduled tasks. `eve start` runs the standard runner; a custom host must start Nitro's scheduled-task runner itself | `schedules.mdx` | not yet |

## Traps that cost time

- **Git checkout in a sandbox needs a firewall.** The GitHub channel's built-in checkout, and any git that must keep the token out of the sandbox, need egress credential injection. On a backend without it, the channel skips the checkout silently.
- **Hooks run after eve has already answered the webhook.** A channel hook that throws can't make GitHub retry, and GitHub never redelivers on its own. Durable intake needs a front door queue (see `edge/github-front-door`) and an idempotency claim (see `agent/lib/deliveries.ts`).
- **An extension's root can't declare agent config, memory, sandbox, instrumentation or nested extensions.** Share host adapters as a plain library rather than as an extension root.
- **The proxy must forward both** `/eve/` and `/.well-known/workflow/`, unchanged. With only `/eve/`, sessions start and then stall.
- **Gateway and vendor model ids differ.** `openai/gpt-5.6-terra-fast` on the gateway is `gpt-5.6-terra` at OpenAI; map them explicitly.
- **eve self-modification is dev-only.** It never ships to production; use dynamic capabilities for per-tenant shape.
- **A Basic-auth principal may not count as a `user`.** Per-user tools can refuse it; test before relying on it.

## Prove the port

1. **Static:** `pnpm validate` (lint, `tsc`, `eve info` with 0 errors and 0 warnings), with the host switch unset and set.
2. **Smoke, free only when nothing can dispatch on its own.** `eve start` also runs the schedule runner, so first disable the app's schedules (guard or remove the schedule files for this run) and leave every channel without credentials and without a webhook pointed at it; otherwise get the go-ahead before this step too. Then run `eve build --skip-sandbox-prewarm` and `eve start`. Health returns `200`. A bodyless `POST /eve/v1/session` returns `401` without credentials and `202` with them; creating a session without a message doesn't start a turn. This output may not be deployable: it proves routing and auth, nothing more.
3. **Real, with go-ahead:** a normal build, a deploy, one completed authenticated turn that uses the sandbox and a model, one real provider webhook, and a replayed copy of it that doesn't start a second session. Only this step makes the port verified.
4. A different provider reviews the diff before it leaves draft.
