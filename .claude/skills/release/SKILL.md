---
name: release
description: Use when publishing a new dbml-diff version to npm - when the user says release, ship, publish, cut a version, or asks to tag vX.Y.Z
---

# Releasing dbml-diff

Releases are tag-triggered. Pushing tag `vX.Y.Z` runs `publish.yml`, which fails unless the tag matches package.json's version, then runs the tests and publishes via OIDC trusted publishing. There are no npm tokens anywhere; never publish from a local machine.

## Decide the version

```
git log $(git describe --tags --abbrev=0)..HEAD --oneline
```

Breaking change: major. Any `feat`: minor. Only `fix`/`docs`/`ci`/`chore`: patch. If nothing user-facing shipped, ask the user whether a release is wanted before proceeding.

## Procedure

1. Preflight: `git checkout main; git pull` - clean tree, `npm test` green.
2. Issue: `gh issue create --title "Release vX.Y.Z" --label chore --body "..."` - note the number #N. Use the `chore` label, not `enhancement`.
3. Branch: `git checkout -b chore/release-X.Y.Z`.
4. Bump the version by HAND-EDITING three fields:
   - package.json `"version"`
   - package-lock.json top-level `"version"` AND `packages[""].version`

   NEVER use `npm version`, `npm install`, or `npm install --package-lock-only` for the bump. On Windows, npm rewrites package-lock.json and strips Linux-only optional deps (`@emnapi/core`, `@emnapi/runtime`), which breaks `npm ci` on the CI runners. A local `npm ci` will NOT catch this - Windows does not need those entries. This has broken CI twice.
5. Verify: `npm test`; `npm pack --dry-run` shows only lib/, bin/, package.json, README, LICENSE.
6. Commit (commit-msg hook: `type(scope): description`, subject <= 72 chars, no co-authors):
   `git commit -m "chore(release): bump version to X.Y.Z" -m "Closes #N"`
7. Push; `gh pr create` with `Closes #N` in the body; `gh pr checks --watch`; `gh pr merge --squash --delete-branch`.
8. Tag on main: `git checkout main; git pull`; confirm `node -p "require('./package.json').version"` prints X.Y.Z; then `git tag vX.Y.Z; git push origin vX.Y.Z`.
9. Watch: `gh run list --workflow publish.yml --limit 1` then `gh run watch <id> --exit-status`.
10. Verify: `npm view dbml-diff version` returns X.Y.Z.
11. Roadmap tick-off: `gh issue list --label roadmap --state all` - every roadmap issue shipped by this release must be closed (its card moves to Launched automatically) and stale `status:` labels removed.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| "Tag does not match package.json version" | mismatched tag | `git tag -d vX.Y.Z; git push origin :refs/tags/vX.Y.Z`, fix, retag |
| `npm ci` fails: missing `@emnapi/*` | lockfile regenerated on Windows | `git checkout origin/main -- package-lock.json`, hand-edit version fields only |
| `E403` / `EOTP` / `ENEEDAUTH` on publish | trusted publisher misconfigured | npmjs.com > package Settings > Trusted Publisher: repo `afrugalpenguin/dbml-diff`, workflow `publish.yml` |
| Publish run failed after tagging | transient or fixable cause | fix, then `gh run rerun <id> --failed`; never unpublish a released version |
