# CI/CD Pipeline Migration Task Template

## Overview
This template describes the migration task for updating CI/CD pipeline workflows to use the latest DSB GitHub Actions and follow current best practices.

## Migration Objectives

1. **Update GitHub Actions References**
   - Migrate from old action references to the latest versions from `dsb-norge/github-actions`
   - Update action paths and input parameters as needed

2. **Modernize Workflow Structure**
   - Ensure workflows follow current GitHub Actions best practices
   - Update deprecated syntax and features
   - Optimize workflow execution

3. **Align with DSB Standards**
   - Follow the coding standards outlined in `.github/copilot-instructions.md`
   - Use TypeScript/Deno for custom action steps
   - Implement proper error handling and logging

## Migration Steps

### 1. Analysis Phase
- [ ] Identify all workflow files in `.github/workflows/`
- [ ] Document current action versions and configurations
- [ ] Identify deprecated features and outdated patterns
- [ ] Review dependencies and required permissions

### 2. Update Phase
- [ ] Update action references to latest versions
- [ ] Migrate custom bash scripts to TypeScript/Deno where appropriate
- [ ] Update input/output parameters to match new action signatures
- [ ] Update environment variable handling
- [ ] Add proper error handling and logging

### 3. Testing Phase
- [ ] Validate workflow syntax using `gh workflow view`
- [ ] Test workflows in a feature branch
- [ ] Verify all jobs execute successfully
- [ ] Confirm expected outputs are produced

### 4. Documentation Phase
- [ ] Document changes made
- [ ] Update workflow README files if they exist
- [ ] Note any breaking changes or required follow-up actions

## Key Action Migrations

### CI/CD Actions (from `ci-cd/`)
- **Build/Test Actions**: Update to use latest TypeScript/Deno implementations
- **Deployment Actions**: Ensure proper permission handling
- **Utility Actions**: Update to use helpers from `common/utils/`

### Common Patterns to Update

1. **Input Handling**
   ```yaml
   # Old pattern (if applicable)
   - uses: dsb-norge/github-actions/old-action@vX
     with:
       old-param: value
   
   # New pattern
   - uses: dsb-norge/github-actions/new-action@latest
     with:
       new-param: value
   ```

2. **Environment Variables**
   ```yaml
   # Ensure proper env var passing
   env:
     INPUT_DSB_BUILD_ENVS: ${{ inputs.dsb-build-envs }}
     GITHUB_WORKSPACE: ${{ github.workspace }}
   ```

3. **Error Handling**
   - Ensure all steps have proper failure handling
   - Use appropriate `continue-on-error` settings
   - Add timeout limits where appropriate

## Testing Checklist

Before completing the migration, verify:
- [ ] All workflow files are syntactically valid
- [ ] No deprecated GitHub Actions features are used
- [ ] All required permissions are specified
- [ ] Workflows can run successfully (test in draft PR)
- [ ] No secrets or sensitive data are exposed in logs
- [ ] Build and test jobs complete successfully

## Delegation Instructions

To delegate this task to GitHub Copilot in a target repository:

1. **Create a draft PR** in the target repository
2. **Assign to @github-copilot** 
3. **Include this template** in the PR description
4. **Add repository-specific context**:
   - Current workflow structure
   - Specific actions being used
   - Any custom requirements or constraints

## Repository-Specific Notes

_(Add any repository-specific information here when delegating)_

## Success Criteria

- All workflow files are updated to use latest action versions
- Workflows execute successfully in test runs
- No breaking changes to existing functionality
- Documentation is updated
- Changes follow DSB coding standards

## References

- [DSB GitHub Actions Repository](https://github.com/dsb-norge/github-actions)
- [Copilot Instructions](.github/copilot-instructions.md)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
