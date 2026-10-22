# Eval run: staged and capped

**Outcome.** We know whether a skill or an agent change helps, what it costs to know, and whether the result holds across models.

**Context.** Skill suites live in `.claude/skills/<skill>/evals/` (Claude Code plugin evals, schema 1.1); agent suites live in `evals/` (eve evals). Read `docs/engineering/EXPECTATIONS.md`, Evals section.

**Stages.** Stop at the first stage that fails, fix, and rerun that stage.

1. **Pilot:** `claude plugin eval .claude/skills/<skill> --runs 1 --ablation none --max-cost-usd 1 --trust-plugin`. Record the cost per case.
2. **Triggers:** `--tag trigger --ablation none --runs 3`, with a ceiling from the pilot's cost. Every trigger and boundary case passes 3 of 3.
3. **Outcomes:** `--tag task --runs 3` (two arms, Haiku judge). The with-skill score is at least the baseline's, and every outcome case passes.
4. **Model sweep,** before a public claim: repeat stage 3 with `--model haiku`, `--model sonnet` and `--model opus`.

**Base.** The branch carrying the skill (today PR #1 at `04d890d`).

**Constraints.** Headless Claude must be logged in. Default ceilings: pilot $1, triggers $2, outcomes $3; a model sweep needs its own go-ahead. Results stay out of git (`evals/results/` is ignored). Each stage needs a cost ceiling.

**Evidence to return.** Per stage: the score, the pass rate, the cost, and the with-minus-without delta. Link the HTML report. A failing case is listed with the fix it suggests.
