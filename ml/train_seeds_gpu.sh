#!/usr/bin/env bash
# Trains the combined ASL word ensemble on the GPU under WSL, one seed at a
# time (two at once ran a 16 GB machine out of memory). Each seed
# checkpoints every epoch; rerun with --resume to continue a stopped one.
#   wsl -d Ubuntu -- bash /mnt/c/Users/USER/Documents/kamustasign/ml/train_seeds_gpu.sh 1 2 3
#   wsl -d Ubuntu -- bash /mnt/c/Users/USER/Documents/kamustasign/ml/train_seeds_gpu.sh 2 --resume
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs
seeds=() flags=()
for a in "$@"; do [[ $a == --* ]] && flags+=("$a") || seeds+=("$a"); done
for s in "${seeds[@]}"; do
  echo "seed $s: started $(date +%T)"
  ~/ks-gpu/bin/gpu-python -u scripts/train_word_classifier.py --combined "$s" "${flags[@]}" > "logs/asl_combined_seed$s.log" 2>&1
  echo "seed $s: done $(date +%T) - $(grep -E 'Test top-1' "logs/asl_combined_seed$s.log")"
done
