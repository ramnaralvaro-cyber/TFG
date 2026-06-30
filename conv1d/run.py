#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
run.py — Ejecuta el pipeline completo editando las variables de CONFIG.

Uso:
    python run.py
"""

import os

# ════════════════════════════════════════════════════════════
# CONFIG
# ════════════════════════════════════════════════════════════

INPUT_FILE         = "./datasets/dataset_nuc_shu_pos.csv"   # ruta al dataset
FORMAT             = "auto"       # auto | parquet | csv | fasta
SEQ_COLUMN         = "seq"        # columna con la secuencia ADN
LABEL_COLUMN       = "source"     # columna con las etiquetas
POSITIVE_LABELS    = ["nuc"]      # etiquetas → clase 0 (Nucleosome)
NEGATIVE_LABELS    = ["shu"]      # etiquetas → clase 1 (Non-Nucleosome)

OUTPUT_DIR         = "output_model/dataset_nuc_shu_pos"  # directorio de salida

# Arquitectura
FILTERS            = 32
KERNEL_SIZE        = 12
DROPOUT            = 0.3
LEARNING_RATE      = 0.001

# Entrenamiento
EPOCHS             = 50
BATCH_SIZE         = 32
TRAIN_SPLIT        = 0.8
TEST_SPLIT         = 0.1
VALID_SPLIT        = 0.1

# Análisis XAI por época
SAVE_FILTERS_EVERY   = 1     # guardar JSON cada N épocas (1 = todas)
TOP_ACTIVATIONS      = 10    # None = todos los fragmentos; int = top N por filtro
COMPUTE_HEATMAP      = True
COMPUTE_MOTIFS       = True
COMPUTE_GRADCAM      = True
COMPUTE_FILTER_STATS = True

# LIME
COMPUTE_LIME       = False
LIME_SEGMENTS      = 15
LIME_PERTURBATIONS = 500

# Guardar modelo al terminar
SAVE_MODEL         = True   # guarda modelo_final.keras en OUTPUT_DIR

from data_utils import load_sequences_from_file, prepare_dataset
from model      import build_conv1d_model, evaluate_model
from training   import train_model

os.makedirs(OUTPUT_DIR, exist_ok=True)

print("=" * 60)
print("PASO 1: Cargando datos")
print("=" * 60)
data = load_sequences_from_file(INPUT_FILE, FORMAT)

print("=" * 60)
print("PASO 2: Preparando datasets")
print("=" * 60)
train_data, test_data, valid_data = prepare_dataset(
    data,
    positive_labels  = POSITIVE_LABELS,
    negative_labels  = NEGATIVE_LABELS,
    sequence_column  = SEQ_COLUMN,
    label_column     = LABEL_COLUMN,
    train_split      = TRAIN_SPLIT,
    test_split       = TEST_SPLIT,
    valid_split      = VALID_SPLIT,
)

print("=" * 60)
print("PASO 3: Construyendo modelo")
print("=" * 60)
seq_length = len(train_data["seq_encoded"].iloc[0])
model = build_conv1d_model(
    input_shape    = (seq_length, 4),
    num_filters    = FILTERS,
    kernel_size    = KERNEL_SIZE,
    dropout_rate   = DROPOUT,
    learning_rate  = LEARNING_RATE,
)
model.summary()

print("=" * 60)
print("PASO 4: Entrenando")
print("=" * 60)
train_model(
    model, train_data, valid_data, test_data,
    output_dir           = OUTPUT_DIR,
    epochs               = EPOCHS,
    batch_size           = BATCH_SIZE,
    save_filters_every   = SAVE_FILTERS_EVERY,
    top_activations      = TOP_ACTIVATIONS,
    compute_heatmap      = COMPUTE_HEATMAP,
    compute_motifs       = COMPUTE_MOTIFS,
    compute_gradcam      = COMPUTE_GRADCAM,
    compute_filter_stats = COMPUTE_FILTER_STATS,
    compute_lime         = COMPUTE_LIME,
    lime_n_segments      = LIME_SEGMENTS,
    lime_n_perturbations = LIME_PERTURBATIONS,
)

print("=" * 60)
print("PASO 5: Evaluando")
print("=" * 60)
evaluate_model(model, test_data)

if SAVE_MODEL:
    model_path = os.path.join(OUTPUT_DIR, "modelo_final.keras")
    model.save(model_path)
    print(f"Modelo guardado en: {model_path}")

print("\nPipeline completado.")
