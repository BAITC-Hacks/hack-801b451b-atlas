#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p infra/brev/evidence

docker compose -f compose.yaml -f infra/brev/compose.gpu.yaml run --rm --no-deps gpu-probe \
  -fsS --max-time 2 http://gpu-specialist:8000/v1/models \
  -o /probe/models.json
python3 - <<'PY'
import json
with open('infra/brev/evidence/models.json', encoding='utf-8') as f:
    models = json.load(f)
if 'atlas-specialist' not in [model.get('id') for model in models.get('data', [])]:
    raise SystemExit('Configured GPU model is not ready')
PY

cp infra/brev/smoke-request.json infra/brev/evidence/smoke-request.json
date -u +%Y-%m-%dT%H:%M:%S.%3NZ > infra/brev/evidence/smoke-start.txt
docker compose -f compose.yaml -f infra/brev/compose.gpu.yaml run --rm --no-deps gpu-probe \
  -fsS --max-time 10 -H 'Content-Type: application/json' \
  --data-binary @/probe/smoke-request.json \
  http://gpu-specialist:8000/v1/chat/completions \
  -o /probe/smoke-response.json
date -u +%Y-%m-%dT%H:%M:%S.%3NZ > infra/brev/evidence/smoke-end.txt
python3 - <<'PY'
import json
with open('infra/brev/evidence/smoke-response.json', encoding='utf-8') as f:
    response = json.load(f)
if response.get('model') != 'atlas-specialist' or not response.get('id'):
    raise SystemExit('Wrong or missing model/response ID')
choices = response.get('choices', [])
if len(choices) != 1 or choices[0].get('finish_reason') != 'stop':
    raise SystemExit('Incomplete GPU response')
report = json.loads(choices[0]['message']['content'])
decisions = report.get('decisions')
if not isinstance(decisions, list) or len(decisions) != 1:
    raise SystemExit('Invalid specialist decision count')
decision = decisions[0]
if set(decision) != {'eventId', 'label', 'confidence', 'evidenceCodes'}:
    raise SystemExit('Invalid specialist decision fields')
if decision['eventId'] != 'smoke-recurring-1' or decision['label'] not in ('one_off', 'recurring', 'uncertain'):
    raise SystemExit('Invalid specialist event/label')
if not isinstance(decision['confidence'], (float, int)) or not 0 <= decision['confidence'] <= 1:
    raise SystemExit('Invalid specialist confidence')
if not isinstance(decision['evidenceCodes'], list):
    raise SystemExit('Invalid evidence codes')
print('Raw specialist smoke response validated:', response['id'])
PY
