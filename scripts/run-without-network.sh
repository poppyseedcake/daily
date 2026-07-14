#!/usr/bin/env bash

set -euo pipefail

if (( $# == 0 )); then
  echo 'usage: run-without-network.sh <command> [argument ...]' >&2
  exit 64
fi

command_user="$(id --user --name)"

exec sudo --non-interactive --preserve-env unshare --net -- bash -c '
  set -euo pipefail
  ip link set lo up
  exec runuser --user "$1" --preserve-environment -- "${@:2}"
' bash "$command_user" "$@"
