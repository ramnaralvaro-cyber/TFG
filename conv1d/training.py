#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""training.py — train_model y clean_json_output."""

import os
from tensorflow import keras

from data_utils import prepare_tensors
from manifest import update_datasets_manifest
from analysis_callback import DetailedFilterAnalysisCallback


def clean_json_output(output_dir):
    """Elimina JSONs de análisis previos. Conserva manifest y sequences_metadata."""
    if not os.path.isdir(output_dir):
        return
    KEEP = ('manifest.json', 'sequences_metadata_', 'datasets.json')
    removed = 0
    for fname in os.listdir(output_dir):
        if fname.endswith('.json') and not any(fname.startswith(p) for p in KEEP):
            os.remove(os.path.join(output_dir, fname))
            removed += 1
    if removed:
        print(f'Limpieza: {removed} JSON eliminados de {output_dir}')


def train_model(model, train_data, valid_data, test_data, output_dir,
                epochs=20, batch_size=32, save_filters_every=1,
                top_activations=None,
                compute_heatmap=True, compute_motifs=True,
                compute_gradcam=True, compute_filter_stats=True,
                compute_lime=False,
                lime_n_segments=15, lime_n_perturbations=500):

    X_train, y_train = prepare_tensors(train_data)
    X_valid, y_valid = prepare_tensors(valid_data)
    clean_json_output(output_dir)

    print(f'Entrenamiento — X_train: {X_train.shape}  y_train: {y_train.shape}')

    cb_test = DetailedFilterAnalysisCallback(
        output_dir=output_dir, dataset=test_data, datasetname='test',
        save_every=save_filters_every, top_activations=top_activations,
        compute_heatmap=compute_heatmap,
        compute_motifs=compute_motifs,
        compute_gradcam=compute_gradcam,
        compute_filter_stats=compute_filter_stats,
        compute_lime=compute_lime,
        lime_n_segments=lime_n_segments,
        lime_n_perturbations=lime_n_perturbations,
    )
    # cb_valid y cb_train descomentados si se quiere análisis en esos splits
    # cb_valid = DetailedFilterAnalysisCallback(
    #     output_dir=output_dir, dataset=valid_data, datasetname='valid',
    #     save_every=save_filters_every, top_activations=top_activations)
    # cb_train = DetailedFilterAnalysisCallback(
    #     output_dir=output_dir, dataset=train_data, datasetname='train',
    #     save_every=save_filters_every, top_activations=top_activations)

    callbacks = [
        cb_test,
        keras.callbacks.EarlyStopping(
            monitor='val_loss', patience=5, restore_best_weights=True),
        keras.callbacks.ReduceLROnPlateau(
            monitor='val_loss', factor=0.5, patience=3, min_lr=1e-6),
    ]

    history = model.fit(
        X_train, y_train,
        validation_data=(X_valid, y_valid),
        epochs=epochs, batch_size=batch_size,
        callbacks=callbacks, verbose=1,
    )

    dataset_label = os.path.basename(output_dir.rstrip('/\\'))
    update_datasets_manifest(output_dir, dataset_label)
    return history
