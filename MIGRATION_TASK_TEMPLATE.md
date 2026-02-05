# Migration Task: Upgrade to v4 Reusable Workflows

**Repository:** `<repository>`
**Current version:** `<current-version>`
**Target version:** `v4`

---

## Overview

This repository uses reusable workflows from `dsb-norge/github-actions` and needs to be upgraded to version `v4`.

**Current workflow reference:**
- `dsb-norge/github-actions/.github/workflows/<workflow-name>@<current-version>`

**Target workflow reference:**
- `dsb-norge/github-actions/.github/workflows/<workflow-name>@v4`

Where `<workflow-name>` is one of:
- `ci-cd-default.yml`
- `ci-cd-build-deploy-maven-lib.yml`

---

## Breaking Change in v4

Version v4 introduces **one required change** to all workflow job definitions:

All jobs calling the reusable workflows must add the `permissions: write-all` directive.

---

## Required Changes

### 1. Locate Workflow File

Find the workflow file in your repository:
```
<repository>/.github/workflows/ci-cd.yml
```

### 2. Update Job Definition

**Before (v2 or v3):**
```yaml
jobs:
  ci-cd:
    uses: dsb-norge/github-actions/.github/workflows/<workflow-name>@<current-version>
    secrets: inherit # pass all secrets, ok since we trust our own workflow
    with:
      # ... your existing configuration ...
```

**After (v4):**
```yaml
jobs:
  ci-cd:
    # TODO revert to @v4
    uses: dsb-norge/github-actions/.github/workflows/<workflow-name>@v4
    secrets: inherit # pass all secrets, ok since we trust our own workflow
    permissions: write-all # allow all, ok since we trust our own workflow
    with:
      # ... your existing configuration ...
```

### Changes Summary:
1. Update version tag: `@<current-version>` → `@v4`
2. Add line if missing: `permissions: write-all # allow all, ok since we trust our own workflow`

---

## Step-by-Step Instructions

### Step 1: Create a branch

Make sure you are on a feature branch created from the latest main/default branch.

### Step 2: Edit the workflow file

Open `.github/workflows/ci-cd.yml` and make the required changes:
1. Change the `uses:` line to reference `@v4` instead of `@<current-version>`
2. Add `permissions: write-all` line immediately after `secrets: inherit` if missing.
   1. if `secrets: inherit` is not present you should make it clear in the PR that you are adding it for the first time.

### Step 3: Commit changes

Commit changes with a descriptive message:
```txt
chore: upgrade ci/cd workflow(s) to v4

- Update dsb-norge/github-actions workflow reference from @<current-version> to @v4
- Add required permissions: write-all directive for v4 compatibility
```

### Step 4: Push and create PR

Push your changes and update Pull Request with title 'upgrade ci/cd workflow(s) to v4' and a descriptive message.

**Testing:** Workflow will be validated on PR creation, merge and PR close.

---

## Verification Checklist

Verify:

- [ ] Workflow file updated with `@v4` version tag
- [ ] `permissions: write-all` added to job definition
- [ ] Commit message follows semantic commit message convention
- [ ] PR created with descriptive title and body

---

## Reference Implementation

See `dsb-norge/test-application` for a complete example of v4 implementation:

- Repository: https://github.com/dsb-norge/test-application
- Workflow file: `.github/workflows/ci-cd.yml`

---

## Troubleshooting

### Issue: Can't find `.github/workflows/ci-cd.yml`

**Solution:** The workflow file might have a different name. Search for files containing:

```bash
grep -r "dsb-norge/github-actions/.github/workflows" .github/workflows/
```

**But make sure:** you are only changing refernces to reusable workflows from `dsb-norge/github-actions`. Do not make changes to files referencing workflows in other repositories.

---

## Acceptance Criteria

This task is complete when:

1. ✅ PR created with workflow upgrade
2. ✅ All verification checklist items confirmed

---

## Notes

- **No functional changes:** This upgrade only changes the workflow version and adds required permissions
- **v3 compatibility:** v3 has no breaking changes, so v2→v4 and v3→v4 migrations follow the same pattern
- **Safe migration:** The `permissions: write-all` directive maintains the same security model (we trust our own workflows)
- **Testing:** PR workflows automatically test the changes before merge
