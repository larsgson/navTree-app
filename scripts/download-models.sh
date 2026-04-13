#!/bin/bash
# Download bundled ML models for offline RAG search.
# Run before build if public/models/ is missing.

set -e

BASE="public/models"
HF="https://huggingface.co"

# --- Standard mode: all-MiniLM-L6-v2 (ONNX, 23 MB) ---
MINILM_DIR="$BASE/Xenova/all-MiniLM-L6-v2"
if [ -f "$MINILM_DIR/onnx/model_quantized.onnx" ]; then
  echo "all-MiniLM-L6-v2: already present"
else
  echo "Downloading all-MiniLM-L6-v2..."
  mkdir -p "$MINILM_DIR/onnx"
  curl -sL -o "$MINILM_DIR/config.json"           "$HF/Xenova/all-MiniLM-L6-v2/resolve/main/config.json"
  curl -sL -o "$MINILM_DIR/tokenizer.json"         "$HF/Xenova/all-MiniLM-L6-v2/resolve/main/tokenizer.json"
  curl -sL -o "$MINILM_DIR/tokenizer_config.json"  "$HF/Xenova/all-MiniLM-L6-v2/resolve/main/tokenizer_config.json"
  curl -sL -o "$MINILM_DIR/onnx/model_quantized.onnx" "$HF/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model_quantized.onnx"
  echo "all-MiniLM-L6-v2: done"
fi

# --- Mini mode: potion-base-8M (Model2Vec, 30 MB) ---
POTION_DIR="$BASE/minishlab/potion-base-8M"
if [ -f "$POTION_DIR/model.safetensors" ]; then
  echo "potion-base-8M: already present"
else
  echo "Downloading potion-base-8M..."
  mkdir -p "$POTION_DIR"
  curl -sL -o "$POTION_DIR/config.json"            "$HF/minishlab/potion-base-8M/resolve/main/config.json"
  curl -sL -o "$POTION_DIR/tokenizer.json"          "$HF/minishlab/potion-base-8M/resolve/main/tokenizer.json"
  curl -sL -o "$POTION_DIR/tokenizer_config.json"   "$HF/minishlab/potion-base-8M/resolve/main/tokenizer_config.json"
  curl -sL -o "$POTION_DIR/model.safetensors"       "$HF/minishlab/potion-base-8M/resolve/main/model.safetensors"
  echo "potion-base-8M: done"
fi

echo "All models ready."
