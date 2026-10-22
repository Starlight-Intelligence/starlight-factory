# S1.5: Cloudflare Sandbox provider

**Outcome.** A Railway deployment of the factory runs its stations in Cloudflare Sandboxes, so a buyer needs no Vercel account.

**Base.** Branch from `origin/main` once PR #1 has merged; until then from `origin/agent/claude/railway-s1` at `04d890d`. Record the exact SHA you started from in the PR. Name the branch `agent/<harness>/<slice>`; one writer per worktree.

**Context.** Repo `Starlight-Intelligence/starlight-factory`. Read ADR-0006, `agent/lib/github/repo-sandbox.ts`, `agent/lib/github/git-remote.ts`, `node_modules/eve/docs/sandbox/*.mdx` (the `defineSandboxProvider()` contract), Cloudflare's Sandbox SDK docs and its outbound traffic guide. Use the `eve-host-port` skill.

**Scope.** A Worker under `edge/` that owns Cloudflare Sandbox instances and exposes only the operations the eve provider contract needs (open, resume, run, spawn, readFile, writeFile, stop) over authenticated HTTP. An outbound handler that adds the GitHub installation token on egress to github.com. An eve provider in `agent/lib/` selected by `SANDBOX_PROVIDER=cloudflare`; the default stays Vercel Sandbox. Pin `@cloudflare/sandbox` and `wrangler` to exact versions and record them in the PR. May change: a new `edge/sandbox-host/`, a new `agent/lib/sandbox/cloudflare.ts`, `agent/lib/github/repo-sandbox.ts` (provider selection only), `.env.example`, `docs/RAILWAY.md`, a new ADR. Must not touch: stations, trust, approval policies. The egress allowlist (E1) applies to this provider too: only GitHub and the stack's package registries. Model calls run in the app runtime, not the sandbox.

**Constraints.** The token never enters the sandbox. The Worker accepts only signed requests from the factory. Deploying the Worker or creating Cloudflare resources is the founder's call: stage it, don't run it.

**Done when.**
- `pnpm validate` clean with `SANDBOX_PROVIDER` unset and set.
- The Worker bundles with `wrangler deploy --dry-run`.
- Unit tests cover request signing, the operation mapping, and the outbound handler's header injection.
- A written test plan shows how to prove a station clone and push end to end once an account exists.

**Evidence to return.** Commits, test output, the bundle size, the review verdict, and what is unproven until a live run.

**Gates.** Spend ceiling for this slice: $0. Account creation, resource creation and deployment are the founder's, each with its own go-ahead. Commit only after `starlight-ops claim --adopt` listing every staged file; draft PR on this fork, never upstream.
