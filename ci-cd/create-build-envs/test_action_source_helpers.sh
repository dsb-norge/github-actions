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
  # echo "in trap_exit_positive_test, *: $*"
  [ ! "$1" == "0" ] &&
    echo -e "\e[31mX\e[0m test fail for '${test_file}'" >$(tty) ||
    echo -e "\e[32m✓\e[0m test pass for '${test_file}'" >$(tty)
}

trap_exit_negative_test() {
  # echo "in trap_exit_negative_test, *: $*"
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
    test_action "${action_def_file}" "${script_dir}/${test_file}" >"${script_dir}/__${test_file}.stdout" 2>"${script_dir}/__${test_file}.stderr"
    # DEBUG
    # test_action "${action_def_file}" "${script_dir}/${test_file}"
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
    test_action "${action_def_file}" "${script_dir}/${test_file}" >"${script_dir}/__${test_file}.stdout" 2>"${script_dir}/__${test_file}.stderr"
    # DEBUG
    # test_action "${action_def_file}" "${script_dir}/${test_file}"
    set -uo pipefail
  )
  # echo "after should fail"
}

test_action() {
  local action_file input_file_prefix this_script_dir

  action_file="${1}"
  input_file_prefix="${2}"
  this_script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)

  # read github actions def with yq
  readarray action_steps < <(yq e -o=j -I=0 --expression='.runs.steps[]' "${action_file}")
  action_inputs=$(yq e -o=csv -I=0 --expression='.inputs | keys' "${action_file}")

  # count
  i=1

  # loop all steps in action
  for step in "${action_steps[@]}"; do
    step_id=$(echo "$step" | yq e '.id' -)
    step_src=$(echo "$step" | yq e '.run' -)

    # NOTE: we only test one step for now
    if [ ! "${step_id}" == "build-env" ]; then
      continue
    fi

    print_divider "step id: $i $step_id"

    # the source code for the step will be written to this file
    step_src_file="${this_script_dir}/_${i}_${step_id}.sh"

    # add some init code
    cat <<EOF >"${step_src_file}"
#!/bin/env bash
set -euo pipefail
__dirname="${this_script_dir}"
GITHUB_OUTPUT="${this_script_dir}/_${step_id}.sh.out"
GITHUB_RUN_ID='123'
GITHUB_ACTION=${step_id}
echo "" > \$GITHUB_OUTPUT

EOF

    # make executable
    chmod +x "${step_src_file}"

    # parse an query input json
    input_file="${input_file_prefix}.json"
    echo "input_file: ${input_file}"
    json_input=$(cat $input_file)
    function input-json-has-field { if [[ "$(echo "${json_input}" | jq --arg name "$1" 'has($name)')" == 'true' ]]; then true; else false; fi; }
    function input-json-get-val { echo "${json_input}" | jq -r --arg name "$1" '.[$name]'; }

    # the whole all action input
    all_json_input_escaped=$(printf '%s\n' "${json_input}" | sed 's,[\/&],\\&,g;s/$/\\/')
    all_json_input_escaped=${all_json_input_escaped%?}

    # convert step 'env:' fields to bash variables
    # loop all 'env:' fields
    step_env_names=$(echo "$step" | yq -o=csv -I=0 --expression='.env | keys' -)
    # echo "$step_env_names"
    for step_env_name in ${step_env_names//,/ }; do
      # echo "$step_env_name"
      step_env_val="$(echo "$step" | yq -o=csv -I=0 --expression=".env.$step_env_name" -)"
      # echo "$step_env_val"

      # loop action inputs and replace in env value
      for action_input in ${action_inputs//,/ }; do
        # echo "action_input: ${action_input}"

        # check input json first, then action input default values
        if input-json-has-field "${action_input}"; then
          input_value=$(input-json-get-val "${action_input}")
        else
          input_value=$(yq e -o=csv -I=0 --expression=".inputs | .${action_input} | .default " "${action_file}")
        fi

        # for inputs where a value was found, replace in env value
        if [ ! "null" == "${input_value}" ]; then
          json_input_escaped=$(printf '%s\n' "${input_value}" | sed 's,[\/&],\\&,g;s/$/\\/')
          json_input_escaped=${json_input_escaped%?}
          step_env_val="$(echo "$step_env_val" | sed "s/\${{ inputs\.${action_input} }}/$json_input_escaped/g")"
        fi
      done

      # replace any occurance of reading the whole action input
      step_env_val="$(echo "$step_env_val" | sed "s/\${{ toJSON(inputs) }}/$all_json_input_escaped/g")"

      # insert env name and value as bash variable in script file
      # echo "$step_env_val"
      cat <<OEOF >>"${step_src_file}"
${step_env_name}=\$(cat <<'IEOF'
${step_env_val}
IEOF
)

OEOF
    done

    # write source from action step
    {
      echo "# ==================================================="
      echo "# START CODE FROM ACTION STEP DEF"
      echo "# ==================================================="
      echo ""
      echo "${step_src}"
    } >>"${step_src_file}"

    # replace any occurance of reading the whole action input
    sed -i "s/\${{ toJSON(inputs) }}/$all_json_input_escaped/g" "${step_src_file}"

    for action_input in ${action_inputs//,/ }; do
      # echo "action_input: ${action_input}"

      if input-json-has-field "${action_input}"; then
        input_value=$(input-json-get-val "${action_input}")
      else
        input_value=$(yq e -o=csv -I=0 --expression=".inputs | .${action_input} | .default " "${action_file}")
      fi

      if [ "null" == "${input_value}" ]; then
        echo "Found no value for input '${action_input}'"
      else
        # echo "input_value: ${input_value}"
        json_input_escaped=$(printf '%s\n' "${input_value}" | sed 's,[\/&],\\&,g;s/$/\\/')
        json_input_escaped=${json_input_escaped%?}
        # echo "json_input_escaped: ${json_input_escaped}"
        sed -i "s/\${{ inputs\.${action_input} }}/$json_input_escaped/g" "${step_src_file}"
      fi
    done

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
    sed -i "s/echo 'json<</# echo 'app-vars<</g" "${step_src_file}"
    sed -i "s/echo '\"\${{ github\.run_id/# echo '\"\${{ github\.run_id/g" "${step_src_file}"
    sed -i "s/echo \"json-without-secrets-path=/# echo \"json-without-secrets-path=/g" "${step_src_file}"
    sed -i "s/echo \"build-envs-artifact-name=/# echo \"build-envs-artifact-name=/g" "${step_src_file}"

    # replace github action vars
    sed -i "s/\${{ github\.event\.number }}/9999/g" "${step_src_file}"
    sed -i "s/\${{ github\.ref_name }}/the-calling-branch/g" "${step_src_file}"
    sed -i "s/\${{ github\.repository }}/calling-owner\/calling-repo/g" "${step_src_file}"
    sed -i "s/\${{ github\.action_path }}/\${__dirname}/g" "${step_src_file}"

    # prevent curling to github
    sed -i "s/REPO_DEFAULT_BRANCH=/REPO_DEFAULT_BRANCH='main' # REPO_DEFAULT_BRANCH=/g" "${step_src_file}"

    # control path of output file
    out_json_file=$(echo "${this_script_dir}/_${step_id}.OUT_JSON_FILE.out" | sed 's,[\/&],\\&,g;s/$/\\/')
    sed -i "s/OUT_JSON_FILE=/OUT_JSON_FILE='${out_json_file}' # OUT_JSON_FILE=/g" "${step_src_file}"

    # remove some debug
    sed -i "s/echo \"\${DEBUG_VARS_JSON/# echo \"\${DEBUG_VARS_JSON/g" "${step_src_file}"

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
