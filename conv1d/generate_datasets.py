#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Este script genera datasets de secuencias de ADN sintéticas para entrenar y 
evaluar modelos de Deep Learning. 


MODOS BÁSICOS
Generan secuencias basadas en distribuciones de nucleótidos o patrones fijos.
Útiles como línea base (baseline) o pruebas conceptuales simples.

Ejemplos:
  • Aleatorio puro vs Secuencia sesgada por GC (rica en G y C):
    python generate_proteins.py --combined-gc --count 100 --length 150 --output combined_gc.csv

  • Transición (Mitad inicial A, mitad terminal G) vs Homogéneo puro (solo A):
    python generate_proteins.py --combined-homo-trans --count 100 --length 150 --output ht.csv
    
  • Secuencia segmentada (extremos aleatorios, centro rico en A):
    python generate_proteins.py --combined-segmented --count 100 --output seg.csv

MODOS COMPLEJOS (--dataset_type)
Generan secuencias basadas en lógicas biológicas realistas con control de ruido global.
Todos estos modos insertan patrones sobre fondos aleatorios controlados asegurando 
que no se formen motivos secundarios cruzados accidentalmente.

Ejemplos:
  • Motivos Degenerados (IUPAC): Inserta variaciones semialeatorias de un motivo "ACRNAG".
    python generate_proteins.py --dataset_type degenerate_motif --count 1000 --output degen.csv

  • Motivos Espaciados: Integra dos motivos fijos separados por un hueco de longitud variable.
    python generate_proteins.py --dataset_type spaced_motifs --count 1000 --output spaced.csv

  • Lógica Combinatoria: Requiere (Motif A AND Motif B) excluyendo explícitamente Motif C.
    python generate_proteins.py --dataset_type combinatorial_logic --count 1000 --output combi.csv

  • Repeticiones en Tándem: Genera largos tractos donde un codón se repite por encima de un umbral.
    python generate_proteins.py --dataset_type tandem_repeats --count 1000 --output tandem.csv

