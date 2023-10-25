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
  test_data_file="${script_dir}/test_data/${test_file}"
  stdout_file="${script_dir}/__${test_file}.stdout"
  stderr_file="${script_dir}/__${test_file}.stderr"

  (
    set -euo pipefail
    trap 'trap_exit_positive_test $?' EXIT
    trap 'trap_exit_positive_test $?' ERR
    test_action "${action_def_file}" "${test_data_file}" >"${stdout_file}" 2>"${stderr_file}"
    # DEBUG
    # test_action "${action_def_file}" "${test_data_file}"
    set -uo pipefail
  )
  # echo "after should pass"
}

should_fail_test() {
  local script_dir test_file action_def_file
  test_file="${1}"
  action_def_file="${2}"
  script_dir="${3}"
  test_data_file="${script_dir}/test_data/${test_file}"
  stdout_file="${script_dir}/__${test_file}.stdout"
  stderr_file="${script_dir}/__${test_file}.stderr"

  (
    set -euo pipefail
    trap 'trap_exit_negative_test $?' EXIT
    trap 'trap_exit_negative_test $?' ERR
    test_action "${action_def_file}" "${test_data_file}" >"${stdout_file}" 2>"${stderr_file}"
    # DEBUG
    # test_action "${action_def_file}" "${test_data_file}"
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

  # ####################################################################
  # Handle input values from json input file
  # and merge with action input defaults where missing
  #

  # parse an query input json
  input_file="${input_file_prefix}.json"
  input_env_file="${input_file_prefix}.env"
  echo "input_file: ${input_file}"
  json_input=$(cat $input_file)
  function input-json-has-field { if [[ "$(echo "${json_input}" | jq --arg name "$1" 'has($name)')" == 'true' ]]; then true; else false; fi; }
  function input-json-get-val { echo "${json_input}" | jq -r --arg name "$1" '.[$name]'; }

  # merge action input defaults with json input
  defaults_merged_with_json_input='{}'
  function merged-input-set-val { defaults_merged_with_json_input=$(echo "${defaults_merged_with_json_input}" | jq --arg name "$1" --arg value "$2" '.[$name] = $value'); }
  function merged-input-get-val { echo "${defaults_merged_with_json_input}" | jq -r --arg name "$1" '.[$name]'; }
  function merged-input-has-field { if [[ "$(echo "${defaults_merged_with_json_input}" | jq --arg name "$1" 'has($name)')" == 'true' ]]; then true; else false; fi; }
  defaults_merged_with_json_input_escaped='{}'
  function merged-escaped-input-set-val { defaults_merged_with_json_input_escaped=$(echo "${defaults_merged_with_json_input_escaped}" | jq --arg name "$1" --arg value "$2" '.[$name] = $value'); }
  function merged-escaped-input-get-val { echo "${defaults_merged_with_json_input_escaped}" | jq -r --arg name "$1" '.[$name]'; }
  function merged-escaped-input-has-field { if [[ "$(echo "${defaults_merged_with_json_input_escaped}" | jq --arg name "$1" 'has($name)')" == 'true' ]]; then true; else false; fi; }
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
      merged-input-set-val "${action_input}" "${input_value}"
      _input_escaped=$(printf '%s\n' "${input_value}" | sed 's,[\/&],\\&,g;s/$/\\/')
      _input_escaped=${_input_escaped%?}
      # echo "_input_escaped: ${_input_escaped}"
      merged-escaped-input-set-val "${action_input}" "${_input_escaped}"
    fi
  done

  # the whole all action input
  all_action_inputs_escaped=$(printf '%s\n' "${defaults_merged_with_json_input}" | sed 's,[\/&],\\&,g;s/$/\\/')
  all_action_inputs_escaped=${all_action_inputs_escaped%?}

  #
  # ####################################################################

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
GITHUB_ACTION_PATH="${this_script_dir}"
GITHUB_OUTPUT="${this_script_dir}/_${step_id}.sh.out"
GITHUB_RUN_ID='123'
GITHUB_ACTION=${step_id}
_GITHUB_EVENT_NAME=push
echo "" > \$GITHUB_OUTPUT

EOF

    # make executable
    chmod +x "${step_src_file}"

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
        # DEBUG
        # echo "action_input: ${action_input}"
        if merged-escaped-input-has-field "${action_input}"; then
          json_input_escaped=$(merged-escaped-input-get-val "${action_input}")
          step_env_val="$(echo "$step_env_val" | sed "s/\${{ inputs\.${action_input} }}/$json_input_escaped/g")"
        fi
      done

      # replace any occurance of reading the whole action input
      step_env_val="$(echo "$step_env_val" | sed "s/\${{ toJSON(inputs) }}/$all_action_inputs_escaped/g")"

      # insert env name and value as bash variable in script file
      # echo "$step_env_val"
      cat <<OEOF >>"${step_src_file}"
${step_env_name}=\$(cat <<'IEOF'
${step_env_val}
IEOF
)

OEOF
    done

    # if there is a file named the same as the input file with an .env extension we include this
    # this way it's possible to have ex. GITHUB_WORKSPACE vary
    if [ -f "${input_env_file}" ]; then
      {
        echo ""
        echo "# ==================================================="
        echo "# START CODE FROM ${input_env_file}"
        echo "# ==================================================="
        echo ""
        cat "${input_env_file}"
      } >>"${step_src_file}"
    fi

    # write source from action step
    {
      echo ""
      echo "# ==================================================="
      echo "# START CODE FROM ACTION STEP DEF"
      echo "# ==================================================="
      echo ""
      echo "${step_src}"
    } >>"${step_src_file}"

    # replace any occurance of reading the whole action input
    sed -i "s/\${{ toJSON(inputs) }}/$all_action_inputs_escaped/g" "${step_src_file}"

    for action_input in ${action_inputs//,/ }; do
      # echo "action_input: ${action_input}"
      if merged-escaped-input-has-field "${action_input}"; then
        json_input_escaped=$(merged-escaped-input-get-val "${action_input}")
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
    sed -i "s/'\${{ github\.event_name }}'/"\${_GITHUB_EVENT_NAME}"/g" "${step_src_file}"
    sed -i "s/\${{ github\.event_name }}/\${_GITHUB_EVENT_NAME}/g" "${step_src_file}"
    sed -i "s/\${{ github\.server_url }}/https:\/\/github.com/g" "${step_src_file}"
    sed -i "s/\${{ github\.ref_name }}/the-calling-branch/g" "${step_src_file}"
    sed -i "s/\${{ github\.repository }}/calling-owner\/calling-repo/g" "${step_src_file}"
    sed -i "s/\${{ github\.action_path }}/\${__dirname}/g" "${step_src_file}"
    sed -i "s/\${{ github\.sha }}/randomSha/g" "${step_src_file}"
    sed -i "s/\${{ github\.head_ref }}/headRefSha/g" "${step_src_file}"
    sed -i "s/\${{ runner\.os }}/Linux/g" "${step_src_file}"

    # prevent curling to github
    sed -i "s/REPO_DEFAULT_BRANCH=/REPO_DEFAULT_BRANCH='main' # REPO_DEFAULT_BRANCH=/g" "${step_src_file}"

    # control path of output file
    out_json_file=$(echo "${this_script_dir}/_${step_id}.OUT_JSON_FILE.out" | sed 's,[\/&],\\&,g;s/$/\\/')
    sed -i "s/OUT_JSON_FILE=/OUT_JSON_FILE='${out_json_file}' # OUT_JSON_FILE=/g" "${step_src_file}"

    # remove some debug
    sed -i "s/echo \"\${DEBUG_VARS_JSON/# echo \"\${DEBUG_VARS_JSON/g" "${step_src_file}"

    # DEBUG
    # exit 1

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
