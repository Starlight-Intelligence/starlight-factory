# S1: first measured live run on Railway

**Outcome.** A labeled issue on `Starlight-Intelligence/factory-scratch` becomes a draft PR from the factory running in Railway, and we can publish how long it took, what it cost, and whether a person would accept it.

**Base.** Deploy the revision the founder names; today PR #1's `agent/claude/railway-s1` at `04d890d`. Record the deployed SHA.

**Context.** Repo `Starlight-Intelligence/starlight-factory`. Use the `factory-launch` skill; it is the runbook. Read `docs/RAILWAY.md` and ADR-0001, ADR-0005, ADR-0006.

**Scope.** Railway project, service, volume, bucket and domain; non-secret variables; the scratch repo's issue #1 and one more issue for the recovery test. No code changes; if a code fix is needed, stop and open a separate issue.

**Constraints.** Follow `factory-launch` hard rules: never handle a secret value, never read variables back after secrets are set, one named go-ahead with a spending limit per paid step. Railway status must be healthy before you start.

**Done when.**
- `/eve/v1/health` returns 200; unauthenticated `POST /eve/v1/session` returns 401.
- Issue #1 ends in a draft PR from a `factory/` branch, with a progress comment per station.
- A kill during the implementer step on a second issue is recorded: resumed, restarted or lost.

**Evidence to return.** Minutes from label to draft PR; cost split into models, Vercel Sandbox and Railway; the outcome words from `docs/product/METRICS.md` (ready, merged, accepted), marked provisional until their windows close, with the human diff after the factory's last commit; how long the sandboxes lived and whether they stopped at session end; the recovery result; links to the PR and to the run logs. Post the same as a comment on PR #1.

**Gates.** Project creation, every build, the first label, the recovery test: each needs the founder's go-ahead in chat with its own spending limit. Suggested ceiling for the whole slice: $15 (Railway usage, Vercel Sandbox minutes, model tokens for two runs); stop and report if spend reaches it. Activation: start only when status.railway.com shows no active incident for builds or deploys.
