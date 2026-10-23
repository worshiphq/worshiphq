#!/bin/sh
# Push to GitHub with a personal access token from the environment, so no login window and no saved
# Git login is involved. This is what lets several projects, on several GitHub accounts, each push with
# their own token. The token is used for this one command only and is never written anywhere.
#
# Set these two for THIS project (for example under "env" in .claude/settings.local.json, which git ignores):
#   GH_PUSH_USER   the GitHub account that owns the token (for example worshiphq)
#   GH_PUSH_TOKEN  a personal access token with write access to this repository
#
# Usage:  sh scripts/push.sh            (push the current branch)
#         sh scripts/push.sh origin main

if [ -z "$GH_PUSH_TOKEN" ]; then
  echo "GH_PUSH_TOKEN is not set for this project. Add it under \"env\" in .claude/settings.local.json." >&2
  exit 2
fi

AUTH=$(printf '%s:%s' "${GH_PUSH_USER:-x-access-token}" "$GH_PUSH_TOKEN" | base64 | tr -d '\n')
out=$(GIT_TERMINAL_PROMPT=0 git -c credential.helper= -c "http.extraheader=Authorization: Basic $AUTH" push "$@" 2>&1)
code=$?
# Never print a token, even if git echoes one back.
printf '%s\n' "$out" | sed -E 's/(ghp_|gho_|ghu_|ghs_|ghr_|github_pat_)[A-Za-z0-9_]+/\1****/g'
exit $code
