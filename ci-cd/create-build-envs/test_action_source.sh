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

if [ "${1-}" == "clean" ]; then
  del_files=$(find "${this_script_dir}" -name '_*' -print | sort)
  if [ ! -z "${del_files}" ]; then
    echo "deleting these:"
    echo "${del_files}" | xargs realpath --relative-to=$(pwd)
    echo "${del_files}" | xargs rm
  else
    echo "nothing to delete"
  fi
  exit 0
fi

# run tests
should_pass_test 'test_input_minimal' "${action_def_file}" "${this_script_dir}"
should_pass_test 'test_input_happy_day' "${action_def_file}" "${this_script_dir}"
should_pass_test 'test_input_helm_values_from_input' "${action_def_file}" "${this_script_dir}"
should_fail_test 'test_input_fail_yml_format' "${action_def_file}" "${this_script_dir}"

# should_pass_test 'test_cache_pr' "${action_def_file}" "${this_script_dir}"
# should_pass_test 'test_cache_non_pr' "${action_def_file}" "${this_script_dir}"
# should_pass_test 'test_cache_disabled' "${action_def_file}" "${this_script_dir}"
# should_pass_test 'test_cache_no_src_path_sb_app' "${action_def_file}" "${this_script_dir}"
# should_pass_test 'test_cache_no_src_path_vue_app' "${action_def_file}" "${this_script_dir}"
# should_pass_test 'test_cache_custom_cache_path' "${action_def_file}" "${this_script_dir}"
# should_pass_test 'test_cache_src_path_pom_sb_app' "${action_def_file}" "${this_script_dir}"
# should_fail_test 'test_cache_src_path_pom_vue_app' "${action_def_file}" "${this_script_dir}"
# should_pass_test 'test_cache_src_path_dir_vue_app' "${action_def_file}" "${this_script_dir}"
# should_pass_test 'test_cache_src_path_pkg_vue_app' "${action_def_file}" "${this_script_dir}"
# should_pass_test 'test_cache_src_path_na_sb_app' "${action_def_file}" "${this_script_dir}"
# should_pass_test 'test_cache_src_path_na_vue_app' "${action_def_file}" "${this_script_dir}"
