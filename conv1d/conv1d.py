#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""conv1d.py — Entry point. Solo main() + argparse."""

import os
import argparse

from data_utils import load_sequences_from_file, prepare_dataset
from model import build_conv1d_model, evaluate_model
from training import train_model


def main():
    parser = argparse.ArgumentParser(description='Conv1D Nucleosome Classifier')
    parser.add_argument('--input',              type=str, required=True)
    parser.add_argument('--format',             type=str, default='auto',
                        choices=['auto','parquet','csv','fasta'])
    parser.add_argument('--seq-column',         type=str, default='seq')
    parser.add_argument('--label-column',       type=str, default='source')
    parser.add_argument('--positive-labels',    type=str, nargs='+', default=['n1'])
    parser.add_argument('--negative-labels',    type=str, nargs='+', default=['ran'])
    parser.add_argument('--filters',            type=int, default=32)
    parser.add_argument('--kernel-size',        type=int, default=12)
    parser.add_argument('--dropout',            type=float, default=0.3)
    parser.add_argument('--learning-rate',      type=float, default=0.001)
    parser.add_argument('--epochs',             type=int, default=20)
    parser.add_argument('--batch-size',         type=int, default=32)
    parser.add_argument('--train-split',        type=float, default=0.8)
    parser.add_argument('--test-split',         type=float, default=0.1)
    parser.add_argument('--valid-split',        type=float, default=0.1)
    parser.add_argument('--output-dir',         type=str, required=True,
                        help='Ej: output_model/spaced')
    parser.add_argument('--save-filters-every', type=int, default=1)
    parser.add_argument('--top-activations',    type=int, default=None)
    parser.add_argument('--compute-lime',       action='store_true', default=False)
    parser.add_argument('--lime-segments',      type=int, default=15)
    parser.add_argument('--lime-perturbations', type=int, default=500)
    args = parser.parse_args()

    abs_out = os.path.abspath(args.output_dir)
    if abs_out == os.path.dirname(abs_out):
        print('ERROR: --output-dir no puede ser la raíz del sistema.'); exit(1)
    os.makedirs(args.output_dir, exist_ok=True)

    print('=' * 60); print('PASO 1: Cargando datos')
    data = load_sequences_from_file(args.input, args.format)

    print('=' * 60); print('PASO 2: Preparando datasets')
    train_data, test_data, valid_data = prepare_dataset(
        data,
        positive_labels=args.positive_labels, negative_labels=args.negative_labels,
        sequence_column=args.seq_column,       label_column=args.label_column,
        train_split=args.train_split,          test_split=args.test_split,
        valid_split=args.valid_split,
    )

    print('=' * 60); print('PASO 3: Construyendo modelo')
    seq_length = len(train_data['seq_encoded'].iloc[0])
    model = build_conv1d_model(
        input_shape=(seq_length, 4), num_filters=args.filters,
        kernel_size=args.kernel_size, dropout_rate=args.dropout,
        learning_rate=args.learning_rate,
    )
    model.summary()

    print('=' * 60); print('PASO 4: Entrenando')
    train_model(
        model, train_data, valid_data, test_data,
        output_dir=args.output_dir,         epochs=args.epochs,
        batch_size=args.batch_size,         save_filters_every=args.save_filters_every,
        top_activations=args.top_activations, compute_lime=args.compute_lime,
        lime_n_segments=args.lime_segments, lime_n_perturbations=args.lime_perturbations,
    )

    print('=' * 60); print('PASO 5: Evaluando')
    evaluate_model(model, test_data)
    print('Pipeline completado.')


if __name__ == '__main__':
    main()
