#!/usr/bin/env bash
# Trains the FSL word ensemble on the GPU under WSL (same environment as
# train_seeds_gpu.sh), one run at a time. Plain numbers are the deployable
# seeds; NAME (ivan, paul, ry, or NAME,NAME) is a seed-0 run with that team
# recorder left out of training, to score them as an unseen signer.
#   wsl -d Ubuntu -- bash /mnt/c/Users/USER/Documents/kamustasign/ml/train_fsl_seeds_gpu.sh 0 1 2 3
#   wsl -d Ubuntu -- bash /mnt/c/Users/USER/Documents/kamustasign/ml/train_fsl_seeds_gpu.sh ivan paul ry
# Needs data/fsl_landmarks.npz from consolidate_fsl_landmarks.py (run on Windows).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
for a in "$@"; do
  if [[ $a =~ ^[0-9]+$ ]]; then args=("$a") log="logs/fsl_seed$a.log"
  else args=(0 --holdout "$a") log="logs/fsl_seed0_no${a//,/_}.log"; fi
  echo "fsl ${args[*]}: started $(date +%T)"
  ~/ks-gpu/bin/gpu-python -u scripts/train_fsl_classifier.py "${args[@]}" > "$log" 2>&1
  echo "fsl ${args[*]}: done $(date +%T) - $(grep -E '"(test|holdout)_top1"' "$log" | tr -d ' \n')"
done
