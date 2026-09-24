#!/usr/bin/env bash
set -Eeuo pipefail

mode="${1:-}"
pg_bin="/usr/lib/postgresql/17/bin"
backup_tmp_dir=""

cleanup() {
  if [[ -n "${backup_tmp_dir:-}" && "$backup_tmp_dir" == /tmp/* && -d "$backup_tmp_dir" ]]; then
    rm -rf -- "$backup_tmp_dir"
  fi
}

notify_failure() {
  local exit_code=$?
  trap - ERR
  node scripts/backup/notify-line.js failure || true
  exit "$exit_code"
}

trap cleanup EXIT

case "$mode" in
  backup-only)
    if [[ "${CI_PIPELINE_SOURCE:-}" != "web" ]]; then
      echo "ERROR: backup-only requires a manually created GitLab web pipeline"
      exit 1
    fi
    ;;
  scheduled-rotate)
    if [[ "${CI_PIPELINE_SOURCE:-}" != "schedule" || "${BACKUP_SCHEDULE:-}" != "true" ]]; then
      echo "ERROR: scheduled rotation requires the dedicated GitLab schedule"
      exit 1
    fi
    trap notify_failure ERR
    ;;
  *)
    echo "ERROR: mode must be backup-only or scheduled-rotate"
    exit 1
    ;;
esac

required_variables=(
  BACKUP_DB_PASSWORD
  BACKUP_ENCRYPT_PASSPHRASE
  BACKUP_GDRIVE_CLIENT_ID
  BACKUP_GDRIVE_CLIENT_SECRET
  BACKUP_GDRIVE_REFRESH_TOKEN
  BACKUP_GDRIVE_FOLDER_ID
)

if [[ "$mode" == "scheduled-rotate" ]]; then
  required_variables+=(BACKUP_LINE_CHANNEL_ACCESS_TOKEN BACKUP_LINE_TEACHER_USER_ID)
fi

for variable_name in "${required_variables[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    echo "ERROR: missing required protected GitLab variable: $variable_name"
    exit 1
  fi
done

if [[ "${PGHOST:-}" != "aws-1-ap-southeast-2.pooler.supabase.com" ||
      "${PGPORT:-}" != "5432" ||
      "${PGDATABASE:-}" != "postgres" ||
      "${PGUSER:-}" != "postgres.qzkxlhpcputsvbqmtqfi" ]]; then
  echo "ERROR: Production database target does not match the locked project"
  exit 1
fi

for tool in pg_dump pg_dumpall; do
  if [[ ! -x "$pg_bin/$tool" ]]; then
    echo "ERROR: missing pinned PostgreSQL executable: $pg_bin/$tool"
    exit 1
  fi
  version_output=$("$pg_bin/$tool" --version)
  if [[ "$version_output" != *"(PostgreSQL) 17."* ]]; then
    echo "ERROR: $tool must be PostgreSQL 17.x"
    exit 1
  fi
done

umask 077
backup_tmp_dir=$(mktemp -d)
dump_dir="$backup_tmp_dir/dump"
mkdir -p "$dump_dir"

export PGPASSWORD="$BACKUP_DB_PASSWORD"
"$pg_bin/pg_dumpall" --roles-only -f "$dump_dir/roles.sql"
"$pg_bin/pg_dump" --schema-only -f "$dump_dir/schema.sql"
"$pg_bin/pg_dump" --data-only -f "$dump_dir/data.sql"
unset PGPASSWORD

for dump_file in "$dump_dir/roles.sql" "$dump_dir/schema.sql" "$dump_dir/data.sql"; do
  dump_size=$(stat -c%s "$dump_file")
  if [[ "$dump_size" -lt 100 ]]; then
    echo "ERROR: a database dump component is unexpectedly small"
    exit 1
  fi
done

stamp=$(date -u -d '+7 hours' +'%Y-%m-%d_%H%M')-th
archive_path="$backup_tmp_dir/backup_${stamp}.tar.gz"
encrypted_path="${archive_path}.gpg"
tar -czf "$archive_path" -C "$dump_dir" roles.sql schema.sql data.sql
printf '%s' "$BACKUP_ENCRYPT_PASSPHRASE" |
  gpg --batch --yes --pinentry-mode loopback --passphrase-fd 0 --symmetric --output "$encrypted_path" "$archive_path"
rm -f -- "$archive_path"

export GDRIVE_CLIENT_ID="$BACKUP_GDRIVE_CLIENT_ID"
export GDRIVE_CLIENT_SECRET="$BACKUP_GDRIVE_CLIENT_SECRET"
export GDRIVE_REFRESH_TOKEN="$BACKUP_GDRIVE_REFRESH_TOKEN"
export GDRIVE_FOLDER_ID="$BACKUP_GDRIVE_FOLDER_ID"
export FILE_PATH="$encrypted_path"

if [[ "$mode" == "backup-only" ]]; then
  node scripts/backup/upload-only.js
  exit 0
fi

export RETENTION_DAYS=30
node scripts/backup/upload-and-rotate.js
node scripts/backup/notify-line.js weekly-success
