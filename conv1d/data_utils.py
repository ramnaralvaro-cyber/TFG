#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""data_utils.py — Carga, one-hot encoding y preparación de datasets."""

import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from tensorflow import keras


def load_fasta_file(filepath):
    sequences, ids = [], []
    with open(filepath, 'r') as f:
        current_id, current_seq = None, []
        for line in f:
            line = line.strip()
            if line.startswith('>'):
                if current_id is not None:
                    ids.append(current_id)
                    sequences.append(''.join(current_seq))
                current_id = line[1:]
                current_seq = []
            else:
                current_seq.append(line)
        if current_id is not None:
            ids.append(current_id)
            sequences.append(''.join(current_seq))
    return pd.DataFrame({'id': ids, 'seq': sequences})


def load_sequences_from_file(filepath, format_type='auto'):
    if format_type == 'auto':
        ext = filepath.split('.')[-1].lower()
        if ext == 'parquet':              format_type = 'parquet'
        elif ext in ('csv', 'tsv', 'txt'): format_type = 'csv'
        elif ext in ('fasta', 'fa', 'fna'): format_type = 'fasta'
        else: raise ValueError(f'No se pudo determinar formato de {filepath}')

    if format_type == 'parquet':
        data = pd.read_parquet(filepath)
        print(f'OK Cargadas {len(data)} secuencias desde Parquet')
    elif format_type == 'csv':
        data = pd.read_csv(filepath, sep=',')
        print(f'OK Cargadas {len(data)} secuencias desde CSV')
    elif format_type == 'fasta':
        data = load_fasta_file(filepath)
        print(f'OK Cargadas {len(data)} secuencias desde FASTA')
    else:
        raise ValueError(f'Formato no soportado: {format_type}')
    return data


def one_hot_encode_sequence(sequence):
    mapping = {'A': 0, 'C': 1, 'G': 2, 'T': 3}
    encoded = np.zeros((len(sequence), 4), dtype=np.float32)
    for i, nuc in enumerate(sequence.upper()):
        if nuc in mapping:
            encoded[i, mapping[nuc]] = 1.0
    return encoded


def decode_one_hot_sequence(encoded_array):
    mapping = {0: 'A', 1: 'C', 2: 'G', 3: 'T'}
    chars = []
    for i in range(len(encoded_array)):
        idxs = np.where(encoded_array[i] == 1)[0]
        chars.append(mapping[int(idxs[0])] if len(idxs) else 'N')
    return ''.join(chars)


def _split_df(df, trainp, testp, validp):
    train, temp = train_test_split(df, test_size=1 - trainp, random_state=42)
    test, valid = train_test_split(temp, test_size=validp / (testp + validp), random_state=42)
    return train, test, valid


def prepare_dataset(data, positive_labels, negative_labels,
                    sequence_column='seq', label_column='source',
                    train_split=0.8, test_split=0.1, valid_split=0.1):
    data_filtered = data.loc[
        data[label_column].isin(positive_labels + negative_labels)].copy()

    label_map = {label: 0 for label in positive_labels}
    label_map.update({label: 1 for label in negative_labels})
    data_filtered['label_binary'] = data_filtered[label_column].map(label_map)

    print('Aplicando one-hot encoding a secuencias...')
    data_filtered['seq_encoded'] = data_filtered[sequence_column].apply(one_hot_encode_sequence)
    data_filtered['seq_original'] = data_filtered[sequence_column]

    pos = data_filtered[data_filtered[label_column].isin(positive_labels)]
    neg = data_filtered[data_filtered[label_column].isin(negative_labels)]
    n   = min(len(pos), len(neg))
    pos = pos.sample(n=n, random_state=42)
    neg = neg.sample(n=n, random_state=42)
    print(f'Dataset balanceado: {n} positivas, {n} negativas')

    pos_tr, pos_te, pos_va = _split_df(pos, train_split, test_split, valid_split)
    neg_tr, neg_te, neg_va = _split_df(neg, train_split, test_split, valid_split)

    train_data = pd.concat([pos_tr, neg_tr]).sample(frac=1, random_state=42)
    test_data  = pd.concat([pos_te, neg_te]).sample(frac=1, random_state=42)
    valid_data = pd.concat([pos_va, neg_va]).sample(frac=1, random_state=42)
    print(f'Train: {len(train_data)} | Test: {len(test_data)} | Valid: {len(valid_data)}')
    return train_data, test_data, valid_data


def prepare_tensors(dataset, num_classes=2):
    X = np.array(dataset['seq_encoded'].tolist())
    y = keras.utils.to_categorical(
        np.array(dataset['label_binary'].values.flatten()), num_classes=num_classes)
    return X, y
