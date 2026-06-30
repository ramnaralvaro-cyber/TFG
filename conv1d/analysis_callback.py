#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
analysis_callback.py — Callback XAI.

Genera UN JSON por época: activations_{split}_epoch_{N}.json
Estructura ORIGINAL compatible con todos los JS del visor:
  layers → conv1d_1, conv1d_2, dense_128, dense_output
           con filters → sequences → fragments / activations
  motifs, filter_importance, gradcam, gradcam_filters, conv1d2_contributions
"""

import os
import json
import numpy as np
import tensorflow as tf
from tensorflow import keras
from scipy.ndimage import zoom
from sklearn.linear_model import Ridge

from data_utils import prepare_tensors
from manifest   import update_manifest


class DetailedFilterAnalysisCallback(keras.callbacks.Callback):

    def __init__(self, output_dir, dataset, datasetname, save_every=1,
                 top_activations=None,
                 compute_heatmap=True, compute_motifs=True,
                 compute_gradcam=True, compute_filter_stats=True,
                 compute_lime=False,
                 lime_n_segments=15, lime_n_perturbations=500):
        super().__init__()
        self.output_dir           = output_dir
        self.dataset              = dataset.reset_index(drop=True)
        self.datasetname          = datasetname
        self.save_every           = save_every
        self.top_activations      = top_activations
        self.compute_heatmap      = compute_heatmap
        self.compute_motifs       = compute_motifs
        self.compute_gradcam      = compute_gradcam
        self.compute_filter_stats = compute_filter_stats
        self.compute_lime         = compute_lime
        self.lime_n_segments      = lime_n_segments
        self.lime_n_perturbations = lime_n_perturbations
        self.conv_models          = {}
        self.grad_models          = {}
        self.metadata_saved       = False

    # Metadatos

    def save_sequences_metadata(self):
        if self.metadata_saved:
            return
        metadata = {
            'num_sequences': len(self.dataset),
            'num_filters':   32,
            'dataset_split': self.datasetname,
            'sequences': [
                {
                    'sequence_idx': int(i),
                    'seq_original': self.dataset.iloc[i]['seq_original'],
                    'label_binary': int(self.dataset.iloc[i]['label_binary']),
                    'label_text':   'Nucleosome' if self.dataset.iloc[i]['label_binary'] == 0
                                    else 'Non-Nucleosome',
                }
                for i in range(len(self.dataset))
            ],
        }
        path = os.path.join(self.output_dir, f'sequences_metadata_{self.datasetname}.json')
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2)
        print(f'Metadatos {self.datasetname.upper()} — {len(self.dataset)} secuencias')
        self.metadata_saved = True

    # Inicialización

    def on_train_begin(self, logs=None):
        inp   = self.model.layers[0]
        c1    = self.model.get_layer('conv1d_1')
        c2    = self.model.get_layer('conv1d_2')
        final = self.model.layers[-1].output

        self.conv_models['conv1d_1'] = keras.Model(inputs=inp.input, outputs=c1.output)
        self.grad_models['conv1d_1'] = keras.Model(inputs=inp.input, outputs=[c1.output, final])

        self.conv_models['conv1d_2'] = keras.Model(inputs=inp.input, outputs=c2.output)
        self.grad_models['conv1d_2'] = keras.Model(inputs=inp.input, outputs=[c2.output, final])

        print('OK Modelos intermedios limpios (conv1d_1 y conv1d_2) creados')
        self.save_sequences_metadata()

    # Estructura jerárquica 

    def _ensure_seq_node(self, data, layer_name, filter_id, seq_idx, label_text):
        if layer_name not in data['layers']:
            data['layers'][layer_name] = {'filters': {}}
        filters = data['layers'][layer_name]['filters']
        fkey    = str(filter_id)
        skey    = str(seq_idx)
        if fkey not in filters:
            filters[fkey] = {'sequences': {}}
        seqs = filters[fkey]['sequences']
        if skey not in seqs:
            node = {'label': label_text}
            if layer_name == 'conv1d_1': node['fragments']   = []
            if layer_name == 'conv1d_2': node['activations'] = []
            seqs[skey] = node
        return seqs[skey]

    def _add_fragment(self, node, pos, length, activation):
        node.setdefault('fragments', []).append({
            'fragment_pos':    int(pos),
            'fragment_length': int(length),
            'activation':      float(activation),
        })

    # Importancia de filtros 

    def _filter_importance(self, activations):
        mean_acts = np.mean(np.abs(activations), axis=(0, 1))
        return {
            str(f): {
                'mean_activation': float(round(float(mean_acts[f]), 6)),
                'is_dead':         bool(mean_acts[f] < 1e-6),
            }
            for f in range(len(mean_acts))
        }

    # Motifs 

    def _compute_motifs(self, activations, seqs_orig, kernel_size, pool_stride=1):
        BASES   = ['A', 'C', 'G', 'T']
        BASE_IDX = {b: i for i, b in enumerate(BASES)}
        n_filters = activations.shape[2]
        result    = {}
        for f in range(n_filters):
            fmap  = activations[:, :, f]
            frags = []
            for si in range(fmap.shape[0]):
                bp  = int(np.argmax(fmap[si]))
                ba  = float(fmap[si, bp])
                if ba <= 0: continue
                ap  = bp * pool_stride
                lp  = (kernel_size - 1) // 2
                seq = seqs_orig[si]
                s   = max(0, ap - lp)
                e   = min(len(seq), s + kernel_size)
                frag = seq[s:e].upper()
                if frag: frags.append(frag)
            if not frags:
                result[str(f)] = None
                continue
            max_len   = max(len(fr) for fr in frags)
            counts    = [[0] * 4 for _ in range(max_len)]
            n_per_pos = [0] * max_len
            for frag in frags:
                for i, nuc in enumerate(frag):
                    if nuc in BASE_IDX:
                        counts[i][BASE_IDX[nuc]] += 1
                        n_per_pos[i] += 1
            positions = []
            for pos in range(max_len):
                n = n_per_pos[pos]
                if n == 0:
                    positions.append({'A': 0.0, 'C': 0.0, 'G': 0.0, 'T': 0.0,
                                      'dominant': 'A', 'n': 0})
                    continue
                pcts     = {b: round(counts[pos][i] / n, 4) for i, b in enumerate(BASES)}
                dominant = max(pcts, key=pcts.get)
                positions.append({**pcts, 'dominant': dominant, 'n': n})
            result[str(f)] = {'positions': positions, 'n_sequences': len(frags), 'max_length': max_len}
        return result

    # Grad-CAM 

    def _gradcam_batch(self, X, class_idx, layer_name):
        gm       = self.grad_models[layer_name]
        X_t      = tf.cast(X, dtype=tf.float32)
        with tf.GradientTape() as tape:
            tape.watch(X_t)
            conv_out, preds = gm(X_t, training=False)
            scores = preds[:, class_idx]
        grads        = tape.gradient(scores, conv_out)
        pooled_grads = tf.reduce_mean(grads, axis=1, keepdims=True)
        weighted     = conv_out * pooled_grads
        gcam         = tf.reduce_sum(weighted, axis=-1)
        gcam         = tf.nn.relu(gcam).numpy()
        seq_len      = X.shape[1]
        if gcam.shape[1] != seq_len:
            scale = seq_len / gcam.shape[1]
            gcam  = np.array([zoom(row, scale, order=1)[:seq_len] for row in gcam])
        max_vals = gcam.max(axis=1, keepdims=True)
        max_vals = np.where(max_vals > 0, max_vals, 1.0)
        gcam     = gcam / max_vals
        alpha    = tf.reduce_mean(tf.abs(pooled_grads), axis=0).numpy().flatten()
        ranking  = [{'filter': int(k), 'alpha': round(float(alpha[k]), 6)}
                    for k in np.argsort(alpha)[::-1]]
        return gcam, ranking

    # Contribuciones conv1d_1 → conv1d_2

    def _contributions(self, acts1, acts2, top_k=5):
        N, L1, F1 = acts1.shape
        N, L2, F2 = acts2.shape
        L_min     = min(L1 // 2, L2)
        c1p  = np.maximum(acts1[:, ::2, :], acts1[:, 1::2, :])[:, :L_min, :]
        c2t  = acts2[:, :L_min, :]
        c1f  = c1p.reshape(-1, F1)
        c2f  = c2t.reshape(-1, F2)
        Ac   = c1f - c1f.mean(axis=0)
        Bc   = c2f - c2f.mean(axis=0)
        cov  = Ac.T @ Bc / (len(c1f) - 1)
        corr = cov / (Ac.std(axis=0, keepdims=True).T + 1e-8) / (Bc.std(axis=0, keepdims=True) + 1e-8)
        result = {}
        for f2 in range(F2):
            col     = corr[:, f2]
            top_idx = np.argsort(col)[::-1][:top_k]
            result[str(f2)] = [{'filter_id': int(i), 'contribution': round(float(col[i]), 4)}
                               for i in top_idx]
        return result

    # LIME 

    def _compute_lime(self, X, epoch_num):
        K, N    = self.lime_n_segments, self.lime_n_perturbations
        n_seq   = len(self.dataset)
        seq_len = X.shape[1]
        seg_len = seq_len // K
        bounds  = [(s * seg_len, s * seg_len + seg_len if s < K - 1 else seq_len)
                   for s in range(K)]
        bg      = np.full((seq_len, 4), 0.25, dtype=np.float32)
        np.random.seed(42)
        all_z   = np.random.randint(0, 2, size=(n_seq, N, K), dtype=np.int8)
        all_p   = np.empty((n_seq * N, seq_len, 4), dtype=np.float32)
        for si in range(n_seq):
            xb = X[si]
            for ni in range(N):
                p = xb.copy()
                for s, (st, en) in enumerate(bounds):
                    if all_z[si, ni, s] == 0: p[st:en] = bg[st:en]
                all_p[si * N + ni] = p
        print(f'  LIME: prediciendo {n_seq * N} perturbaciones...')
        all_preds  = self.model.predict(all_p, batch_size=128, verbose=0)
        orig_preds = self.model.predict(X,     batch_size=64,  verbose=0)
        seqs_out   = {}
        for si in range(n_seq):
            z_i   = all_z[si].astype(np.float32)
            y_i   = all_preds[si * N: si * N + N, 0]
            sim   = np.exp(-(K - z_i.sum(axis=1)) / K)
            clf   = Ridge(alpha=1.0, fit_intercept=True)
            clf.fit(z_i, y_i, sample_weight=sim)
            pw    = np.zeros(seq_len, dtype=np.float32)
            for s, (st, en) in enumerate(bounds): pw[st:en] = clf.coef_[s]
            label = int(self.dataset['label_binary'].iloc[si])
            seqs_out[str(si)] = {
                'seq_original':      self.dataset['seq_original'].iloc[si],
                'true_label':        'Nucleosome' if label == 0 else 'Non-Nucleosome',
                'original_prediction': {
                    'nucleosome':     round(float(orig_preds[si, 0]), 4),
                    'non_nucleosome': round(float(orig_preds[si, 1]), 4),
                },
                'segment_weights':   [round(float(w), 6) for w in clf.coef_],
                'position_weights':  [round(float(w), 6) for w in pw],
                'intercept':         round(float(clf.intercept_), 6),
                'boundaries':        [[int(s), int(e)] for s, e in bounds],
                'n_segments': K, 'n_perturbations': N,
            }
        return {'epoch': epoch_num, 'dataset': self.datasetname,
                'n_segments': K, 'n_perturbations': N, 'sequences': seqs_out}

    # on_epoch_end 

    def on_epoch_end(self, epoch, logs=None):
        if self.save_every and (epoch + 1) % self.save_every != 0:
            return
        epoch_num = epoch + 1
        print(f' – {self.datasetname.upper()} época {epoch_num}...')

        X, _      = prepare_tensors(self.dataset)
        labels    = list(self.dataset['label_binary'])
        seqs_orig = list(self.dataset['seq_original'])
        num_seqs  = len(self.dataset)
        idx_nuc   = [i for i, lb in enumerate(labels) if lb == 0]
        idx_non   = [i for i, lb in enumerate(labels) if lb == 1]

        data = {'epoch': epoch_num, 'dataset': self.datasetname, 'layers': {}}

        # Inferencia base 
        print('  conv1d_1 y conv1d_2 predict...')
        acts1 = self.conv_models['conv1d_1'].predict(X, verbose=0)
        acts2 = self.conv_models['conv1d_2'].predict(X, verbose=0)
        c1    = self.model.get_layer('conv1d_1')
        ks1   = c1.kernel_size[0]

        # Heatmap (fragments & activations) 
        if self.compute_heatmap:
            print('  -> Generando datos Heatmap (fragments conv1d_1, activations conv1d_2)...')
            for si in range(num_seqs):
                lt  = 'Nucleosome' if labels[si] == 0 else 'Non-Nucleosome'
                # conv1d_1
                for fi in range(acts1.shape[2]):
                    fa   = acts1[si, :, fi]
                    tops = (np.argsort(fa)[::-1][:self.top_activations]
                            if self.top_activations is not None else np.arange(len(fa)))
                    for pos in tops:
                        av = float(fa[pos])
                        if av <= 0: continue
                        lp  = (ks1 - 1) // 2
                        sn  = self._ensure_seq_node(data, 'conv1d_1', fi, si, lt)
                        self._add_fragment(sn, max(0, pos - lp), ks1 - 1, av)
                        
                # conv1d_2
                for fi in range(acts2.shape[2]):
                    fa = acts2[si, :, fi]
                    sn = self._ensure_seq_node(data, 'conv1d_2', fi, si, lt)
                    sn['activations'] = [round(float(v), 4) for v in fa]

        # Filter Stats 
        if self.compute_filter_stats:
            print('  -> Generando estadisticas de filtros...')
            data['filter_importance'] = {
                'conv1d_1': {
                    'all':           self._filter_importance(acts1),
                    'nucleosome':    self._filter_importance(acts1[idx_nuc]) if idx_nuc else {},
                    'non_nucleosome': self._filter_importance(acts1[idx_non]) if idx_non else {},
                },
                'conv1d_2': {
                    'all':           self._filter_importance(acts2),
                    'nucleosome':    self._filter_importance(acts2[idx_nuc]) if idx_nuc else {},
                    'non_nucleosome': self._filter_importance(acts2[idx_non]) if idx_non else {},
                }
            }

        # Motifs 
        if self.compute_motifs:
            print('  -> Calculando Motifs (conv1d_1)...')
            lm = {'all': self._compute_motifs(acts1, seqs_orig, ks1, 1)}
            if idx_nuc: lm['nucleosome']    = self._compute_motifs(
                acts1[idx_nuc], [seqs_orig[i] for i in idx_nuc], ks1, 1)
            if idx_non: lm['non_nucleosome'] = self._compute_motifs(
                acts1[idx_non], [seqs_orig[i] for i in idx_non], ks1, 1)
            data['motifs'] = {'conv1d_1': lm}

        # Grad-CAM 
        if self.compute_gradcam:
            print('  -> Calculando Grad-CAM (conv1d_1 y conv1d_2)...')
            data['gradcam']         = {}
            data['gradcam_filters'] = {}
            for layer_name in ('conv1d_1', 'conv1d_2'):
                data['gradcam'][layer_name]         = {}
                data['gradcam_filters'][layer_name] = {}
                for ci, ck in ((0, 'nucleosome'), (1, 'non_nucleosome')):
                    gcam, ranking = self._gradcam_batch(X, ci, layer_name)
                    data['gradcam'][layer_name][ck]         = {
                        str(i): [round(float(v), 4) for v in gcam[i]]
                        for i in range(len(gcam))
                    }
                    data['gradcam_filters'][layer_name][ck] = ranking

        # Guardar JSON 
        out_file = os.path.join(self.output_dir,
                                f'activations_{self.datasetname}_epoch_{epoch_num}.json')
        with open(out_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f'  OK → {out_file}')

        # LIME 
        lime_saved = False
        if self.compute_lime:
            print(f'  LIME ({self.lime_n_segments} seg, {self.lime_n_perturbations} pert)...')
            lime_data = self._compute_lime(X, epoch_num)
            lime_file = os.path.join(self.output_dir,
                                     f'lime_{self.datasetname}_epoch_{epoch_num}.json')
            with open(lime_file, 'w', encoding='utf-8') as f:
                json.dump(lime_data, f, ensure_ascii=False, indent=2)
            print(f'  OK LIME → {lime_file}')
            lime_saved = True

        # Manifest 
        model_info = None
        try:
            c1 = self.model.get_layer('conv1d_1')
            model_info = {'num_filters': int(c1.filters),
                          'kernel_size': int(c1.kernel_size[0]),
                          'input_length': int(self.model.input_shape[1])}
        except Exception:
            pass
        update_manifest(self.output_dir, self.datasetname, epoch_num,
                        model_info=model_info, has_lime=lime_saved)