-----------------------------------------------------------------------------
"""

import argparse
import random
import sys
import pandas as pd

# =============================================================================
# GENERADORES BÁSICOS
# =============================================================================
# Generan secuencias base o añaden ruido simple.

def generate_random_sequence(length, allowed_bases=None):
    """
    Genera puro ruido aleatorio uniformemente distribuido.
    - length: Largo de la secuencia de salida.
    - allowed_bases: Array de letras permitidas (default: A, C, G, T).
    """
    if allowed_bases is None: allowed_bases = ['A', 'C', 'G', 'T']
    return ''.join(random.choice(allowed_bases) for _ in range(length))

def generate_gc_biased_sequence(length, gc_content=0.5):
    """
    Produce una secuencia con un porcentaje exacto especificado de G y C.
    Mezcla aleatoriamente las bases tras calcular las proporciones en crudo.
    - gc_content: Ratio [0.0 - 1.0] objetivo para el par G-C.
    """
    gc_count = int(length * gc_content)
    at_count = length - gc_count
    gc_bases = ['G', 'C'] * (gc_count // 2)
    if gc_count % 2: gc_bases.append(random.choice(['G', 'C']))
    at_bases = ['A', 'T'] * (at_count // 2)
    if at_count % 2: at_bases.append(random.choice(['A', 'T']))
    bases = gc_bases + at_bases
    random.shuffle(bases)
    return ''.join(bases)

def generate_gc_only_sequence(length):
    """Secuencia compuesta únicamente de bases G y C barajadas."""
    bases = ['G'] * (length // 2) + ['C'] * (length - (length // 2))
    random.shuffle(bases)
    return ''.join(bases)

def generate_at_pattern_sequence(length, at_ratio=0.5):
    """Genera secuencia compuesta solo por A y T bajo un ratio AT controlado."""
    a_count = int(length * at_ratio)
    bases = ['A'] * a_count + ['T'] * (length - a_count)
    random.shuffle(bases)
    return ''.join(bases)

def generate_gct_with_a_pattern(length, a_min=5, a_max=20):
    """
    Rellena la secuencia de G,C,T puras e inserta un segmento contiguo 
    compuesto puramente por Adeninas de tamaño aleatorio a_min..a_max.
    """
    a_min, a_max = max(1, min(a_min, length)), min(length, max(a_min, a_max))
    a_length = random.randint(a_min, a_max)
    base_seq = [random.choice(['G', 'C', 'T']) for _ in range(length - a_length)]
    insert_pos = random.randint(0, len(base_seq))
    return ''.join(base_seq[:insert_pos] + ['A'] * a_length + base_seq[insert_pos:])

def generate_gct_only_pattern_sequence(length):
    """Fondo de exclusión: secuencias de bases aleatoriamente elegidas entre G, C, y T."""
    return ''.join(random.choice(['G', 'C', 'T']) for _ in range(length))

def generate_homogeneous_sequence(length, base='A'):
    """Genera una iteración idéntica de la isma base."""
    return base * length

def generate_transition_sequence(length, start_base='A', end_base='G', transition_point=None):
    """
    Genera un choque de interfaces, la secuencia se divide en dos grandes bloques macizos.
    - transition_point: Índice donde start_base da paso a end_base.
    """
    tp = (length // 2) if transition_point is None else max(0, min(transition_point, length))
    return start_base * tp + end_base * (length - tp)

def generate_sequences_one(length, count, position=None):
    """
    Devuelve ya el bloque iterado de *count* secuencias compuestas enteramente por 'A' 
    que sufren una única mutación de base 'C'.
    """
    seqs = []
    for _ in range(count):
        s = ['A'] * length
        pos = random.randint(0, length - 1) if position is None else position
        s[pos] = 'C'
        seqs.append(''.join(s))
    return seqs

def generate_a_biased_gct_sequence(length, a_ratio=0.25):
    """Fondo rico en A esparcido uniformemente entre G,C,T sin crear tractos explícitos."""
    a_count = int(length * a_ratio)
    bases = ['A'] * a_count + [random.choice(['G', 'C', 'T']) for _ in range(length - a_count)]
    random.shuffle(bases)
    return ''.join(bases)

def generate_segmented_a_pattern_sequence(length, a_pct_center=0.55):
    """
    Crea 3 segmentos espaciales: el primer y último cuarto son aleatorios por naturaleza.
    La porción central interna incrementa su sesgo de la base Adenina localmente.
    """
    s1_len, s3_len = length // 4, length // 4
    s2_len = length - s1_len - s3_len
    s1 = [random.choice(['A', 'C', 'G', 'T']) for _ in range(s1_len)]
    s3 = [random.choice(['A', 'C', 'G', 'T']) for _ in range(s3_len)]
    a_cnt = int(s2_len * a_pct_center)
    s2 = ['A'] * a_cnt + [random.choice(['G', 'C', 'T']) for _ in range(s2_len - a_cnt)]
    random.shuffle(s2)
    return ''.join(s1 + s2 + s3)

def generate_nucleosome_like_sequence(length=147):
    """
    Simula dinucleótidos característicos de la flexibilidad para enrolle biológico del ADN.
    Establece una periodicidad aproximada cada 10 pares de bases.
    """
    seq, pos = [], 0
    favs = ['AA', 'TT', 'AT', 'TA']
    neuts = ['AC', 'AG', 'CA', 'GA', 'CT', 'GT', 'TC', 'TG']
    while pos < length:
        if pos % 10 < 4:
            if pos + 2 <= length: seq.append(random.choice(favs)); pos += 2
            else: seq.append(random.choice('ACGT')); pos += 1
        else:
            if pos + 2 <= length: seq.append(random.choice(neuts)); pos += 2
            else: seq.append(random.choice('ACGT')); pos += 1
    return ''.join(seq)[:length]

def generate_linker_like_sequence(length=50):
    """Linker desnudo entre nucleosomas. Tradicionalmente modelado como GC biased."""
    return generate_gc_biased_sequence(length, gc_content=0.35)

def generate_mutated_sequence(base_sequence, mutation_rate=0.05):
    """Iterador que clona una secuencia e impone substituciones letales en posiciones aleatorias."""
    s = list(base_sequence)
    muts = int(len(s) * mutation_rate)
    for pos in random.sample(range(len(s)), muts):
        s[pos] = random.choice([b for b in 'ACGT' if b != s[pos]])
    return ''.join(s)

# =============================================================================
# UTILIDADES Y LÓGICAS COMPLEJAS
# =============================================================================
# Herramientas auxiliares y manejo IUPAC.

# Acrónimos universales IUPAC para degeneración nucleotídica base múltiple
IUPAC = {
    'A': ['A'], 'C': ['C'], 'G': ['G'], 'T': ['T'],
    'R': ['A', 'G'], 'Y': ['C', 'T'], 'S': ['G', 'C'],
    'W': ['A', 'T'], 'K': ['G', 'T'], 'M': ['A', 'C'],
    'B': ['C', 'G', 'T'], 'D': ['A', 'G', 'T'],
    'H': ['A', 'C', 'T'], 'V': ['A', 'C', 'G'],
    'N': ['A', 'C', 'G', 'T'],
}

def expand_iupac(motif):
    """Dada un patrón como 'ACRNAG', colapsa semánticamente en una de sus variaciones válidas."""
    return ''.join(random.choice(IUPAC.get(b.upper(), ['N'])) for b in motif)

def reverse_complement(seq):
    """Comprende su pareo biológico reverso, por ejemplo: ATGC pasa a ser GCAT."""
    comp = {'A': 'T', 'T': 'A', 'C': 'G', 'G': 'C'}
    return ''.join(comp.get(b, 'N') for b in reversed(seq.upper()))

def apply_noise(seq, noise_level):
    """Remplaza nucleótidos globales a ruido puro asépticamente, regido por un porcentaje dictatorial."""
    if noise_level <= 0: return seq
    return ''.join(random.choice([b for b in 'ACGT' if b != c]) if random.random() < noise_level else c for c in seq)

def insert_motif(seq_list, motif, position=None):
    """Asignación destructiva en un indice al azar dentro de array nucleotídico con el motif."""
    max_pos = len(seq_list) - len(motif)
    if max_pos < 0: return seq_list
    pos = random.randint(0, max_pos) if position is None else max(0, min(position, max_pos))
    return seq_list[:pos] + list(motif) + seq_list[pos + len(motif):]

def _safe_background(length, forbidden, max_tries=200):
    """
    Rellena fondos biológicos comprobando iterativamente que, por pura estadística, 
    no se ha fabricado accidentalmente un background que ya contenga el motivo a evaluar
    y que rompería el proceso de ML. Modifica activamente in-place como fallback.
    """
    for _ in range(max_tries):
        bg = list(generate_random_sequence(length))
        s = ''.join(bg)
        if not any(m in s for m in forbidden): return bg
        
    bg = list(generate_random_sequence(length))
    s = ''.join(bg)
    for m in forbidden:
        while m in s:
            idx = s.index(m)
            bg[idx:idx + len(m)] = list(generate_random_sequence(len(m), [b for b in 'ACGT' if b != m[0]]))
            s = ''.join(bg)
    return bg


# =============================================================================
# GENERADORES BATCH
# =============================================================================
# Funciones auxiliares para generar lotes de secuencias.

def generate_sequences_batch(seq_type, count, length, **kwargs):
    sequences = []
    for _ in range(count):
        if   seq_type == 'random':       seq = generate_random_sequence(length, kwargs.get('allowed_bases', ['A', 'C', 'G', 'T']))
        elif seq_type == 'pattern':      seq = generate_gc_biased_sequence(length, kwargs.get('gc_content', 0.5))
        elif seq_type == 'gc_only':      seq = generate_gc_only_sequence(length)
        elif seq_type == 'at_pattern':   seq = generate_at_pattern_sequence(length, kwargs.get('at_ratio', 0.5))
        elif seq_type == 'gct_with_a':   seq = generate_gct_with_a_pattern(length, a_min=kwargs.get('a_min', 5), a_max=kwargs.get('a_max', 20))
        elif seq_type == 'gct_only':     seq = generate_gct_only_pattern_sequence(length)
        elif seq_type == 'homogeneous':  seq = generate_homogeneous_sequence(length, kwargs.get('base', 'A'))
        elif seq_type == 'transition':   seq = generate_transition_sequence(length, kwargs.get('start_base', 'A'), kwargs.get('end_base', 'G'), kwargs.get('transition_point', None))
        elif seq_type == 'uniform_acgt': seq = generate_random_sequence(length)
        elif seq_type == 'segmented_a':  seq = generate_segmented_a_pattern_sequence(length, a_pct_center=kwargs.get('a_pct_center', 0.55))
        elif seq_type == 'a_low_gct':    seq = generate_a_biased_gct_sequence(length, a_ratio=kwargs.get('a_ratio_low', 0.25))
        elif seq_type == 'a_high_gct':   seq = generate_segmented_a_pattern_sequence(length, a_pct_center=kwargs.get('a_ratio_high', 0.75))
        elif seq_type == 'nucleosome':   seq = generate_nucleosome_like_sequence(length)
        elif seq_type == 'linker':       seq = generate_linker_like_sequence(length)
        elif seq_type == 'mutated':      seq = generate_mutated_sequence(generate_random_sequence(length, kwargs.get('allowed_bases', ['A', 'C', 'G', 'T'])), kwargs.get('mutation_rate', 0.05))
        else: raise ValueError(f"Tipo desconocido: {seq_type}")
        sequences.append(seq)
    return sequences


# =============================================================================
# GENERADORES DE DATASETS COMPLEJOS
# =============================================================================
# Generación de secuencias con lógicas avanzadas y ensamblado en Pandas DataFrames.

def generate_degenerate_motif_dataset(
        count, length, motif='ACRNAG',
        noise_level=0.0, motif_variability=0.0, seed=None,
        pos_label='n1', neg_label='ran'):
    """
    Positivo: inserta una iteración válidamente colapsada del motivo IUPAC especificado y lo perturba subrepticiamente.
    Negativo: Background estático al que se somete al mismo nivel de ruido base.
    """
    if seed is not None: random.seed(seed)
    records = []
    
    # Positivos
    for _ in range(count):
        instance = expand_iupac(motif)  
        if motif_variability > 0: instance = apply_noise(instance, motif_variability)
        bg = insert_motif(_safe_background(length, forbidden=[]), instance)
        records.append({'seq': apply_noise(''.join(bg), noise_level), 'source': pos_label})
        
    # Negativos
    for _ in range(count):
        records.append({'seq': apply_noise(generate_random_sequence(length), noise_level), 'source': neg_label})
        
    return pd.DataFrame(records).sample(frac=1, random_state=seed or 42).reset_index(drop=True)

def generate_spaced_motifs_dataset(
        count, length, motif1='AAAAAAAA', motif2='CCCCCCCC',
        min_spacing=5, max_spacing=20, noise_level=0.0, seed=None,
        pos_label='n1', neg_label='ran'):
    """
    Positivo: Bloque en secuencia de la formula -> Motif 1 + Espaciador de Lógica Dinámica + Motif 2.
    Negativo: Posee la peculiaridad de requerir uno de los dos obligatoriamente, pero no ambos nunca.
    """
    if seed is not None: random.seed(seed)
    records = []
    m1_len, m2_len = len(motif1), len(motif2)

    # Positivos
    for _ in range(count):
        spacing = random.randint(min_spacing, max_spacing)
        combined = m1_len + spacing + m2_len
        if combined >= length: spacing, combined = max(1, length - m1_len - m2_len - 2), m1_len + max(1, length - m1_len - m2_len - 2) + m2_len
        start = random.randint(0, max(0, length - combined))
        
        insert = list(expand_iupac(motif1)) + list(generate_random_sequence(spacing)) + list(expand_iupac(motif2))
        bg = _safe_background(length, forbidden=[motif1, motif2])
        bg[start: start + len(insert)] = insert
        records.append({'seq': apply_noise(''.join(bg), noise_level), 'source': pos_label})

    # Negativos Exclusivos
    for _ in range(count):
        m_insert = motif1 if random.random() < 0.5 else motif2
        bg = insert_motif(_safe_background(length, forbidden=[motif1, motif2]), expand_iupac(m_insert))
        records.append({'seq': apply_noise(''.join(bg), noise_level), 'source': neg_label})

    return pd.DataFrame(records).sample(frac=1, random_state=seed or 42).reset_index(drop=True)

def generate_tandem_repeats_dataset(
        count, length, unit='CAG',
        repeat_min=3, repeat_max=10, repeat_threshold=6,
        noise_level=0.0, seed=None,
        pos_label='n1', neg_label='ran'):
    """
    Positivo: Repeats encadenadas multiplicativamente más largas de una métrica base de repetición perjudicial ('threshold').
    Negativo: Mismas dinámicas en codón insertado, pero se desactiva y estanca siempre un escalón por debajo del path límite minucioso.
    """
    if seed is not None: random.seed(seed)
    repeat_threshold = max(repeat_min, min(repeat_threshold, repeat_max))
    records = []
    
    # Positivos (Patogénicos >= Umbral)
    for _ in range(count):
        r = random.randint(repeat_threshold, repeat_max)
        run = unit * r
        bg = _safe_background(length, forbidden=[unit])
        seq_list = insert_motif(bg, run)
        seq = ''.join(seq_list)
        
        if noise_level > 0:
            run_pos = seq.find(run)
            if run_pos != -1:
                left_part = apply_noise(seq[:run_pos], noise_level)
                right_part = apply_noise(seq[run_pos + len(run):], noise_level)
                # Asegurar que el ruido no recree accidentalmente la unidad repetitiva en el fondo
                while unit in left_part or unit in right_part:
                    left_part = apply_noise(seq[:run_pos], noise_level)
                    right_part = apply_noise(seq[run_pos + len(run):], noise_level)
                seq = left_part + run + right_part
                
        records.append({'seq': seq, 'source': pos_label})
        
    # Negativos (Cortos < Umbral)
    for _ in range(count):
        r = random.randint(repeat_min, max(repeat_min, repeat_threshold - 1))
        run = unit * r
        bg = _safe_background(length, forbidden=[unit])
        seq_list = insert_motif(bg, run)
        seq = ''.join(seq_list)
        
        if noise_level > 0:
            run_pos = seq.find(run)
            if run_pos != -1:
                left_part = apply_noise(seq[:run_pos], noise_level)
                right_part = apply_noise(seq[run_pos + len(run):], noise_level)
                # Asegurar que el ruido no recree accidentalmente la unidad repetitiva en el fondo
                while unit in left_part or unit in right_part:
                    left_part = apply_noise(seq[:run_pos], noise_level)
                    right_part = apply_noise(seq[run_pos + len(run):], noise_level)
                seq = left_part + run + right_part
                
        records.append({'seq': seq, 'source': neg_label})
        
    return pd.DataFrame(records).sample(frac=1, random_state=seed or 42).reset_index(drop=True)

def generate_palindromic_dataset(
        count, length, half_motif='ACGT', loop_size=4,
        noise_level=0.0, seed=None,
        pos_label='n1', neg_label='ran'):
    if seed is not None: random.seed(seed)
    records = []
    for _ in range(count):
        h_inst = expand_iupac(half_motif)
        palin = h_inst + generate_random_sequence(loop_size) + reverse_complement(h_inst)
        bg = insert_motif(_safe_background(length, forbidden=[]), palin[:length])
        records.append({'seq': apply_noise(''.join(bg), noise_level), 'source': pos_label})
    for _ in range(count):
        records.append({'seq': apply_noise(generate_random_sequence(length), noise_level), 'source': neg_label})
    return pd.DataFrame(records).sample(frac=1, random_state=seed or 42).reset_index(drop=True)

def generate_combinatorial_logic_dataset(
        count, length,
        motif_a='AACGT', motif_b='TTGCA', motif_c='GGCCC',
        noise_level=0.0, seed=None,
        pos_label='n1', neg_label='ran'):
    """
    Positivo: Forzosamente presenta combinatoria A + B y elimina del fondo el C por exclusividad.
    Negativos fractales: Diseccionados equitativamente entre: "sólo A", "sólo B", "sólo C", "A y C simultáneamente", "vacíos nativos".
    Sirve como desafío de validación dura si CNN usa max_pools vagos.
    """
    if seed is not None: random.seed(seed)
    records = []
    def _ins(b, ms):
        for m in ms: b = insert_motif(b, expand_iupac(m))
        return b

    # Positivos: Contienen A y B, carecen rígidamente de C
    for _ in range(count):
        bg = _ins(_safe_background(length, forbidden=[motif_c]), [motif_a, motif_b])
        records.append({'seq': apply_noise(''.join(bg), noise_level), 'source': pos_label})

    # Negativos: Falla en la lógica en diferentes combinaciones de matriz de la verdad estricta.
    n_types = ['only_a', 'only_b', 'only_c', 'a_and_c', 'none']
    per_type = max(1, count // len(n_types))
    for t in n_types:
        for _ in range(per_type):
            bg = _safe_background(length, forbidden=[motif_a, motif_b, motif_c])
            if   t == 'only_a':  bg = _ins(bg, [motif_a])
            elif t == 'only_b':  bg = _ins(bg, [motif_b])
            elif t == 'only_c':  bg = _ins(bg, [motif_c])
            elif t == 'a_and_c': bg = _ins(bg, [motif_a, motif_c])
            records.append({'seq': apply_noise(''.join(bg), noise_level), 'source': neg_label})

    return pd.DataFrame(records).sample(frac=1, random_state=seed or 42).reset_index(drop=True)


# =============================================================================
# EXPORTACIÓN Y ENSAMBLADO
# =============================================================================

def save_sequences(sequences, output_file, format_type='csv', source_label='n1'):
    """Formatos compatibles a nivel de string serializado."""
    if format_type == 'csv':
        pd.DataFrame({'seq': sequences, 'source': [source_label] * len(sequences)}).to_csv(output_file, index=False)
    elif format_type == 'fasta':
        with open(output_file, 'w') as f:
            for i, seq in enumerate(sequences): f.write(f">seq_{i}\n{seq}\n")
    else:
        with open(output_file, 'w') as f:
            for seq in sequences: f.write(f"{seq}\n")
    print(f"✓ {len(sequences)} secuencias guardadas en {output_file}")

def generate_combined_dataset(output_file, count=100, length=150, at_ratio=0.5, seed=None):
    if seed is not None: random.seed(seed)
    a, b = generate_sequences_batch('at_pattern', count, length, at_ratio=at_ratio), generate_sequences_batch('random', count, length)
    df = pd.DataFrame({'seq': a + b, 'source': ['at_pattern'] * count + ['random'] * count})
    df.sample(frac=1, random_state=seed or 42).reset_index(drop=True).to_csv(output_file, index=False)
    print(f"✓ {len(df)} secuencias → {output_file}")

def generate_combined_gc_dataset(output_file, count=100, length=150, at_ratio=0.5, seed=None):
    if seed is not None: random.seed(seed)
    a, b = generate_sequences_batch('at_pattern', count, length, at_ratio=at_ratio), generate_sequences_batch('gc_only', count, length)
    df = pd.DataFrame({'seq': a + b, 'source': ['at_pattern'] * count + ['gc_pattern'] * count})
    df.sample(frac=1, random_state=seed or 42).reset_index(drop=True).to_csv(output_file, index=False)
    print(f"✓ {len(df)} secuencias → {output_file}")

def generate_gct_pattern_dataset(output_file, count=100, length=150, a_min=5, a_max=20, seed=None):
    if seed is not None: random.seed(seed)
    seqs = generate_sequences_batch('gct_with_a', count, length, a_min=a_min, a_max=a_max)
    pd.DataFrame({'seq': seqs, 'source': ['gct_with_a'] * count}).to_csv(output_file, index=False)
    print(f"✓ {len(seqs)} secuencias → {output_file}")

def generate_combined_gct_random_dataset(output_file, count=100, length=150, a_min=5, a_max=20, seed=None):
    if seed is not None: random.seed(seed)
    a, b = generate_sequences_batch('gct_with_a', count, length, a_min=a_min, a_max=a_max), generate_sequences_batch('gct_only', count, length)
    df = pd.DataFrame({'seq': a + b, 'source': ['gct_with_a'] * count + ['gct_only'] * count})
    df.sample(frac=1, random_state=seed or 42).reset_index(drop=True).to_csv(output_file, index=False)
    print(f"✓ {len(df)} secuencias → {output_file}")

def generate_combined_homogeneous_one_dataset(output_file, count=100, length=150, position=None, seed=None):
    if seed is not None: random.seed(seed)
    a, b = generate_sequences_batch('homogeneous', count, length, base='A'), generate_sequences_one(length, count, position)
    df = pd.DataFrame({'seq': a + b, 'source': ['homogeneous'] * count + ['one_letter'] * count})
    df.sample(frac=1, random_state=seed or 42).reset_index(drop=True).to_csv(output_file, index=False)
    print(f"✓ {len(df)} secuencias → {output_file}")

def generate_combined_segmented_dataset(output_file, count=100, length=150, a_pct_center=0.55, seed=None):
    if seed is not None: random.seed(seed)
    a, b = generate_sequences_batch('uniform_acgt', count, length), generate_sequences_batch('segmented_a', count, length, a_pct_center=a_pct_center)
    df = pd.DataFrame({'seq': a + b, 'source': ['uniform_acgt'] * count + ['segmented_a'] * count})
    df.sample(frac=1, random_state=seed or 42).reset_index(drop=True).to_csv(output_file, index=False)
    print(f"✓ {len(df)} secuencias → {output_file}")

def generate_combined_a_biased_gct_dataset(output_file, count=100, length=150, a_ratio_low=0.25, a_ratio_high=0.75, seed=None):
    if seed is not None: random.seed(seed)
    a, b = generate_sequences_batch('a_low_gct', count, length, a_ratio_low=a_ratio_low), generate_sequences_batch('a_high_gct', count, length, a_ratio_high=a_ratio_high)
    df = pd.DataFrame({'seq': a + b, 'source': ['a_low_gct'] * count + ['a_high_gct'] * count})
    df.sample(frac=1, random_state=seed or 42).reset_index(drop=True).to_csv(output_file, index=False)
    print(f"✓ {len(df)} secuencias → {output_file}")


# =============================================================================
# INTERFAZ DE LÍNEA DE COMANDO (CLI)
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description='Generador de secuencias sintéticas de ADN para entrenar modelos.'
    )

    # Parametros Globales
    group_global = parser.add_argument_group('Parametros Globales')
    group_global.add_argument('--length', type=int, default=150, help='Longitud de cada secuencia generada (default: 150).')
    group_global.add_argument('--count', type=int, default=100, help='Cantidad de secuencias por clase (default: 100).')
    group_global.add_argument('--output', type=str, default='output.csv', help='Archivo CSV de salida (default: output.csv).')
    group_global.add_argument('--seed', type=int, default=None, help='Semilla aleatoria.')
    group_global.add_argument('--source', type=str, default='n1', help='Etiqueta por defecto.')

    # Etiquetas
    group_labels = parser.add_argument_group('Etiquetas de Entrenamiento')
    group_labels.add_argument('--pos-label', type=str, default='n1', help="Etiqueta para clase positiva.")
    group_labels.add_argument('--neg-label', type=str, default='ran', help="Etiqueta para clase negativa.")

    # Modos Basicos
    group_prim = parser.add_argument_group('Modos Básicos')
    group_prim.add_argument('--type', choices=['random', 'pattern', 'gc_only', 'at_pattern', 'nucleosome', 'linker', 'mutated'],
                            help='Llama a un generador básico.')
    group_prim.add_argument('--combined', action='store_true', help='Genera aleatorio vs at_pattern.')
    group_prim.add_argument('--combined-gc', action='store_true', help='Genera gc_pattern vs at_pattern.')
    group_prim.add_argument('--gct-pattern', action='store_true', help='Secuencias de G,C,T con una región Poli-A.')
    group_prim.add_argument('--combined-gct', action='store_true', help='G,C,T puro vs G,C,T con Poli-A.')
    group_prim.add_argument('--homogeneous', action='store_true', help='Cadenas de una sola base repetida.')
    group_prim.add_argument('--transition', action='store_true', help='Dos bloques de bases distintas.')
    group_prim.add_argument('--combined-homo-trans', action='store_true', help='Homogéneas vs transiciones.')
    group_prim.add_argument('--combined-homo-one', action='store_true', help='Homogéneas vs homogéneas con 1 mutación.')
    group_prim.add_argument('--combined-segmented', action='store_true', help='Aleatorio vs centro rico en A.')
    group_prim.add_argument('--combined-a-biased', action='store_true', help='Baja abundancia de A vs alta abundancia de A.')

    group_prim_props = parser.add_argument_group('Ajustes de Modos Básicos')
    group_prim_props.add_argument('--a_min', type=int, default=5, help='Largo mínimo Poli-A.')
    group_prim_props.add_argument('--a_max', type=int, default=20, help='Largo máximo Poli-A.')
    group_prim_props.add_argument('--a-pct-center', type=float, default=0.55, help='Porcentaje de A en el centro (0 a 1).')
    group_prim_props.add_argument('--a-ratio-low', type=float, default=0.25, help='Ratio de A bajo (0 a 1).')
    group_prim_props.add_argument('--a-ratio-high', type=float, default=0.75, help='Ratio de A alto (0 a 1).')
    group_prim_props.add_argument('--transition-point', type=int, default=None, help='Punto de transición (default: mitad).')
    group_prim_props.add_argument('--start-base', type=str, default='A', help='Base inicial.')
    group_prim_props.add_argument('--end-base', type=str, default='G', help='Base final.')

    # Modos Complejos
    group_comp = parser.add_argument_group('Modos Complejos', 'Requiere --dataset_type')
    group_comp.add_argument('--dataset_type', choices=['degenerate_motif', 'spaced_motifs', 'tandem_repeats', 'palindromic', 'combinatorial_logic'],
                            help='Selecciona un modo complejo.')
    group_comp.add_argument('--noise_level', type=float, default=0.0, help='Nivel de ruido posterior (mutaciones aleatorias).')
    
    group_comp_props = parser.add_argument_group('Ajustes de Modos Complejos')
    group_comp_props.add_argument('--motif', type=str, default='ACRNAG', help='Motivo principal (soporta IUPAC).')
    group_comp_props.add_argument('--motif_variability', type=float, default=0.0, help='Tasa de error en el motivo.')
    group_comp_props.add_argument('--motif1', type=str, default='AAAAAAAA', help='Primer motivo (para spaced_motifs).')
    group_comp_props.add_argument('--motif2', type=str, default='CCCCCCCC', help='Segundo motivo (para spaced_motifs).')
    group_comp_props.add_argument('--min_spacing', type=int, default=5, help='Separación mínima entre motivos.')
    group_comp_props.add_argument('--max_spacing', type=int, default=20, help='Separación máxima entre motivos.')
    group_comp_props.add_argument('--repeat_unit', type=str, default='CAG', help='Unidad a repetir (para tandem_repeats).')
    group_comp_props.add_argument('--repeat_min', type=int, default=3, help='Mínimo de repeticiones (negativos).')
    group_comp_props.add_argument('--repeat_max', type=int, default=10, help='Máximo de repeticiones (positivos).')
    group_comp_props.add_argument('--repeat_threshold', type=int, default=6, help='Umbral de repeticiones patológicas.')
    group_comp_props.add_argument('--loop_size', type=int, default=4, help='Tamaño del bucle (para palindromic).')
    group_comp_props.add_argument('--motif_a', type=str, default='AACGT', help='Motivo A (para combinatorial_logic).')
    group_comp_props.add_argument('--motif_b', type=str, default='TTGCA', help='Motivo B (para combinatorial_logic).')
    group_comp_props.add_argument('--motif_c', type=str, default='GGCCC', help='Motivo C, prohibido (para combinatorial_logic).')

    args = parser.parse_args()
    if args.seed is not None:
        random.seed(args.seed)

    # Generación de datasets complejos
    if args.dataset_type:
        dt = args.dataset_type
        kw = dict(seed=args.seed, pos_label=args.pos_label, neg_label=args.neg_label)

        if dt == 'degenerate_motif': df = generate_degenerate_motif_dataset(args.count, args.length, args.motif, args.noise_level, args.motif_variability, **kw)
        elif dt == 'spaced_motifs': df = generate_spaced_motifs_dataset(args.count, args.length, args.motif1, args.motif2, args.min_spacing, args.max_spacing, args.noise_level, **kw)
        elif dt == 'tandem_repeats': df = generate_tandem_repeats_dataset(args.count, args.length, args.repeat_unit, args.repeat_min, args.repeat_max, args.repeat_threshold, args.noise_level, **kw)
        elif dt == 'palindromic': df = generate_palindromic_dataset(args.count, args.length, args.motif, args.loop_size, args.noise_level, **kw)
        elif dt == 'combinatorial_logic': df = generate_combinatorial_logic_dataset(args.count, args.length, args.motif_a, args.motif_b, args.motif_c, args.noise_level, **kw)

        df.to_csv(args.output, index=False)
        pos, neg = len(df[df['source'] == args.pos_label]), len(df[df['source'] == args.neg_label])
        print(f"✓ {len(df)} secuencias -> {args.output}  (pos={pos}, neg={neg})")
        return

    # Generación de datasets básicos
    if args.homogeneous: save_sequences(generate_sequences_batch('homogeneous', args.count, args.length, base=args.start_base), args.output, source_label='homogeneous')
    elif args.transition: save_sequences(generate_sequences_batch('transition', args.count, args.length, start_base=args.start_base, end_base=args.end_base, transition_point=args.transition_point), args.output, source_label='transition')
    elif args.combined_homo_trans:
        h, t = generate_sequences_batch('homogeneous', args.count, args.length, base='A'), generate_sequences_batch('transition', args.count, args.length, start_base='A', end_base='G', transition_point=args.length // 2)
        pd.DataFrame({'seq': h+t, 'source': ['homogeneous']*args.count + ['transition']*args.count}).sample(frac=1, random_state=args.seed or 42).reset_index(drop=True).to_csv(args.output, index=False)
        print(f"✓ {args.count * 2} secuencias -> {args.output}")
    elif args.gct_pattern: generate_gct_pattern_dataset(args.output, args.count, args.length, args.a_min, args.a_max, args.seed)
    elif args.combined_gct: generate_combined_gct_random_dataset(args.output, args.count, args.length, args.a_min, args.a_max, args.seed)
    elif args.combined: generate_combined_dataset(args.output, args.count, args.length, seed=args.seed)
    elif args.combined_gc: generate_combined_gc_dataset(args.output, args.count, args.length, seed=args.seed)
    elif args.combined_homo_one: generate_combined_homogeneous_one_dataset(args.output, args.count, args.length, position=None, seed=args.seed)
    elif args.combined_segmented: generate_combined_segmented_dataset(args.output, args.count, args.length, a_pct_center=args.a_pct_center, seed=args.seed)
    elif args.combined_a_biased: generate_combined_a_biased_gct_dataset(args.output, args.count, args.length, a_ratio_low=args.a_ratio_low, a_ratio_high=args.a_ratio_high, seed=args.seed)
    elif args.type: save_sequences(generate_sequences_batch(args.type, args.count, args.length), args.output, source_label=args.source)
    else: parser.print_help()

if __name__ == '__main__':
    main()
