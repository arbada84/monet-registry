# Dual OS Development Runbook

CulturePeople development is Linux-primary, not Linux-only. Use the Linux home checkout for normal work, but keep Windows usable as a fallback when Linux tooling, drivers, or local environment issues block progress.

## Working Model

- Primary checkout: `/home/arbada/dev/monet-registry-main`.
- Fallback checkout: Windows-side project checkout.
- Switch environments through git, not by editing the same uncommitted change in both places.
- Keep generated artifacts ignored unless they are intentionally tracked.
- Treat `node_modules`, `.next`, and native package outputs as OS-local state.

## Before Switching OS

1. Finish or park current work with `git commit` or `git stash`.
2. Confirm `git status --short --branch` is understood.
3. Pull the latest branch on the target OS.
4. Reinstall dependencies on the target OS if native packages may differ:

```bash
pnpm install --frozen-lockfile
```

5. Regenerate local artifacts before checks that read generated registry files:

```bash
pnpm metadata:build
pnpm registry:build
pnpm live-preview:generate
```

## Verification

Use the same verification intent on both OSes:

```bash
pnpm check:planning
pnpm check:registry-payload
pnpm ci:all
```

`pnpm ci:all` runs `pnpm check:registry-payload` after `pnpm build` so clean checkouts generate registry artifacts before the payload guard reads them.

## Line Endings

- Keep source files LF in git.
- If Windows edits create broad line-ending churn, stop and inspect before committing.
- Prefer committing from the OS that produced the final verification result.

## Recovery Rule

If Linux breaks, move back to Windows by committing or stashing Linux work first, pulling that state on Windows, reinstalling dependencies, regenerating artifacts, and running the verification commands above.
