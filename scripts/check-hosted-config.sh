#!/usr/bin/env bash
# Guards against pushing local-only auth settings to a hosted Supabase project.
# Run before any `supabase config push` (CI runs it on every push to main).
set -euo pipefail
config="supabase/config.toml"
if [[ "${1:-}" == "--hosted" ]]; then
  if grep -qE '^\[auth\.sms\.test_otp\]' "$config"; then
    echo "error: [auth.sms.test_otp] is enabled in $config; remove it before pushing to a hosted project." >&2
    exit 1
  fi
  if grep -qE 'exp://' "$config"; then
    echo "error: exp:// redirect URLs are local-only; remove them before pushing to a hosted project." >&2
    exit 1
  fi
  echo "config is safe to push"
else
  echo "Local config (test OTP numbers allowed). Use --hosted before 'supabase config push'."
fi
