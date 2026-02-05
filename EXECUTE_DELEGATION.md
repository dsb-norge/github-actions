# How to Execute the Delegation to dsb-norge/ad-client

## Overview
This document provides the exact steps to delegate the CI/CD migration task to GitHub Copilot in the `dsb-norge/ad-client` repository.

## Prerequisites Check
Before starting, ensure you have:
- [x] GitHub CLI installed (`gh --version`)
- [ ] GitHub CLI authenticated (`gh auth status`)
- [ ] Write access to `dsb-norge/ad-client` repository
- [ ] GitHub Copilot enabled for the organization/repository

## Execution Steps

### Step 1: Authenticate GitHub CLI (if not already done)

```bash
gh auth login
```

Follow the prompts to authenticate with your GitHub account.

### Step 2: Run the Automated Delegation Script

From the `github-actions` repository directory:

```bash
# Navigate to the repository root
cd /path/to/github-actions

# Execute the delegation script
./delegate-migration-task.sh dsb-norge/ad-client
```

### What the Script Does

The script will automatically:

1. ✅ **Verify Prerequisites**
   - Check GitHub CLI is installed
   - Verify authentication
   - Confirm migration template exists

2. ✅ **Validate Access**
   - Verify you can access `dsb-norge/ad-client`
   - Check repository permissions

3. ✅ **Create Migration Branch**
   - Clone `dsb-norge/ad-client` temporarily
   - Create branch: `feature/migrate-cicd-workflows`
   - Push empty initial commit

4. ✅ **Create Draft Pull Request**
   - Title: "CI/CD Pipeline Migration"
   - Body: Complete migration template
   - Status: Draft
   - Includes @github-copilot mention

5. ✅ **Add Delegation Comment**
   - Comments on PR to assign task to Copilot
   - Provides repository-specific context

### Step 3: Manual Assignment (if needed)

After the script completes, it will provide a PR URL. Open it and:

1. Go to the PR URL provided by the script
2. On the right sidebar, click "Assignees"
3. Search for `github-copilot` or `@github-copilot`
4. Click to assign

### Alternative: Manual Execution via GitHub UI

If you prefer not to use the script:

1. **Navigate to**: https://github.com/dsb-norge/ad-client

2. **Create Branch**:
   - Branch: `feature/migrate-cicd-workflows`
   - From: `main`

3. **Create Draft PR**:
   - Click "Pull requests" → "New pull request"
   - Base: `main`, Compare: `feature/migrate-cicd-workflows`
   - Click "Create draft pull request"
   - Title: `CI/CD Pipeline Migration`
   - Body: Copy entire content from `MIGRATION_TASK_TEMPLATE.md`
   - Add: 
     ```
     ---
     
     @github-copilot Please perform the CI/CD pipeline migration as outlined above.
     
     Repository-Specific Context:
     - Review all workflow files in .github/workflows/
     - Update to use latest actions from dsb-norge/github-actions
     - Ensure compatibility with current deployment pipeline
     - Test thoroughly before finalizing
     ```

4. **Assign to Copilot**:
   - Assignees → Search for `github-copilot` → Assign

## Expected Output

After successful delegation:

```
[INFO] Starting migration task delegation for: dsb-norge/ad-client
[INFO] Branch: feature/migrate-cicd-workflows (base: main)

[INFO] Checking prerequisites...
[INFO] Prerequisites check passed ✓

[INFO] Checking access to repository...
[INFO] Access confirmed ✓

[INFO] Creating branch in target repository...
[INFO] Branch created and pushed ✓

[INFO] Preparing pull request...
[INFO] Creating draft pull request...
[INFO] Draft PR created successfully ✓

[INFO] PR URL: https://github.com/dsb-norge/ad-client/pull/XXX

[INFO] Adding assignment comment...

======================================
Migration task delegation complete!
======================================

Next steps:
  1. Open the PR: https://github.com/dsb-norge/ad-client/pull/XXX
  2. Manually assign to @github-copilot if not already assigned
  3. Monitor progress through PR comments and commits
  4. Review and test changes when complete
```

## Monitoring the Migration

### 1. Check PR Status
```bash
gh pr view --repo dsb-norge/ad-client
```

### 2. View PR in Browser
Click the PR URL provided by the script

### 3. Monitor Copilot Activity
- Watch for comments from GitHub Copilot
- Check commits made by the bot
- Review progress against the migration checklist

## What Happens Next

After delegation, GitHub Copilot will:

1. **Analyze** the repository's workflow files
2. **Identify** actions that need updating
3. **Update** workflow files to use latest actions
4. **Test** the changes (syntax validation)
5. **Document** the changes made
6. **Commit** updates to the PR branch
7. **Comment** on progress and completion

Expected timeline: 1-2 hours for initial work, depending on complexity

## Verification Steps

Once Copilot completes the migration:

1. **Review Changes**
   ```bash
   gh pr diff --repo dsb-norge/ad-client
   ```

2. **Check Workflow Files**
   - All `.github/workflows/*.yml` files updated
   - Action versions point to latest releases
   - No deprecated syntax remains

3. **Validate Workflows**
   - Workflows pass syntax validation
   - Test runs execute successfully
   - No breaking changes introduced

4. **Review Documentation**
   - README files updated if needed
   - Changes are documented in PR

## Troubleshooting

### Script Fails: "gh: command not found"
```bash
# Install GitHub CLI
# macOS:
brew install gh

# Linux:
sudo apt install gh  # Ubuntu/Debian
sudo yum install gh  # Fedora/RHEL

# Windows:
winget install GitHub.cli
```

### Script Fails: "not logged into any GitHub hosts"
```bash
gh auth login
```

### Script Fails: "Cannot access repository"
- Verify repository exists: `gh repo view dsb-norge/ad-client`
- Check you have write access
- Confirm GitHub token has required permissions

### Copilot Doesn't Start Working
- Verify PR is assigned to `@github-copilot`
- Check Copilot has access to the repository
- Add a follow-up comment: `@github-copilot Please begin the migration`
- Wait a few minutes for Copilot to respond

### Branch Already Exists
```bash
# Use a different branch name
./delegate-migration-task.sh dsb-norge/ad-client --branch feat/cicd-migration-v2
```

## Success Criteria

The delegation is successful when:

- ✅ Draft PR is created in `dsb-norge/ad-client`
- ✅ PR contains the complete migration template
- ✅ PR is assigned to GitHub Copilot
- ✅ Copilot acknowledges the task (comments on PR)

## Next Steps After Successful Test

1. **Review** Copilot's work on ad-client
2. **Document** lessons learned
3. **Refine** migration template if needed
4. **Scale** to remaining 69 repositories
5. **Consider** batch processing script for efficiency

## Contact

If you encounter issues or have questions:
- Review [DELEGATION_GUIDE.md](./DELEGATION_GUIDE.md) for detailed explanations
- Check [MIGRATION_README.md](./MIGRATION_README.md) for project overview
- Consult [MIGRATION_TASK_TEMPLATE.md](./MIGRATION_TASK_TEMPLATE.md) for task details

---

**Ready to execute?** Run: `./delegate-migration-task.sh dsb-norge/ad-client`
