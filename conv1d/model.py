#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""model.py — Arquitectura Conv1D y evaluación."""

import numpy as np
from tensorflow import keras
from tensorflow.keras import layers
from data_utils import prepare_tensors


def build_conv1d_model(input_shape=(150, 4), num_filters=32, kernel_size=12,
                       dropout_rate=0.3, learning_rate=0.001):
    model = keras.Sequential([
        layers.Input(shape=input_shape),
        layers.Conv1D(filters=num_filters, kernel_size=kernel_size,
                      activation='relu', padding='same', name='conv1d_1'),
        layers.MaxPooling1D(pool_size=2),
        layers.Conv1D(filters=num_filters, kernel_size=kernel_size,
                      activation='relu', padding='same', name='conv1d_2'),
        layers.MaxPooling1D(pool_size=2),
        layers.Flatten(),
        layers.Dense(128, activation='relu', name='dense_128'),
        layers.Dropout(dropout_rate),
        layers.Dense(2, activation='softmax', name='dense_output'),
    ])
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=learning_rate),
        loss='categorical_crossentropy',
        metrics=['accuracy', keras.metrics.AUC(name='auc')],
    )
    return model


def evaluate_model(model, test_data):
    # Convertimos el dataset a tensores (X: inputs, y: etiquetas one-hot)
    X_test, y_test = prepare_tensors(test_data)

    # Predicciones del modelo (probabilidades por clase)
    proba = model.predict(X_test)

    # Clase predicha = índice con mayor probabilidad
    pred = np.argmax(proba, axis=1)

    # Clase real (convertimos de one-hot a etiqueta)
    true = np.argmax(y_test, axis=1)

    # -----------------------------
    # ACCURACY
    # -----------------------------
    # Accuracy = (predicciones correctas) / (total)
    correct = (pred == true).sum()
    total = len(true)
    accuracy = correct / total

    # -----------------------------
    # MATRIZ DE CONFUSIÓN (binaria)
    # -----------------------------
    # Definimos:
    # tp (True Positives): pred=0 y true=0  → nucleosoma bien clasificado
    # tn (True Negatives): pred=1 y true=1  → no-nucleosoma bien clasificado
    # fp (False Positives): pred=0 pero true=1 → falso nucleosoma
    # fn (False Negatives): pred=1 pero true=0 → nucleosoma perdido

    tp = ((pred == 0) & (true == 0)).sum()
    tn = ((pred == 1) & (true == 1)).sum()
    fp = ((pred == 0) & (true == 1)).sum()
    fn = ((pred == 1) & (true == 0)).sum()

    # -----------------------------
    # MÉTRICAS PARA NUCLEOSOMAS (clase 0)
    # -----------------------------
    # Precision = TP / (TP + FP)
    # → de los que predigo como nucleosoma, cuántos lo son realmente
    precision_nuc = tp / (tp + fp) if (tp + fp) > 0 else 0.0

    # Recall = TP / (TP + FN)
    # → de los nucleosomas reales, cuántos detecto
    recall_nuc = tp / (tp + fn) if (tp + fn) > 0 else 0.0

    # -----------------------------
    # MÉTRICAS PARA NO-NUCLEOSOMAS (clase 1)
    # -----------------------------
    # Precision = TN / (TN + FN)
    # → de los que predigo como no-nucleosoma, cuántos lo son realmente
    precision_non = tn / (tn + fn) if (tn + fn) > 0 else 0.0

    # Recall = TN / (TN + FP)
    # → de los no-nucleosomas reales, cuántos detecto
    recall_non = tn / (tn + fp) if (tn + fp) > 0 else 0.0

    # -----------------------------
    # PRINT RESULTADOS
    # -----------------------------
    print("=" * 60)
    print("RESULTADOS DE EVALUACIÓN")
    print("=" * 60)
    print(f"Accuracy       : {accuracy:.4f}  ({correct}/{total})")
    print(f"Nucleosomas    : Precision={precision_nuc:.4f}  Recall={recall_nuc:.4f}")
    print(f"No-Nucleosomas : Precision={precision_non:.4f}  Recall={recall_non:.4f}")
    print("=" * 60)

    # Devolvemos métricas en diccionario
    return {
        'accuracy': accuracy,
        'precision_nucleosome': precision_nuc,
        'recall_nucleosome': recall_nuc,
        'precision_non_nucleosome': precision_non,
        'recall_non_nucleosome': recall_non,
    }
