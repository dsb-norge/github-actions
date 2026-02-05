#!/bin/bash
# Script: delegate-migration-task.sh
# Purpose: Delegate CI/CD pipeline migration task to GitHub Copilot in a target repository

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_FILE="$SCRIPT_DIR/MIGRATION_TASK_TEMPLATE.md"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_usage() {
    cat <<EOF
Usage: $0 <target-repository> [options]

Delegate CI/CD pipeline migration task to GitHub Copilot in a target repository.

Arguments:
    target-repository    Target repository in format: owner/repo (e.g., dsb-norge/ad-client)

Options:
    -b, --branch NAME    Branch name for migration (default: feature/migrate-cicd-workflows)
    --base NAME          Base branch name (default: main)
    -h, --help           Show this help message

Examples:
    $0 dsb-norge/ad-client
    $0 dsb-norge/ad-client -b feat/cicd-update
    $0 dsb-norge/ad-client --base develop

Prerequisites:
    - GitHub CLI (gh) must be installed and authenticated
    - You must have write access to the target repository
    - The migration template file must exist: $TEMPLATE_FILE

EOF
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check if gh is installed
    if ! command -v gh &>/dev/null; then
        log_error "GitHub CLI (gh) is not installed. Please install it first."
        log_info "Visit: https://cli.github.com/"
        exit 1
    fi

    # Check if authenticated
    if ! gh auth status &>/dev/null; then
        log_error "GitHub CLI is not authenticated. Please run: gh auth login"
        exit 1
    fi

    # Check if template file exists
    if [ ! -f "$TEMPLATE_FILE" ]; then
        log_error "Migration template file not found: $TEMPLATE_FILE"
        exit 1
    fi

    log_info "Prerequisites check passed ✓"
}

# Parse arguments
if [ $# -eq 0 ]; then
    show_usage
    exit 1
fi

TARGET_REPO=""
BRANCH_NAME="feature/migrate-cicd-workflows"
BASE_BRANCH="main"

while [ $# -gt 0 ]; do
    case $1 in
    -h | --help)
        show_usage
        exit 0
        ;;
    -b | --branch)
        BRANCH_NAME="$2"
        shift 2
        ;;
    --base)
        BASE_BRANCH="$2"
        shift 2
        ;;
    -*)
        log_error "Unknown option: $1"
        show_usage
        exit 1
        ;;
    *)
        if [ -z "$TARGET_REPO" ]; then
            TARGET_REPO="$1"
        else
            log_error "Multiple repository arguments provided"
            show_usage
            exit 1
        fi
        shift
        ;;
    esac
done

# Validate target repository format
if [[ ! "$TARGET_REPO" =~ ^[a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+$ ]]; then
    log_error "Invalid repository format: $TARGET_REPO"
    log_info "Expected format: owner/repo (e.g., dsb-norge/ad-client)"
    exit 1
fi

# Main execution
log_info "Starting migration task delegation for: $TARGET_REPO"
log_info "Branch: $BRANCH_NAME (base: $BASE_BRANCH)"
echo

check_prerequisites
echo

# Check if repository exists and user has access
log_info "Checking access to repository..."
if ! gh repo view "$TARGET_REPO" &>/dev/null; then
    log_error "Cannot access repository: $TARGET_REPO"
    log_info "Please ensure:"
    log_info "  - The repository exists"
    log_info "  - You have access to the repository"
    log_info "  - Your GitHub token has the required permissions"
    exit 1
fi
log_info "Access confirmed ✓"
echo

# Create the branch in the target repository
# log_info "Creating branch in target repository..."
# log_warn "Note: This requires cloning the repository temporarily"

# TEMP_DIR=$(mktemp -d)
# trap "rm -rf $TEMP_DIR" EXIT

# cd "$TEMP_DIR"
# gh repo clone "$TARGET_REPO" repo -- --depth 1
# cd repo

# # Check if branch already exists
# if git ls-remote --heads origin "$BRANCH_NAME" | grep -q "$BRANCH_NAME"; then
#     log_warn "Branch '$BRANCH_NAME' already exists. Using existing branch."
# else
#     # Create and push new branch
#     git checkout -b "$BRANCH_NAME"
#     git commit --allow-empty -m "Initialize CI/CD migration task"
#     git push -u origin "$BRANCH_NAME"
#     log_info "Branch created and pushed ✓"
# fi
# echo

# Prepare PR body
log_info "Preparing pull request..."
PR_BODY=$(cat "$TEMPLATE_FILE")
PR_BODY="$PR_BODY

---

## Delegation to GitHub Copilot

@copilot Please perform the CI/CD pipeline migration as outlined in the task template above.

### Repository-Specific Context
- Repository: \`$TARGET_REPO\`
- Review all workflow files in \`.github/workflows/\`
- Update to use latest actions from \`dsb-norge/github-actions\`
- Ensure compatibility with current deployment pipeline
- Test thoroughly before finalizing

Please follow the migration steps and testing checklist provided in the template above."

# Attempt delegate using copilot cli
# copilot /delegate complete the API integration tests and fix any failing edge cases
log_info "Delegating task to GitHub Copilot..."
# copilot --prompt /delegate "$PR_BODY"
echo "$PR_BODY" | gh agent-task create --repo "$TARGET_REPO" --from-file -

# # Create draft PR
# log_info "Creating draft pull request..."
# PR_URL=$(gh pr create \
#     --repo "$TARGET_REPO" \
#     --draft \
#     --title "CI/CD Pipeline Migration" \
#     --body "$PR_BODY" \
#     --base "$BASE_BRANCH" \
#     --head "$BRANCH_NAME" 2>&1)

# if [ $? -eq 0 ]; then
#     log_info "Draft PR created successfully ✓"
#     echo
#     log_info "PR URL: $PR_URL"
#     echo
# else
#     log_error "Failed to create pull request"
#     log_error "$PR_URL"
#     exit 1
# fi

# # Try to assign to GitHub Copilot
# log_info "Attempting to assign to GitHub Copilot..."
# PR_NUMBER=$(gh pr list --repo "$TARGET_REPO" --head "$BRANCH_NAME" --json number -q '.[0].number')

# log_info "Assigning PR to @copilot..."
# gh pr edit "$PR_NUMBER" \
#     --repo "$TARGET_REPO" \
#     --add-assignee '@copilot' ||
#     log_warn "Could not assign to @copilot (this may be normal)"

# # Note: Assigning to bots may not work via API, so we'll add a comment also
# log_info "Adding assignment comment..."
# gh pr comment "$PR_NUMBER" \
#     --repo "$TARGET_REPO" \
#     --body "@copilot - This task is assigned to you. Please proceed with the migration as outlined above." ||
#     log_warn "Could not add comment (this may be normal)"

echo
log_info "======================================"
log_info "Migration task delegation complete!"
log_info "======================================"
echo
log_info "Next steps:"
# log_info "  1. Open the PR: $PR_URL"
log_info "  2. Manually assign to @copilot if not already assigned"
log_info "  3. Monitor progress through PR comments and commits"
log_info "  4. Review and test changes when complete"
echo
log_info "To manually assign in the GitHub UI:"
log_info "  - Go to the PR"
log_info "  - Click 'Assignees' in the right sidebar"
log_info "  - Search for and select 'copilot'"
echo

exit 0
