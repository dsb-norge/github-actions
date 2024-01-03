#!/bin/env bash

#####################################################################
#
# sub functions
#
#####################################################################

# parse YAML file using yq
# removes any comments in the YAML file using the yq
# default to empty map if input is empty
function strip-comments-from-helm-value-overrides-yaml {
  local inFile outFile
  inFile="$1"
  outFile=$(mktemp)
  # make sure any comments are stripped out
  yq '
    . // {} |
    ... comments=""
    ' --input-format yaml --output-format yaml "${inFile}" >"${outFile}"
  echo "${outFile}"
}

# parse YAML file using yq
# convert a YAML file into a JSON file using the yq
# default to empty map if input is empty
# NOTE: this only converts data of .parameters of the input YAML file
function convert-helm-value-params-overrides-yaml-to-json {
  local inFile outFile
  inFile="$1"
  outFile=$(mktemp)
  yq '
    . // {} |
    .parameters // {}
    ' --input-format yaml --output-format json "${inFile}" >"${outFile}"
  echo "${outFile}"
}

# parse YAML file using yq
# return a JSON list of all keys with dot in key name
# NOTE: this only looks at .parameters of the input YAML file
function get-list-of-flat-keys-with-dot {
  local inFile outData
  inFile="$1"
  # shellcheck disable=SC2016
  outData=$(yq '
    .parameters as $params |
    [
      $params |
      ... |
      select(
        is_key
        and style != "single"
        and style != "double"
      )
    ] as $paramKeys |
    [
      $paramKeys.[] |
      select(test("\."))
    ] as $keysToFix |
    [ $keysToFix.[] ]
    ' --input-format yaml --output-format json "${inFile}")
  echo "${outData}"
}

# parse YAML file using yq
# return a JSON list of all keys with indexed array notation in key name
# NOTE: this only looks at .parameters of the input YAML file
# eg. 'list[0]' in this example:
#   parameters:
#     my:
#       list[0]: a
#       list[1]: b
function get-list-of-flat-keys-with-array {
  local inFile outData
  inFile="$1"
  # shellcheck disable=SC2016
  outData=$(yq '
    .parameters as $params |
    [
      $params |
      ... |
      select(
        is_key
        and style != "single"
        and style != "double"
      )
    ] as $paramKeys |
    [
      $paramKeys.[] |
      select(test(".+\[[0-9]+\]"))
    ] as $arraysToFix |
    [ $arraysToFix.[] ]
  ' --input-format yaml --output-format json "${inFile}")
  echo "${outData}"
}

# parse JSON file using jq
# flattened keys with dot in key name to nested JSON structure
# ex
#   a.b.c: 1
#   a.b.d: 2
# becomes
#   a:
#     b:
#       c: 1
#       d: 2
function convert-from-flat-keys-with-dot-to-nested {
  local inFile outFile flatKeysList
  inFile="$1"
  flatKeysList="$2"
  outFile=$(mktemp)
  jq -r --argjson keysToDelete "${flatKeysList}" '
    walk(
      if type == "object"
      then (
        reduce(
          to_entries[] |
          if .key | ( test("^\\\"") | not )
          then .key | split(".")
          else .key
          end
        ) as $item
        (
          .;
          setpath(
            $item;
            .[
              $item |
              join(".")
            ]
          )
        ) |
        with_entries(
          select(
            .key as $k |
            $keysToDelete | index($k) | not
          )
        )
      )
      else .
      end
    )' "${inFile}" >"${outFile}"
  echo "${outFile}"
}

# parse JSON file using jq
# flattened arrays with index notation to JSON arrays
# ex
#   a[0]: b
#   a[0]: c
#   a[1]: 2
# becomes
#   a:
#     - b
#       c
#     - 2
function convert-from-flat-keys-with-array-to-nested {
  local inFile outFile flatArraysList
  inFile="$1"
  flatArraysList="$2"
  outFile=$(mktemp)
  jq -r --argjson keysToDelete "${flatArraysList}" '
    walk(
      if type == "object"
      then (
        reduce(
          to_entries[] |
          select(
            .key | test(".+\\[[0-9]+\\]")
          ) |
          (
            .key | capture("(?<name>.+)\\[[0-9]+\\]") |
            .name
          ) as $arrayName |
          . + { "arrayName": ($arrayName) }
        ) as {$key, $value, $arrayName}
        (
          .;
          . += {
            ($arrayName) : (
              ( .[$arrayName] // [] ) + [ ($value) ]
            )
          } | del(.[$key])
        )
      )
      else .
      end
    )' "${inFile}" >"${outFile}"
  echo "${outFile}"
}

# convert JSON file to YAML file using yq
# style all string values as single-quoted
# all keys with dot in key name as double-quoted (default behavior of yq)
function convert-helm-value-params-overrides-json-to-yaml {
  local inFile outFile
  inFile="$1"
  outFile=$(mktemp)
  # shellcheck disable=SC2016
  yq '
    (
      .. |
      select(tag == "!!str")
    ) style="single"
    ' --input-format json --output-format yaml "${inFile}" >"${outFile}"
  echo "${outFile}"
}

# parse YAML files using yq
# merge YAML of input file 2 into '.helmValues' of input file 1,
# letting existing values of input file 1 win
# if '.parameters' exists, remove it
function migrate-helm-value-overrides-parameters-to-helmvalues {
  local inFileOrigValues inFileUpdatedParams outFile
  inFileOrigValues="$1"
  inFileUpdatedParams="$2"
  outFile=$(mktemp)
  # shellcheck disable=SC2016
  yq eval-all '
    select(fileIndex == 0) // {} as $origValues |
    select(fileIndex == 1) // {} as $paramValues |
    $origValues |= { "helmValues": $paramValues } * . |
    del($origValues.parameters) |
    $origValues
  ' --input-format yaml --output-format yaml "${inFileOrigValues}" "${inFileUpdatedParams}" >"${outFile}"
  echo "${outFile}"
}

#####################################################################
#
# Helm value override yaml magic
#
#####################################################################

# some magic to parse flat keys yaml syntax into a nested structure and move to using updated PR chart input
#   - for members of '.parameters' in the input file:
#     - converts keys with dots in their name into nested yaml structure, eg. 'a.b.c'
#     - converts keys with indexed array notation into yaml lists, eg. 'list[0]'
#   - converts legacy PR helm chart input to new format, eg. replace '.parameters' with '.helmValues'

# example - input file contains flat keys
# input:
#   parameters:
#    a.b.c: 1
#    a.b.d: 2
# output:
#   helmValues:
#     a:
#       b:
#         c: 1
#         d: 2

# example - input file contains nested structure (only .parameters change --> .helmValues)
# input:
#   parameters:
#     a:
#       b:
#         c: 1
#         d: 2
# output:
#   helmValues:
#     a:
#       b:
#         c: 1
#         d: 2

# example - input file contains both flat keys and nested structure
# input:
#   parameters:
#     a:
#       b:
#         c: 1
#    a.b.d: 2
# output:
#   helmValues:
#     a:
#       b:
#         c: 1
#         d: 2

# example - input file contains keys with indexed array notation
# input:
#   parameters:
#     a[0]: 1
#     a[1]: 2
# output:
#   helmValues:
#     a:
#       - 1
#       - 2

# example - input file is empty
# output:
#   helmValues: {}
function format-helm-value-overrides {
  local inFile inputWithoutCommentsYamlFile flatKeysList flatArraysList
  local paramsAsJsonFile nestedParamsJsonFile fixedParamsJsonFile
  local fixedParamsYamlFile migratedYamlFile deleteFiles deleteFile
  inFile=$1

  # strip comments from YAML file and handle empty input
  inputWithoutCommentsYamlFile=$(strip-comments-from-helm-value-overrides-yaml "${inFile}")

  # list of flat keys with dot in key name found under '.parameters' in YAML file
  flatKeysList=$(get-list-of-flat-keys-with-dot "${inputWithoutCommentsYamlFile}")

  # list of flat keys with idexed array notation in key name found under '.parameters' in YAML file
  flatArraysList=$(get-list-of-flat-keys-with-array "${inputWithoutCommentsYamlFile}")

  # convert contents of '.parameters' in YAML file to JSON file
  paramsAsJsonFile=$(convert-helm-value-params-overrides-yaml-to-json "${inputWithoutCommentsYamlFile}")

  # modify JSON file: restructure from flattened keys to nested yaml for entries with dot in key name
  nestedParamsJsonFile=$(convert-from-flat-keys-with-dot-to-nested "${paramsAsJsonFile}" "${flatKeysList}")

  # modify JSON file: restructure from flattened arrays with index notation to yaml lists
  fixedParamsJsonFile=$(convert-from-flat-keys-with-array-to-nested "${nestedParamsJsonFile}" "${flatArraysList}")

  # convert JSON file back to YAML file
  fixedParamsYamlFile=$(convert-helm-value-params-overrides-json-to-yaml "${fixedParamsJsonFile}")

  # merge modified YAML file into original YAML file
  # convert legacy PR helm chart format to new format:
  #   1. remove '.parameters' if it exists
  #   2. merge data from '.parameters' into '.helmValues'
  migratedYamlFile=$(migrate-helm-value-overrides-parameters-to-helmvalues "${inputWithoutCommentsYamlFile}" "${fixedParamsYamlFile}")

  # return
  cat "${migratedYamlFile}"

  # cleanup temp files
  deleteFiles=("${inputWithoutCommentsYamlFile}" "${paramsAsJsonFile}" "${nestedParamsJsonFile}" "${fixedParamsJsonFile}" "${fixedParamsYamlFile}" "${migratedYamlFile}")
  for deleteFile in "${deleteFiles[@]}"; do
    rm --force "${deleteFile}" >/dev/null 2>&1 || :
  done
}

log-info "'$(basename ${BASH_SOURCE[0]})' loaded."
