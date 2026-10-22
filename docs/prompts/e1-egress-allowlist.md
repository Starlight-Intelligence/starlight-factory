# E1: sandbox egress allowlist

**Outcome.** A station sandbox can reach only the hosts its job needs, so a hijacked implementer can't send repository code anywhere else.

**Base.** Branch from `origin/main` once PR #1 has merged; until then from `origin/agent/claude/railway-s1` at `04d890d`. Record the exact SHA you started from in the PR. Name the branch `agent/<harness>/e1-egress`; one writer per worktree.

**Context.** Today `agent/lib/github/git-remote.ts` sets the network policy with `"*": []`, which allows every host, alongside the brokered github.com rule that injects the installation token. Read that file, `agent/lib/github/repo-sandbox.ts`, the station `sandbox.ts` files, and in `node_modules/eve/docs/sandbox/` the network-policy pages. Read the current Vercel Sandbox firewall docs for the exact policy shape and whether wildcard subdomains are supported; quote what you rely on.

**Scope.** May change: `agent/lib/github/git-remote.ts`, `agent/lib/github/repo-sandbox.ts`, a new `agent/lib/sandbox/egress.ts` holding the allowlist, `.env.example` (one optional `FACTORY_EGRESS_EXTRA` list), tests, `docs/RAILWAY.md`, `SECURITY.md` (remove the known gap), the ARD's data-flow table. Must not touch: stations' instructions, trust, approval policies, the brokered token rule.

**Required behaviour.**
- Default allowlist: github.com and its git and API hosts; the package registries for the repo's stack (npm, PyPI to start); nothing else. Model calls happen in the app runtime, not the sandbox, so model hosts are not needed; confirm this in the code.
- `FACTORY_EGRESS_EXTRA` adds hosts, validated as plain hostnames (no wildcards beyond what the firewall supports, no IPs, no ports).
- `FACTORY_SETUP_COMMAND` still works for a repo that installs from npm or PyPI.

**Done when.**
- A test sandbox command `curl https://example.com` fails, and `git ls-remote` on the factory repo succeeds.
- `pnpm install` against a small fixture package succeeds inside the sandbox.
- `pnpm validate` reports 0 errors and 0 warnings.

**Evidence to return.** Test output, the head SHA, the cross-provider review verdict on it, and which of the checks ran live versus in a mock.

**Gates.** Spend ceiling: $2 of Vercel Sandbox minutes for the live checks, each run named before it starts. Commit only after `starlight-ops claim --adopt` listing every staged file; draft PR on this fork, never upstream.
