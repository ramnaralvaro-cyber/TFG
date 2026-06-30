#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""manifest.py — Gestión de manifest.json y datasets.json."""

import os
import json


def _read_manifest(path):
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _write_manifest(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def update_manifest(output_dir, datasetname, epoch_num,
                    model_info=None, has_lime=False):
    manifest_path = os.path.join(output_dir, 'manifest.json')
    manifest = _read_manifest(manifest_path)

    if 'by_split' not in manifest or not isinstance(manifest['by_split'], dict):
        manifest['by_split'] = {}
    split_epochs = manifest['by_split'].setdefault(datasetname, [])
    if epoch_num not in split_epochs:
        split_epochs.append(epoch_num)
        split_epochs.sort()

    manifest['epochs'] = manifest['by_split'].get('test', [])

    if has_lime and datasetname == 'test':
        lime_epochs = manifest.setdefault('lime_epochs', [])
        if epoch_num not in lime_epochs:
            lime_epochs.append(epoch_num)
            lime_epochs.sort()

    if model_info and 'model' not in manifest:
        manifest['model'] = model_info

    _write_manifest(manifest_path, manifest)
    lime_info = f' | lime_epochs: {manifest.get("lime_epochs", [])}' if has_lime else ''
    print(f'  manifest.json actualizado — épocas {datasetname}: '
          f'{manifest["by_split"][datasetname]}{lime_info}')


def update_datasets_manifest(output_dir, dataset_label):
    parent_dir    = os.path.dirname(os.path.abspath(output_dir.rstrip('/\\')))
    manifest_path = os.path.join(parent_dir, 'datasets.json')
    manifest      = _read_manifest(manifest_path)
    datasets      = manifest.get('datasets', [])

    if isinstance(datasets, dict):
        if dataset_label not in datasets:
            datasets[dataset_label] = {'label': dataset_label}
    else:
        if not isinstance(datasets, list):
            datasets = []
        if dataset_label not in datasets:
            datasets.append(dataset_label)
            datasets.sort()

    manifest['datasets'] = datasets
    _write_manifest(manifest_path, manifest)
    print(f'OK datasets.json actualizado → {manifest_path}')
