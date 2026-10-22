# ADR-0009: Keep upstream ids, change the edges

Status: accepted. Owner: CTO.

## Decision

- Inside the code, keep upstream names: `foreman`, the station directories, the tool names.
- The product name, the template listing and the GitHub App slug are ours.
- New behaviour goes in new files; upstream files only gain calls to them.
- The upstream remote stays configured, and a monthly upstream merge PR is on the roadmap.

## Consequences

Renaming the persona in code would turn every upstream merge into conflicts. The bot's mention name already follows the buyer's own app slug.
