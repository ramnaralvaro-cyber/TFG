# TFG - Visualización e Interpretabilidad de Redes Neuronales Convolucionales para Secuencias de ADN

Trabajo de Fin de Grado del Grado en Ingeniería Informática de la Universidad de Salamanca.

Este proyecto desarrolla un sistema completo para entrenar una red neuronal convolucional (CNN 1D) capaz de clasificar secuencias de ADN y analizar su funcionamiento mediante distintas técnicas de Inteligencia Artificial Explicable (XAI). Además, incluye un visualizador web interactivo para explorar todos los resultados generados durante el entrenamiento.

---

## Contenido del repositorio

El repositorio incluye:

- Código del entrenamiento del modelo.
- Generador de datasets sintéticos.
- Visualizador web interactivo.

---

## Requisitos

Se recomienda utilizar una versión de Python compatible con TensorFlow y Keras.

Instalar las dependencias principales:

```
pip install tensorflow pandas scikit-learn
```

Dependiendo del sistema operativo puede ser necesario instalar otras dependencias adicionales requeridas por TensorFlow.

---

## Entrenamiento

El entrenamiento se realiza desde el archivo `run.py`.

Desde este archivo pueden configurarse los principales parámetros del modelo, entre ellos:

- Número de filtros.
- Tamaño del kernel.
- Dropout.
- Learning rate.
- Número de épocas.
- Generación de análisis XAI.
- Directorios de entrada y salida.

Los datasets sintéticos pueden generarse previamente mediante el script correspondiente, modificando sus parámetros según las necesidades del experimento.

Todos estos parámetros se describen con mayor detalle en la memoria del proyecto.

---

## Visualizador web

Una vez generados los resultados, el visualizador permite explorar de forma interactiva:

- Heatmap de activaciones.
- Motivos de consenso.
- Importancia de filtros.
- Grad-CAM.
- LIME.
- Características estructurales de las secuencias.

Para ejecutarlo basta con situarse en la carpeta `viewer` y lanzar un servidor web local:

```
python -m http.server
```

Posteriormente acceder desde el navegador a:

```
http://localhost:8000
```

---

## Organización de resultados

Los resultados del entrenamiento se almacenan en formato JSON.

El visualizador utiliza principalmente:

- `manifest.json`
- `sequences_metadata_<dataset>.json`
- `activations_<dataset>_epoch<N>.json`
- `lime_<dataset>_epoch<N>.json`

Por defecto, el visualizador busca estos archivos dentro del directorio `output_model`.

---

## Tecnologías utilizadas

### Entrenamiento

- Python
- TensorFlow / Keras
- NumPy
- Pandas
- Scikit-learn

### Visualizador

- HTML
- CSS
- JavaScript
- D3.js

---

## Autor

Álvaro Ramos Naranjo

Trabajo de Fin de Grado

Grado en Ingeniería Informática

Universidad de Salamanca
