# Quick Reference: Delegate Migration to dsb-norge/ad-client

## TL;DR - Execute Now

```bash
# From the github-actions repository directory:
./delegate-migration-task.sh dsb-norge/ad-client
```

That's it! The script handles everything automatically.

---

## What Happens

1. Script creates branch `feature/migrate-cicd-workflows` in `dsb-norge/ad-client`
2. Creates draft PR with migration template
3. Assigns task to @github-copilot
4. Returns PR URL for monitoring

## Expected Result

```
✓ Branch created in dsb-norge/ad-client
✓ Draft PR created with migration instructions
✓ GitHub Copilot assigned/mentioned
→ PR URL: https://github.com/dsb-norge/ad-client/pull/XXX
```

## Next Steps

1. Open PR URL
2. Verify @github-copilot is assigned (assign manually if needed)
3. Monitor for Copilot's comments and commits
4. Review changes when complete

## If Script Fails

### Not authenticated?
```bash
gh auth login
```

### No access to repository?
- Check: `gh repo view dsb-norge/ad-client`
- Verify you have write permissions

### Branch already exists?
```bash
./delegate-migration-task.sh dsb-norge/ad-client --branch feat/cicd-v2
```

## Manual Alternative

1. Go to: https://github.com/dsb-norge/ad-client
2. Create branch: `feature/migrate-cicd-workflows`
3. Create draft PR from that branch
4. Copy content from `MIGRATION_TASK_TEMPLATE.md` to PR description
5. Assign to @github-copilot
6. Add comment: "@github-copilot Please perform the migration"

## Files in This Repository

| File | Purpose |
|------|---------|
| `delegate-migration-task.sh` | Automated delegation script |
| `MIGRATION_TASK_TEMPLATE.md` | Task template for Copilot |
| `EXECUTE_DELEGATION.md` | Detailed execution guide |
| `DELEGATION_GUIDE.md` | All delegation methods |
| `MIGRATION_README.md` | Full project documentation |

## Help

- **Quick help**: `./delegate-migration-task.sh --help`
- **Detailed instructions**: See `EXECUTE_DELEGATION.md`
- **All methods**: See `DELEGATION_GUIDE.md`
- **Project overview**: See `MIGRATION_README.md`

---

**Ready?** → `./delegate-migration-task.sh dsb-norge/ad-client`
