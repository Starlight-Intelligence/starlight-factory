# Run Starlight Factory on Railway

Set `FACTORY_PLATFORM=railway` and the factory stops depending on Vercel Connect, Vercel Blob and Vercel OIDC. Station sandboxes still run on Vercel Sandbox, called as an API, because its egress firewall is what keeps the git token out of the sandbox. The Vercel deploy path keeps working unchanged when the variable is unset.

| Upstream (Vercel) | On Railway | Where |
| --- | --- | --- |
| Vercel Connect GitHub connector | Your own GitHub App; repository-scoped installation tokens minted from its key | `agent/lib/github/app-auth.ts` |
| Vercel Connect Linear connector | Your own Linear app token and webhook secret, read on use (Linear is optional) | `agent/lib/constants.ts`, `agent/channels/linear.ts` |
| Vercel Blob (public store) | Private Railway Bucket over the S3 API | `agent/lib/s3-store.ts` |
| Vercel OIDC route auth | HTTP Basic on `/eve/` | `agent/channels/eve.ts` |
| Vercel Workflow | eve's local Workflow world on a Railway volume | `railway.json`, volume below |
| Vercel Sandbox via OIDC | Vercel Sandbox via an access token | environment only |

## 1. Create the GitHub App

Create a GitHub App in the account or org that owns `FACTORY_REPO`.

- Webhook URL: `https://<your-railway-domain>/eve/v1/github`, with a webhook secret you generate.
- Repository permissions: Contents read and write, Issues read and write, Pull requests read and write, Checks read, Metadata read.
- Events: Issues, Issue comment, Pull request, Pull request review comment, Check suite.
- Install it on `FACTORY_REPO` only.

Keep the app id, slug, private key and webhook secret for step 3. The factory mints a token for that one repository on each use and never writes the key into a sandbox.

## 2. Create the Railway project

One service from this repository, plus:

- A **volume** mounted at `/app/.eve/.workflow-data`. Without it, a redeploy loses every in-flight run.
- A **Bucket**. Reference its variables from the service: `S3_ENDPOINT=${{Bucket.ENDPOINT}}`, `S3_BUCKET=${{Bucket.BUCKET}}`, `S3_ACCESS_KEY_ID=${{Bucket.ACCESS_KEY_ID}}`, `S3_SECRET_ACCESS_KEY=${{Bucket.SECRET_ACCESS_KEY}}`, `S3_REGION=${{Bucket.REGION}}`. Use `BUCKET`, not `RAILWAY_BUCKET_NAME`.
- A public domain for the webhook URL.

`railway.json` builds with `pnpm build`, starts `eve start --host 0.0.0.0` on Railway's `PORT`, and health-checks `/eve/v1/health`.

## 3. Set the variables

`.env.example` lists every variable. The required set on Railway:

| Variable | Value |
| --- | --- |
| `FACTORY_PLATFORM` | `railway` |
| `FACTORY_REPO` | `owner/repo` the app is installed on |
| `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET` | from step 1 |
| `S3_*` | Bucket references from step 2 |
| `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID` | a Vercel access token and the team and project that own the sandboxes |
| `AI_GATEWAY_API_KEY` | or a provider key with a direct provider model in `agent/lib/models.ts` |
| `FACTORY_ROUTE_PASSWORD` | a long random string; `FACTORY_ROUTE_USER` defaults to `factory` |

The Vercel variables must also be present at build time: `eve build` prepares the station sandbox snapshots.

## 4. Check it

```bash
curl https://<your-railway-domain>/eve/v1/health
BASIC=$(printf '%s' "factory:$FACTORY_ROUTE_PASSWORD" | base64)
eve remote connect --url https://<your-railway-domain> --header "Authorization: Basic $BASIC"
```

`eve remote connect` has no password prompt for Basic auth, so pass the header. Without it every session request returns 401.

Then label an issue `factory` on `FACTORY_REPO`. The run should end in a draft pull request.

## Known gaps

- Sandboxes are rented from Vercel, so a Railway deployment still needs a Vercel account. A custom eve sandbox provider for another firewall-capable host would remove it.
- The local Workflow world runs on one replica. Scaling past one instance needs a shared Workflow world, for example on Postgres.
- Not yet verified: whether a Basic-auth session counts as a `user` principal for the per-user preference tools. GitHub and Linear sessions carry their own principals and are unaffected.
