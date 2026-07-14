#!/usr/bin/env bash

set -euo pipefail

if (( $# == 0 )); then
  echo 'usage: run-without-network.sh <command> [argument ...]' >&2
  exit 64
fi

command_user="$(id --user --name)"
command_home="${HOME:?}"
command_path="${PATH:?}"

exec sudo --non-interactive --preserve-env unshare --net -- bash -c '
  set -euo pipefail
  ip link set lo up
  export HOME="$2"
  export PATH="$3"
  exec runuser --user "$1" --preserve-environment -- "${@:4}"
' bash "$command_user" "$command_home" "$command_path" "$@"
