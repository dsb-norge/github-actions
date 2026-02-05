# Migration Task Delegation Guide

## Purpose
This guide explains how to delegate the CI/CD pipeline migration task to GitHub Copilot in target repositories.

## Target Repository
**Repository**: `dsb-norge/ad-client`

## Prerequisites
- Access to the target repository (`dsb-norge/ad-client`)
- GitHub CLI (`gh`) installed and authenticated
- Permissions to create branches and draft PRs in the target repository

## Delegation Methods

### Method 1: Using GitHub Web Interface (Recommended)

1. **Navigate to the target repository**
   - Go to https://github.com/dsb-norge/ad-client

2. **Create a new branch**
   - Branch name: `feature/migrate-cicd-workflows` or similar
   - From: `main` (or default branch)

3. **Create a Draft Pull Request**
   - Click "Pull requests" → "New pull request"
   - Select your feature branch
   - Click "Create draft pull request"
   - Title: `CI/CD Pipeline Migration`
   - Description: Copy the content from [MIGRATION_TASK_TEMPLATE.md](./MIGRATION_TASK_TEMPLATE.md)

4. **Assign to GitHub Copilot**
   - In the PR sidebar, click "Assignees"
   - Type `@github-copilot` or search for the Copilot bot
   - Click to assign

5. **Add context** (in a PR comment or description)
   ```
   @github-copilot Please perform the CI/CD pipeline migration as outlined in the task template.
   
   Repository-specific context:
   - Review all workflow files in `.github/workflows/`
   - Ensure compatibility with our current deployment pipeline
   - Test thoroughly before finalizing
   
   Please follow the migration steps and testing checklist provided in the template.
   ```

### Method 2: Using GitHub CLI

If you have GitHub CLI configured with appropriate permissions:

```bash
# Set up environment
export TARGET_REPO="dsb-norge/ad-client"
export BRANCH_NAME="feature/migrate-cicd-workflows"
export GH_TOKEN="your-token-here"

# Clone and set up the target repository
gh repo clone $TARGET_REPO
cd ad-client

# Create a new branch
git checkout -b $BRANCH_NAME

# Create initial commit (optional - can be empty)
git commit --allow-empty -m "Start CI/CD migration"
git push -u origin $BRANCH_NAME

# Create a draft PR with the migration template
gh pr create \
  --draft \
  --title "CI/CD Pipeline Migration" \
  --body-file ../github-actions/MIGRATION_TASK_TEMPLATE.md \
  --assignee "github-copilot" \
  --base main \
  --head $BRANCH_NAME

# Add a comment with specific instructions
gh pr comment --body "@github-copilot Please perform the CI/CD pipeline migration as outlined in the task template above."
```

### Method 3: Using the GitHub API

For programmatic delegation across multiple repositories:

```bash
#!/bin/bash
# Script: delegate-migration.sh

TARGET_REPO="dsb-norge/ad-client"
BRANCH_NAME="feature/migrate-cicd-workflows"
BASE_BRANCH="main"
MIGRATION_TEMPLATE=$(cat MIGRATION_TASK_TEMPLATE.md)

# Create PR body
PR_BODY="$MIGRATION_TEMPLATE

---

@github-copilot Please perform the CI/CD pipeline migration as outlined above.

Repository-specific notes:
- Review all workflow files in .github/workflows/
- Ensure compatibility with current deployment pipeline
- Test thoroughly before finalizing"

# Create draft PR using GitHub API
gh api \
  repos/$TARGET_REPO/pulls \
  -X POST \
  -f title="CI/CD Pipeline Migration" \
  -f body="$PR_BODY" \
  -f head="$BRANCH_NAME" \
  -f base="$BASE_BRANCH" \
  -F draft=true

# Get PR number
PR_NUMBER=$(gh pr list --repo $TARGET_REPO --head $BRANCH_NAME --json number -q '.[0].number')

# Assign to Copilot (if assignee API supports bots)
# Note: This may require specific permissions
gh api \
  repos/$TARGET_REPO/issues/$PR_NUMBER/assignees \
  -X POST \
  -f assignees[]="github-copilot"
```

## Task Template Details

The migration task includes:

1. **Analysis Phase**
   - Identify workflow files
   - Document current configurations
   - Identify deprecated features

2. **Update Phase**
   - Update action references
   - Migrate custom scripts to TypeScript/Deno
   - Update parameters and environment variables

3. **Testing Phase**
   - Validate syntax
   - Test in feature branch
   - Verify execution

4. **Documentation Phase**
   - Document changes
   - Update README files
   - Note breaking changes

## Monitoring Progress

After delegation:

1. **Check PR comments** for Copilot's updates
2. **Review commits** made by Copilot
3. **Validate changes** against the testing checklist
4. **Provide feedback** through PR comments if adjustments are needed

## Expected Outcomes

After Copilot completes the migration:

- ✅ All workflow files updated to latest action versions
- ✅ Workflows execute successfully
- ✅ No breaking changes to existing functionality
- ✅ Documentation updated
- ✅ Changes follow DSB coding standards

## Troubleshooting

### Copilot doesn't respond
- Ensure Copilot has access to the repository
- Check that the PR is assigned to the correct Copilot user/app
- Try mentioning @github-copilot in a new comment

### Migration incomplete
- Review Copilot's comments for any blockers
- Provide additional context or clarification
- Break down the task into smaller steps if needed

### Tests failing
- Review the specific failures
- Ask Copilot to address specific issues
- Provide repository-specific context that may be missing

## Next Steps

After successful migration of `dsb-norge/ad-client`:

1. Review the changes and lessons learned
2. Update this template based on feedback
3. Proceed with migrating the remaining 69 repositories
4. Consider creating a batch migration script for efficiency

## References

- [MIGRATION_TASK_TEMPLATE.md](./MIGRATION_TASK_TEMPLATE.md) - The task template
- [DSB GitHub Actions](./) - This repository
- [GitHub Copilot Documentation](https://docs.github.com/en/copilot)
