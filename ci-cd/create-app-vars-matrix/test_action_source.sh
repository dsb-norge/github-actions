#!/bin/env bash
#
# A way of actually running the bash code from this github action locally during development
#
set -uo pipefail

this_script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)

# the github actions def to test
action_def_file="${this_script_dir}/action.yml"

# load test runner code
source "${this_script_dir}/test_action_source_helpers.sh"

# run tests
should_pass_test 'test_input_minimal' "${action_def_file}" "${this_script_dir}"
should_pass_test 'test_input_happy_day' "${action_def_file}" "${this_script_dir}"
should_fail_test 'test_input_fail_src_dir' "${action_def_file}" "${this_script_dir}"
