# AGENTS.md

Guidance for AI agents working in this repo. See [`CONTEXT.md`](CONTEXT.md) for the domain glossary and [`docs/adr/`](docs/adr/) for architecture decisions.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `AUReviews/AUReviews`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles map 1:1 to their own label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## No em dashes

No em dashes (U+2014) anywhere in this repo: source, comments, docs, ADRs, UI strings. Where a sentence reaches for one, rewrite it with a comma, colon, period, parentheses, or a conjunction, whichever the sentence actually wants. Never do a blind character substitution. `npm run lint` fails on any em dash (`scripts/check-emdash.mjs`).
