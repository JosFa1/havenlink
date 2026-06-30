set -euo pipefail
# Prevent Git Bash from rewriting AWS resource paths such as /havenlink/prod/*.
if [ -n "${MSYSTEM:-}" ]; then
  export MSYS2_ARG_CONV_EXCL='/havenlink/'
fi
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.local"
GENERATED_FILE="$ROOT_DIR/.env.generated"
find_python() {
  local candidate
  for candidate in python3 python; do
    if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c "import sys" >/dev/null 2>&1; then
      printf '%s' "$candidate"
      return
    fi
  done
  echo "Python 3 is required." >&2
  exit 1
}
PYTHON_BIN="${PYTHON_BIN:-$(find_python)}"
require_file() {
  if [ ! -f "$1" ]; then
    echo "Missing $1"
    exit 1
  fi
}
load_env() {
  require_file "$ENV_FILE"
  set -a
  source "$ENV_FILE"
  if [ -f "$GENERATED_FILE" ]; then
    source "$GENERATED_FILE"
  fi
  set +a
}
need() {
  local name="$1"
  local value="${!name:-}"
  if [ -z "$value" ]; then
    echo "Missing required value: $name"
    exit 1
  fi
}
upsert_generated() {
  local key="$1"
  local value="$2"
  mkdir -p "$(dirname "$GENERATED_FILE")"
  touch "$GENERATED_FILE"
  chmod 600 "$GENERATED_FILE"
  if grep -q "^${key}=" "$GENERATED_FILE"; then
    "$PYTHON_BIN" - "$GENERATED_FILE" "$key" "$value" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
key = sys.argv[2]
value = sys.argv[3]
lines = path.read_text().splitlines()
out = []
for line in lines:
    if line.startswith(key + '='):
        out.append(f'{key}={value}')
    else:
        out.append(line)
path.write_text('\n'.join(out) + '\n')
PY
  else
    printf '%s=%s\n' "$key" "$value" >> "$GENERATED_FILE"
  fi
}
aws_account_id() {
  aws sts get-caller-identity --query Account --output text --region "${AWS_REGION:-us-east-1}"
}
secret_arn() {
  aws secretsmanager describe-secret --secret-id "$1" --query ARN --output text --region "$AWS_REGION"
}
aws_file_uri() {
  local path="$1"
  if command -v cygpath >/dev/null 2>&1; then
    path="$(cygpath -w "$path")"
  fi
  printf 'file://%s' "$path"
}
