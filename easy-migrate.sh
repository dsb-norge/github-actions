#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_FILE="$SCRIPT_DIR/MIGRATION_TASK_TEMPLATE.md"
PR_BODY=$(cat "$TEMPLATE_FILE")
PR_BODY="$PR_BODY

---

## Delegation to GitHub Copilot

@copilot Please perform the CI/CD pipeline migration as outlined in the task template above.

### Repository-Specific Context
- Repository: \`$REPO\`
- Review all workflow files in \`.github/workflows/\`
- Update to use latest actions from \`dsb-norge/github-actions\`
- Ensure compatibility with current deployment pipeline
- Test thoroughly before finalizing

Please follow the migration steps and testing checklist provided in the template above."

echo "$PR_BODY" |
  gh agent-task create \
    --repo "$REPO" \
    --from-file -
