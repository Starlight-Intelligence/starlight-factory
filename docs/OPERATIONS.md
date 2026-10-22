# Operating Starlight Factory

Status: draft, 2026-10-22. What a buyer can rely on, and what they do themselves. The factory runs entirely in the buyer's accounts, so most of operations is theirs; this page says which parts, and how.

## Who does what

| Area | The buyer | Us (the project) |
| --- | --- | --- |
| Accounts, keys, bills | Owns all of them; sets every secret in Railway | Never holds a key or sees a bill |
| Deploying and upgrading | Clicks deploy; merges our upgrade PRs into their fork, or redeploys the template | Ships releases with notes and migration steps |
| Backups | Turns on Railway volume backups; keeps the bucket | Documents what needs backing up |
| Incidents in their install | First responder, using `factory-launch` | Fixes defects in the code; answers in Discussions |
| Security reports | Reports privately | Triages per `SECURITY.md` |

## Supported versions

- Pre-1.0: only the latest release is supported. Each release names the eve version it was tested with; we track eve's minor releases within a month.
- **Requirement, not yet built:** a release that changes stored data (bucket layout, inbox schema) says so in its notes and ships a migration that runs on start and is safe to run twice. No release has needed one yet.

## Upgrades

1. Read the release notes for anything marked **breaking** or **migration**.
2. Take a Railway volume backup.
3. Deploy the new release to a staging environment in the same project first when the notes say **migration**.
4. Deploy to production. Once migrations exist, the health endpoint will return 200 only after the migration finishes; today it reports the server is up.

## Backups and restore

What needs keeping:

| Data | Where | How to back up | If it's lost |
| --- | --- | --- | --- |
| Workflow state | volume `/app/.eve/.workflow-data` | Railway volume backups (daily recommended) | In-flight runs are lost; re-label their issues |
| Factory brain, preferences, artifacts, claims | private bucket | The bucket provider's versioning or a scheduled copy | The brain must be rebuilt; lost claims let a replayed event start a duplicate run |
| Secrets | Railway variables | The buyer's own password manager | Regenerate the GitHub App key and route password |

Restore: stop the service, restore the volume from its backup, check the bucket is reachable, start the service, confirm `/eve/v1/health` returns 200. This procedure hasn't been rehearsed yet; rehearsing it once is part of slice O1.

## Rollback

Redeploy the previous successful deployment from the Railway dashboard. If the newer release ran a migration, its notes say whether rollback is safe; when it isn't, restore the volume backup taken before the upgrade.

## Data retention

| Data | Default | Change it |
| --- | --- | --- |
| Run reports and handoff artifacts | 90 days (proposed) | bucket lifecycle rule |
| Delivery claims | Kept; don't add a lifecycle rule on `deliveries/` until S2 adds an event-age check | — |
| Front door queue | 24 h on Workers Free, 4 days by default on Workers Paid | `wrangler queues update --message-retention-period-secs` |
| Sandboxes | Not yet verified per session; Vercel removes unresumable sandboxes after 14 days, and template snapshots expire after 14 days | `FACTORY_SANDBOX_CREATE_OPTIONS` |
| Telemetry | Not built. When built: off by default, 13 months, withdrawal deletes the install's records within 30 days (proposed) | — |

## Support

- Questions and help: GitHub Discussions on this repository.
- Bugs: GitHub issues, with the failure-table row from `factory-launch` that you tried.
- Security: `SECURITY.md`, never a public issue.
- There is no paid support tier in v1.
