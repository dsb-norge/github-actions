#!/bin/env bash

#####################################################################
#
# sub functions
#
#####################################################################

# convert a YAML file into a JSON file using the yq
function convert-helm-value-overrides-yaml-to-json {
  local inFile outFile
  inFile="$1"
  outFile=$(mktemp)
  # default to empty map if input is empty
  # make sure any comments are stripped out
  yq '
    . // {} |
    ... comments=""
    ' --input-format yaml --output-format json "${inFile}" >"${outFile}"
  echo "${outFile}"
}

# return a random placeholder string
function get-placeholder {
  local placeholder
  placeholder="c78b8714e8d25869"
  echo "${placeholder}"
}

# replace any occurence of '.\' in key names with a palceholder string
function add-placeholder-for-slah-dot {
  local inFile outFile placeholder
  inFile="$1"
  outFile=$(mktemp)
  placeholder=$(get-placeholder)
  jq -r --arg replaceWith "$placeholder" '
    walk(
      if type == "object"
      then with_entries(
        .key |=
        gsub("\\\\\\."; $replaceWith)
      )
      else .
      end
    )' "${inFile}" >"${outFile}"
  echo "${outFile}"
}

# replace the placeholder string with '.\' in key names
function remove-placeholder-for-slah-dot {
  local inFile outFile placeholder
  inFile="$1"
  outFile=$(mktemp)
  placeholder=$(get-placeholder)
  jq -r --arg replaceWith "$placeholder" '
    walk(
      if type == "object"
      then with_entries(
        .key |=
        gsub($replaceWith; "\\.")
      )
      else .
      end
    )' "${inFile}" >"${outFile}"
  echo "${outFile}"
}

# return a json list of all keys with dot in key name
function get-list-of-flat-keys-with-dot {
  local inFile outData
  inFile="$1"
  outData=$(jq -r '
    [
      paths[] |
      select(type == "string") |
      select(test("\\."))
    ]' "${inFile}")
  echo "${outData}"
}

# return a json list of all keys with indexed array notation in key name
# eg. 'list[0]' in this example:
#   my:
#     list[0]: a
#     list[1]: b
function get-list-of-flat-keys-with-array {
  local inFile outData
  inFile="$1"
  outData=$(jq -r '
    [
      paths[] |
      select(type == "string") |
      select(test(".+\\[[0-9]+\\]"))
    ]' "${inFile}")
  echo "${outData}"
}

# flattened keys with dot in key name to nested yaml structure
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
          .key |
          split(".")
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

# flattened arrays with index notation to yaml lists
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

#  Convert JSON to YAML using yq, style all string values as single-quoted
function convert-helm-value-overrides-json-to-yaml {
  local inFile outFile
  inFile="$1"
  outFile=$(mktemp)
  yq '
    (
      .. |
      select(tag == "!!str")
    ) style="single"' --input-format json --output-format yaml "${inFile}" >"${outFile}"
  echo "${outFile}"
}

# migrate legacy PR helm chart input to new format
#  1. remove '.parameters' if it exists
#  2. merge data from '.parameters' into '.helmValues'
function migrate-helm-value-overrides-parameters-to-helmvalues {
  local inFile outFile
  inFile="$1"
  outFile=$(mktemp)
  # shellcheck disable=SC2016
  yq '
    (
      .parameters // {}
    ) as $params |
    . += {"helmValues": .parameters} * . |
    del(.parameters)
  ' --input-format yaml --output-format yaml "${inFile}" >"${outFile}"
  echo "${outFile}"
}

#####################################################################
#
# Helm value override yaml magic
#
#####################################################################

# some magic to parse flat keys yaml syntax into a nested structure and move to using updated PR chart input
#   - converts keys with dots in their name into nested yaml structure, eg. 'a.b.c'
#   - converts keys with indexed array notation into yaml lists, eg. 'list[0]'
#   - converts legacy PR helm chart input to new format, eg. replace '.parameters' with '.helmValues'
#   - handles when yaml syntax is already in nested structure
#   - handles if the input file contains both flat keys and nested structure
#   - does not modify keys with escaped dots in their name, eg. 'orgs\.k8s\.snyk\.io/v1'

# example - input file contains flat keys and keys with '\.' in their name
# input:
#   parameters:
#    a.b.c: 1
#    a.b.d: 2
#    a.deploymentAnnotations.orgs\.k8s\.snyk\.io/v1: '-'
# output:
#   helmValues:
#     a:
#       b:
#         c: 1
#         d: 2
#       deploymentAnnotations:
#         orgs\.k8s\.snyk\.io/v1: '-'

# example - input file contains nested structure (no change)
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
#   {}
function format-helm-value-overrides {
  local inFile inputAsJsonFile jsonWithPlaceholderFile flatKeysList flatArraysList nestedDotJsonFile
  local nestedArraysJsonFile fixedJsonFile fixedYamlFile migratedYamlFile
  inFile=$1

  # convert to JSON
  inputAsJsonFile=$(convert-helm-value-overrides-yaml-to-json "${inFile}")

  # avoid modifying key names with escaped dots in them by replacing '.\' with a placeholder
  jsonWithPlaceholderFile=$(add-placeholder-for-slah-dot "${inputAsJsonFile}")

  # list of flat keys with dot in key name
  flatKeysList=$(get-list-of-flat-keys-with-dot "${jsonWithPlaceholderFile}")

  # list of flat keys with idexed array notation in key name
  flatArraysList=$(get-list-of-flat-keys-with-array "${jsonWithPlaceholderFile}")

  # restructure from flattened keys to nested yaml for entries with dot in key name
  nestedDotJsonFile=$(convert-from-flat-keys-with-dot-to-nested "${jsonWithPlaceholderFile}" "${flatKeysList}")

  # restructure from flattened arrays with index notation to yaml lists
  nestedArraysJsonFile=$(convert-from-flat-keys-with-array-to-nested "${nestedDotJsonFile}" "${flatArraysList}")

  # remove placeholder for '.\' in key names
  fixedJsonFile=$(remove-placeholder-for-slah-dot "${nestedArraysJsonFile}")

  # convert back to YAML
  fixedYamlFile=$(convert-helm-value-overrides-json-to-yaml "${fixedJsonFile}")

  # convert legacy PR helm chart format to new format:
  #   1. remove '.parameters' if it exists
  #   2. merge data from '.parameters' into '.helmValues'
  migratedYamlFile=$(migrate-helm-value-overrides-parameters-to-helmvalues "${fixedYamlFile}")

  # return
  cat "${migratedYamlFile}"

  # cleanup temp files
  deleteFiles=("${inputAsJsonFile}" "${jsonWithPlaceholderFile}" "${nestedDotJsonFile}" "${nestedArraysJsonFile}" "${fixedJsonFile}" "${fixedYamlFile}" "${migratedYamlFile}")
  for deleteFile in "${deleteFiles[@]}"; do
    rm -f "${deleteFile}" >/dev/null 2>&1 || :
  done
}


log-info "'$(basename ${BASH_SOURCE[0]})' loaded."
