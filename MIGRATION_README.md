# CI/CD Pipeline Migration Project

## Overview

This directory contains templates and tools for migrating CI/CD pipeline workflows across DSB repositories. The migration aims to update 70+ repositories to use the latest GitHub Actions from the `dsb-norge/github-actions` repository and follow current best practices.

## Project Files

- **[MIGRATION_TASK_TEMPLATE.md](./MIGRATION_TASK_TEMPLATE.md)** - Comprehensive task template for CI/CD migration
- **[DELEGATION_GUIDE.md](./DELEGATION_GUIDE.md)** - Guide for delegating tasks to GitHub Copilot
- **[delegate-migration-task.sh](./delegate-migration-task.sh)** - Automated delegation script

## Quick Start

### Test Migration (dsb-norge/ad-client)

To test the migration process on the `dsb-norge/ad-client` repository:

#### Option 1: Automated Script (Recommended)

```bash
# Navigate to the github-actions repository
cd /path/to/github-actions

# Run the delegation script
./delegate-migration-task.sh dsb-norge/ad-client

# Optional: Specify custom branch name
./delegate-migration-task.sh dsb-norge/ad-client --branch feat/cicd-migration
```

The script will:
1. ✅ Check prerequisites (GitHub CLI authentication)
2. ✅ Verify access to target repository
3. ✅ Create migration branch
4. ✅ Create draft pull request with task template
5. ✅ Add delegation comment for GitHub Copilot

#### Option 2: Manual Process

See the [DELEGATION_GUIDE.md](./DELEGATION_GUIDE.md) for detailed manual steps.

## Migration Process

### Phase 1: Test Migration
- [ ] Test on single repository (dsb-norge/ad-client)
- [ ] Review Copilot's changes
- [ ] Validate migration approach
- [ ] Refine template based on learnings

### Phase 2: Batch Migration
- [ ] Create list of target repositories
- [ ] Run batch migration script
- [ ] Monitor progress across all repositories
- [ ] Coordinate reviews and merges

### Phase 3: Validation
- [ ] Verify all migrations are complete
- [ ] Ensure all workflows are functional
- [ ] Document any repository-specific adjustments
- [ ] Update migration statistics

## Migration Objectives

1. **Update GitHub Actions References**
   - Migrate to latest versions from `dsb-norge/github-actions`
   - Update action paths and parameters

2. **Modernize Workflow Structure**
   - Follow current GitHub Actions best practices
   - Remove deprecated syntax and features
   - Optimize workflow execution

3. **Align with DSB Standards**
   - Follow TypeScript/Deno conventions
   - Use helpers from `common/utils/`
   - Implement proper error handling

## Prerequisites

### For Running Delegation Script

- **GitHub CLI** (`gh`) installed and authenticated
  ```bash
  # Check if installed
  gh --version
  
  # Authenticate if needed
  gh auth login
  ```

- **Access Permissions**
  - Write access to target repositories
  - Ability to create branches and PRs

### For Repository Migration

- GitHub Copilot access enabled in target repositories
- Understanding of the migration template
- Familiarity with DSB GitHub Actions structure

## Monitoring Progress

### For Individual Repository

1. Open the pull request in GitHub
2. Review comments from GitHub Copilot
3. Check commits made by Copilot
4. Verify against the testing checklist in the template

### For Batch Migration

```bash
# List all migration PRs
gh pr list --search "is:pr author:app/github-copilot 'CI/CD Pipeline Migration'" --json number,title,state,url

# Check status of specific repository
gh pr view --repo dsb-norge/ad-client
```

## Expected Timeline

- **Test Migration**: 1-2 days (including review and refinement)
- **Batch Migration**: 1-2 weeks (depending on repository complexity)
- **Validation**: 1 week (including testing and adjustments)

## Success Criteria

For each migrated repository:

- ✅ All workflow files updated to latest action versions
- ✅ Workflows execute successfully
- ✅ No breaking changes to existing functionality
- ✅ Documentation updated
- ✅ Changes follow DSB coding standards
- ✅ All tests passing

## Troubleshooting

### Common Issues

**Issue**: GitHub CLI not authenticated
```bash
Solution: gh auth login
```

**Issue**: Cannot access target repository
```bash
Solution: Verify repository name and access permissions
gh repo view dsb-norge/ad-client
```

**Issue**: Branch already exists
```bash
Solution: Use different branch name or delete existing branch
./delegate-migration-task.sh dsb-norge/ad-client --branch feat/cicd-migration-v2
```

**Issue**: Copilot not responding
```bash
Solution: 
1. Check PR is assigned to @github-copilot
2. Verify Copilot has repository access
3. Add follow-up comment mentioning @github-copilot
```

## Next Steps

1. **Review this documentation** and familiarize yourself with the migration process
2. **Test the delegation script** on `dsb-norge/ad-client`
3. **Monitor the test migration** and gather feedback
4. **Refine the template** based on test results
5. **Proceed with batch migration** of remaining repositories

## Support

For questions or issues:
- Review the [DELEGATION_GUIDE.md](./DELEGATION_GUIDE.md)
- Check the [MIGRATION_TASK_TEMPLATE.md](./MIGRATION_TASK_TEMPLATE.md)
- Consult the [copilot-instructions.md](.github/copilot-instructions.md)

## Related Documentation

- [DSB GitHub Actions README](./README.md)
- [CI/CD Actions README](./ci-cd/README.md)
- [Copilot Instructions](.github/copilot-instructions.md)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [GitHub Copilot Documentation](https://docs.github.com/en/copilot)
