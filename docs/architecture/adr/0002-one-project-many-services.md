# ADR-0002: One buyer project, many services, scoped memory

Status: ruled by Frank, 2026-10-21. Owner: CEO.

## Context

The factory is the first of several products: marketing team, personal assistant, voice agent. Separate projects per product isolate failures, but they multiply credentials, upgrades and bills for a small buyer.

## Decision

- A buyer starts with the factory alone, in one Railway project.
- Each further product is another service in that project, sharing Postgres and the bucket.
- Memory is partitioned by product and principal. One product reads another's memory only through an explicit, logged grant.
- A product moves to its own project only when its release cadence or its data needs isolation.

## Consequences

- One bill, and one place to rotate keys.
- Shared infrastructure is a shared failure domain: Postgres and bucket health become every product's health.
- Each product can still be its own template listing, so each earns its own kickback.
