#!/usr/bin/env bash
# One-time setup for GPU training under WSL2 (TensorFlow has no native
# Windows GPU support since 2.11). Creates ~/ks-gpu with the same
# TensorFlow/numpy versions as ml/venv, so models saved here load there.
#   wsl -d Ubuntu -- bash /mnt/c/Users/USER/Documents/kamustasign/ml/setup_wsl_gpu.sh
set -euo pipefail
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/lib/wsl/lib"

if ! command -v uv >/dev/null; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi
[ -x "$HOME/ks-gpu/bin/python" ] || uv venv --python 3.12 "$HOME/ks-gpu"
VIRTUAL_ENV="$HOME/ks-gpu" uv pip install "tensorflow[and-cuda]==2.21.0" "numpy==1.26.4"
# TensorFlow finds most pip-installed CUDA libraries itself but not all of
# them (libcusolver.so.11 is missed), and without every one it silently
# falls back to CPU. This wrapper puts all of them on the loader path.
cat > "$HOME/ks-gpu/bin/gpu-python" <<'EOF'
#!/usr/bin/env bash
NV="$HOME/ks-gpu/lib/python3.12/site-packages/nvidia"
LD_LIBRARY_PATH="$(printf '%s:' "$NV"/*/lib)/usr/lib/wsl/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" \
  exec "$HOME/ks-gpu/bin/python" "$@"
EOF
chmod +x "$HOME/ks-gpu/bin/gpu-python"
"$HOME/ks-gpu/bin/gpu-python" -c 'import tensorflow as tf; print("TF", tf.__version__, "GPUs:", tf.config.list_physical_devices("GPU"))'
