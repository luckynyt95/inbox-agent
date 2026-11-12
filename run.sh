#!/bin/bash
# Inbox Agent — one-command start.
# First time: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
# Then: ./run.sh   (or: .venv/bin/uvicorn app:app --host 0.0.0.0 --port 8000)
set -e
cd "$(dirname "$0")"
if [ ! -x .venv/bin/uvicorn ]; then
  echo "Setting up virtual environment (first run)..."
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
fi
echo "Inbox Agent running at http://localhost:8000"
.venv/bin/uvicorn app:app --host 0.0.0.0 --port 8000
