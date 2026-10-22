# Adversarial cross-provider review

Run on a different vendor than the maker, read-only, against the exact head SHA. Codex today:

```bash
codex exec --cd <repo> --sandbox read-only "$(cat <brief file>)" < /dev/null > <output file>
```

The `< /dev/null` is required, or `codex exec` waits for more input.

## Brief template

> You are an adversarial security and correctness reviewer. You did not write this code. Read only; do not edit files.
>
> Review `git diff <base>..<head>`. The change claims: <one line per claim>.
>
> Attack these specifically: <secrets reaching logs, sandboxes, models or git>; <every gate and approval path>; <idempotency and failure paths>; <behaviour of the default path, which must stay unchanged>; <each factual claim in docs against the code and the vendor docs>.
>
> For earlier findings, state FIXED, NOT FIXED or ACCEPTED-AS-DOCUMENTED, with file:line.
>
> Output findings with severity (P0 must fix, P1 should fix, P2 nit), file:line, a concrete failure scenario and a fix. End with exactly one line: VERDICT: PASS or VERDICT: FAIL (FAIL if any P0 or P1).

## After the review

- **Record it.** The maker records the verdict in the PR, with what was fixed in which commit.
- **Re-review after changes.** A new commit voids the verdict; review the delta.
- **The maker never signs off.** A maker's comment is a record, not a sign-off.
