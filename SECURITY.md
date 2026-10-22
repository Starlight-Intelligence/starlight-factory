# Security policy

## Reporting a vulnerability

Please don't open a public issue. Use GitHub's private vulnerability reporting on this repository (Security tab, "Report a vulnerability"). Include what you found, how to reproduce it, and what an attacker could do with it.

We aim to acknowledge a report within 3 working days and to give an initial assessment within 10. We'll tell you when a fix ships and credit you in the release notes unless you'd rather we didn't. These are targets for a small team, not a contractual SLA.

Issues in the upstream template that also affect Vercel's version should go to Vercel as well: https://github.com/vercel-labs/eve-software-factory-template.

## Supported versions

Only the latest release, and `main`, receive security fixes. Starlight Factory is pre-1.0; see `docs/OPERATIONS.md` for the upgrade policy.

## What we treat as a vulnerability

- A secret (GitHub App key, installation token, model key, route password, webhook secret) reaching a sandbox, a log line, a model prompt or git.
- An unattended run doing anything beyond its allowed effects: labels, comments on its intake issue, close or reopen, pushing a non-protected feature branch, draft PRs.
- Content causing the factory to act on instructions in it: text from someone without authority, or untrusted text quoted by someone with it. Authority comes only from the channel: on GitHub, a `factory` label from triage-or-higher or a mention or approval from an owner, member or collaborator; on Linear, an Agent Session from a member of the connected workspace.
- A sandbox reaching a host outside the egress allowlist, once the allowlist ships (slice E1). Until then, open egress is a known, documented gap, not a new report.
- A replayed or forged webhook starting a run.
- A receipt that verifies after a bound input changed, once receipts ship (slice S3).

## Known gaps, stated in public

- **Sandbox egress is open** to every host today. A hijacked implementer could send repository code anywhere. Tracked as slice E1.
- **Vercel mode stores run documents in upstream's public Blob store** with predictable keys. Railway mode uses a private bucket. Don't use Vercel mode for private repositories until this changes.
- **Some webhook loss cases** exist until the durable inbox ships (`docs/architecture/adr/0005-webhook-intake.md`). None can start a duplicate run.
