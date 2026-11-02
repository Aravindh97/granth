#!/usr/bin/env bash
set -euo pipefail
rm -rf cmd/web/embed && mkdir -p cmd/web/embed
cp -r testdata/corpus testdata/bad cmd/web/embed/
cp testdata/eval/questions.jsonl cmd/web/embed/
