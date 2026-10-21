---
name: factory-launch
description: Deploy, configure, run and troubleshoot this Starlight Factory on Railway. Use when someone wants to launch, set up or redeploy this factory, create its GitHub App, wire its variables and secrets, run or measure its first factory issue, or diagnose this deployed factory (webhooks not arriving, labels ignored, sandbox or model errors, the service refusing to start). Not for changing the factory's host adapters or porting a different eve app (both belong to eve-host-port), and not for changing the factory's agent behaviour.
---

# Launch Starlight Factory on Railway

The factory runs in the deployer's own Railway account with the deployer's own keys. You prepare, verify and run; the deployer owns every account, every secret and every spend decision. This skill is guidance: nothing here is enforced at runtime, so the rules below are yours to keep.

## Hard rules

- **Never handle a secret value.** GitHub App keys, Vercel tokens, model keys and the route password go into Railway by the deployer's own hand. Never ask for them in chat, accept them if offered, write them to a file, or put them in a tool call. If someone pastes one, say not to, and point them to the service's Variables tab.
- **Never read variables back once secrets are set.** Railway's `list-variables` returns plaintext to API tokens. Sealed variables can't be read at all; never recreate one because it looks empty.
- **Get one explicit go-ahead in chat for everything that spends,** naming each item and a spending limit: creating the project, every build (a normal build prewarms paid Vercel sandboxes), authenticated test turns, labeling an issue `factory`, and the recovery test. A go-ahead for one doesn't cover the others.

## 0. Preconditions

1. Railway is healthy (status.railway.com). The tool error "Deploys have been paused temporarily" is a platform incident: wait, don't retry in a loop.
2. The deployer has named the target repo (`FACTORY_REPO`, `owner/repo`), the branch to deploy, and the model route (step 3).

## 1. Create the Railway project

**IaC path.** `.railway/railway.ts` declares the service, a 1 GB volume at `/app/.eve/.workflow-data` and a bucket. Before using it:

1. Its `source` is hardcoded to `Starlight-Intelligence/starlight-factory`, branch `main`. If the deployer named another fork or branch, edit `source` first, or use the MCP path below.
2. Run `railway config plan` and read every change before `railway config apply` (Railway CLI 5.42.1 or newer, linked project). Variables declared as deployer settings or secrets are preserved. `FACTORY_PLATFORM` and the `S3_*` references are reset to what the file says. A variable not in the file can be removed.

**MCP path**, in order:

1. `create-project`
2. `create-service`, empty
3. `create-volume`, mounted at `/app/.eve/.workflow-data` (without it, a redeploy loses every in-flight run)
4. `create-bucket`
5. `generate-domain`

Later, `connect-service-source` with the exact repo and branch.

Record the domain: the GitHub App needs it.

## 2. Create the GitHub App (the deployer runs this)

```bash
node scripts/create-github-app.mjs --owner <org-or-user> --webhook https://<domain>/eve/v1/github
```

The deployer clicks once on GitHub. The script writes the app id, slug, private key, webhook secret and a random `FACTORY_ROUTE_PASSWORD` to `~/.starlight-factory/starlight-factory.env`, owner-only and outside git. The deployer then installs the app on `FACTORY_REPO` only.

## 3. Variables: who sets what

| Variable | Set by | When |
| --- | --- | --- |
| `FACTORY_PLATFORM=railway`, `FACTORY_REPO`, `GITHUB_APP_SLUG`, `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`, `MODEL_ROUTE` | you | always |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` | you, as references `${{<bucket>.ENDPOINT}}` and so on | always; use `BUCKET`, not `RAILWAY_BUCKET_NAME` |
| `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `FACTORY_ROUTE_PASSWORD` | deployer | always, from the env file in step 2 |
| `VERCEL_TOKEN` | deployer | always; team-scoped, for sandboxes only |
| `AI_GATEWAY_API_KEY` | deployer | `MODEL_ROUTE=vercel-gateway` (the default) |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | deployer | `MODEL_ROUTE=direct` or `cloudflare` |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_GATEWAY` | you | `MODEL_ROUTE=cloudflare` |
| `CF_AIG_TOKEN` | deployer | `cloudflare`, when the gateway requires authentication |

The Vercel variables must exist **before the first normal build**: `eve build` prepares the station sandbox snapshots then.

## 4. Deploy and verify

1. With the go-ahead, connect the source (exact repo and branch). `railway.json` builds with `pnpm build` and health-checks `/eve/v1/health`.
2. `curl https://<domain>/eve/v1/health` returns `200` with `"status":"ready"`.
3. `POST /eve/v1/session` with no credentials must return `401`. Anything else means route auth isn't on: stop the launch and check `FACTORY_PLATFORM=railway` and `FACTORY_ROUTE_PASSWORD`.
4. Operator access: `eve remote connect --url https://<domain> --header "Authorization: Basic <base64 of factory:password>"`. The deployer builds the header from their own password.

## 5. First run

1. With the go-ahead, add the `factory` label to the chosen issue. The labeler needs triage permission or higher; a label from anyone below that is ignored by design.
2. Follow the logs. Expect a progress comment per station, then a closing comment linking a draft PR from a `factory/` branch.
3. If the pipeline posts clarifying questions, it stops. A plain reply on the issue doesn't restart it. A trusted collaborator continues it by mentioning the bot (`@<app-slug>`) in a reply, or by removing and re-adding the label, which starts a fresh unattended run.

## 6. Measure, then break it on purpose

Publish these with the run:

- **Minutes** from label to draft PR.
- **Cost**: model spend from the gateway or vendor dashboards, Vercel Sandbox compute and snapshot storage (including the build's prewarm), and Railway usage for the window.
- **Accepted without edits?** Yes or no, and what a person changed.
- **Recovery** (its own go-ahead): label a second issue, restart the service during the implementer step, and record whether the run resumes, restarts or is lost.

## 7. When it fails

| Symptom | Cause | Fix |
| --- | --- | --- |
| Won't start: `FACTORY_ROUTE_PASSWORD environment variable is not set` | password missing | deployer sets the generated one |
| Won't start: `FACTORY_ROUTE_PASSWORD must be at least 24 characters` | password too short | deployer sets the generated one |
| First station fails: `Cannot access <owner/repo>` | app not installed on the repo, or wrong repo | install the app on `FACTORY_REPO` |
| Labels do nothing and no logs | webhook URL or secret mismatch | check the app's Advanced tab; GitHub never redelivers by itself, so redeliver by hand or use `edge/github-front-door` |
| Log: `Skipped a issue event: the delivery-claim store failed` | bucket unreachable | fix the `S3_*` references, then re-label |
| Sandbox errors at build or first station | Vercel token, team or project wrong, or missing at build time | set all three, redeploy |
| Won't start: `MODEL_ROUTE=… has no vendor id for …` | a gateway id with no mapping on `direct` or `cloudflare` | add it to `VENDOR_MODELS` in `agent/lib/models.ts` |
| A vendor rejects the model at call time | the mapped vendor id is wrong or retired, or the key lacks access | check the id on the vendor's model page and the key's access |

## 8. Teardown

The deployer deletes the Railway project and revokes the GitHub App key in the app's settings. Deletion is theirs to confirm; you list what will be removed.
