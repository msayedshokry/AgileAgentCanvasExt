---
name: aac-resolving-merge-conflicts
description: 'Resolve an in-progress git merge or rebase conflict. Use when git reports CONFLICT, when conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) appear in a file, or when the user is stuck on a merge/rebase that will not complete. Standalone loop — no dependencies on other skills.'
---

# Resolving Merge Conflicts

A loop for unsticking an in-progress git merge or rebase. The trigger is a file with conflict markers in the working tree. The exit is a clean working tree, ready to commit.

The skill is **standalone** — it does not invoke other skills. Domain-specific decisions (which side of the conflict is "right") still need the human or the project's domain model.

## The loop

### 1. Confirm you are in a conflict

```bash
git status
```

`Unmerged paths` (for `merge`) or `interactive rebase in progress` / `rebase in progress` (for `rebase`) confirms the state. If neither, you are not in a conflict — stop and tell the user.

For a **merge**, list the conflicted files:

```bash
git diff --name-only --diff-filter=U
```

For a **rebase**, the same command works; the conflict markers are written into the affected files the same way.

### 2. For each conflicted file

**Read the file, do not skim it.** A merge conflict is not a comment to delete. Each marker block encodes a decision; the right resolution depends on what the file is *for*, not on which marker looks longer.

The marker anatomy:

```
<<<<<<< HEAD
<the version on the current branch>
=======
<the version being merged in>
>>>>>>> <branch-or-commit-ref>
```

Three cases dominate, and each has a different right answer:

- **Both sides changed the same lines, same way** — keep one copy, delete the markers. Use `git checkout --ours` or `--theirs` to take one side wholesale, then delete the markers if any remain.
- **Both sides changed the same lines, differently** — read both versions, understand the *intent* of each, and combine. A real combination is not picking one side; it is a synthesis that keeps both intents. If the intents are incompatible, **stop and ask the human** — this is the case where a wrong call is a silent bug.
- **One side added code the other side did not touch** — keep the addition. The markers usually bracket unrelated regions; delete them without losing content.

### 3. After each file is resolved

Mark it resolved:

```bash
git add <file>
```

`git add` on a file with conflict markers still in it will fail. The markers must be gone first.

### 4. After all files are resolved

For a **merge**:

```bash
git commit   # git writes the merge commit message for you; review before saving
```

For a **rebase**:

```bash
git rebase --continue
```

For a **rebase** that has gone wrong beyond repair, abandon it:

```bash
git rebase --abort
```

For a **merge** that has gone wrong beyond repair:

```bash
git merge --abort
```

`--abort` is the right call when the conflict surface is wider than expected or the two branches have diverged too far. A clean re-merge from a known state beats a stitched-together one.

## Halt conditions

Stop and ask the human when:

- The two sides change the same logic in incompatible ways and you cannot tell which intent the project prefers (no test, no ADR, no `project-context.md` entry to lean on)
- The conflict exposes a question that was not asked in either branch — the right resolution might be a new commit, not a marker delete
- The resolution would touch more than ~3 files in ways the user did not anticipate — this is a "stop and replan" signal, not a "keep going" signal

## Anti-patterns

- **`git checkout --ours` on every conflict** — fast, and almost always wrong. The conflicts are there because the two branches disagreed; "ours" by default is just refusing to look.
- **Deleting the markers without checking the content** — leaves the file in whatever state the merge tool wrote, which can include a half-and-half that does not parse.
- **Resolving without running anything** — at minimum, run the project's typecheck (`tsc`, `mypy`, etc.) and the test suite after resolving. A conflict resolution that does not typecheck is not a resolution.
- **Forgetting a file** — `git diff --name-only --diff-filter=U` after every batch of resolutions catches the ones you missed.
