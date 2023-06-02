#!/bin/env bash
#
# See test_action_source.sh
#

print_divider() {
  local message="${1-}"
  if [[ -n "${message}" ]]; then
    echo ""
    echo ""
    echo "${message}"
  fi
  echo "$(printf '=%.0s' {1..120})"
}

trap_exit_positive_test() {
  [ ! "$1" == "0" ] &&
    echo -e "\e[31mX\e[0m test fail for '${test_file}'" >$(tty) ||
    echo -e "\e[32m✓\e[0m test pass for '${test_file}'" >$(tty)
}

trap_exit_negative_test() {
  [ "$1" == "0" ] &&
    echo -e "\e[31mX\e[0m test fail for '${test_file}'" >$(tty) ||
    echo -e "\e[32m✓\e[0m test pass for '${test_file}'" >$(tty)
}

should_pass_test() {
  local script_dir test_file action_def_file
  test_file="${1}"
  action_def_file="${2}"
  script_dir="${3}"

  (
    set -euo pipefail
    trap 'trap_exit_positive_test $?' EXIT
    trap 'trap_exit_positive_test $?' ERR
    test_action "${action_def_file}" "${script_dir}/${test_file}.yml" >"${script_dir}/__${test_file}.stdout" 2>"${script_dir}/__${test_file}.stderr"
    set -uo pipefail
  )
  # echo "after should pass"
}

should_fail_test() {
  local script_dir test_file action_def_file
  test_file="${1}"
  action_def_file="${2}"
  script_dir="${3}"

  (
    set -euo pipefail
    trap 'trap_exit_negative_test $?' EXIT
    trap 'trap_exit_negative_test $?' ERR
    test_action "${action_def_file}" "${script_dir}/${test_file}.yml" >"${script_dir}/__${test_file}.stdout" 2>"${script_dir}/__${test_file}.stderr"
    set -uo pipefail
  )
  # echo "after should fail"
}

test_action() {
  local action_file yml_input_file this_script_dir

  action_file="${1}"
  yml_input_file="${2}"
  this_script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)

  # read github actions def with yq
  readarray action_steps < <(yq e -o=j -I=0 --expression='.runs.steps[]' "${action_file}")

  # count
  i=1

  # loop all steps in action
  for step in "${action_steps[@]}"; do
    step_id=$(echo "$step" | yq e '.id' -)
    step_src=$(echo "$step" | yq e '.run' -)

    print_divider "step id: $i $step_id"

    # the source code for the step will be written to this file
    step_src_file="${this_script_dir}/_${i}_${step_id}.sh"

    # add some init code
    cat <<EOF >"${step_src_file}"
#!/bin/env bash
set -euo pipefail
__dirname="${this_script_dir}"
GITHUB_OUTPUT="${this_script_dir}/_${step_id}.sh.out"
echo "" > \$GITHUB_OUTPUT

EOF

    # make executable
    chmod +x "${step_src_file}"

    # write source from action step
    echo "${step_src}" >>"${step_src_file}"

    # insert input yaml
    yml_input=$(cat $yml_input_file)
    yml_input_escaped=$(printf '%s\n' "${yml_input}" | sed 's,[\/&],\\&,g;s/$/\\/')
    yml_input_escaped=${yml_input_escaped%?}
    sed -i "s/\${{ inputs\.apps }}/$yml_input_escaped/g" "${step_src_file}"

    # insert input json from steps
    for _step in "${action_steps[@]}"; do
      _step_id=$(echo "$_step" | yq e '.id' -)

      # if output file exists
      step_output_file="${this_script_dir}/_${_step_id}.sh.out"
      if [ -f "${step_output_file}" ]; then
        # read output and escape
        json=$(cat "${step_output_file}")
        json_escaped=$(printf '%s\n' "${json}" | sed 's,[\/&],\\&,g;s/$/\\/')
        json_escaped=${json_escaped%?}

        # replace github actions variable with json blob
        sed -i "s/\${{ steps\.${_step_id}\.outputs\.app-vars }}/$json_escaped/g" "${step_src_file}"
      fi
    done

    # fix actions output in step source
    sed -i "s/echo 'app-vars<</# echo 'app-vars<</g" "${step_src_file}"
    sed -i "s/echo '\"\${{ github\.run_id/# echo '\"\${{ github\.run_id/g" "${step_src_file}"
    sed -i "s/echo \"applications-version=/# echo \"applications-version=/g" "${step_src_file}"

    # replace github action vars
    sed -i "s/\${{ github\.event\.number }}/9999/g" "${step_src_file}"
    sed -i "s/\${{ github\.action_path }}/\${__dirname}/g" "${step_src_file}"

    # debug
    # [ $i == 7 ] && break

    # execute
    env -i HOME="$HOME" bash -l -c "${step_src_file}"
    [ "$?" == "0" ] &&
      echo "SUCCESS: ${step_src_file}" ||
      echo "FAILURE: ${step_src_file}"

    # debug
    # [ $i == 7 ] && break

    ((i++))
  done
}
