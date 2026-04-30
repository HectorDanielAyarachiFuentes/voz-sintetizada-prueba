# Historial de Desarrollo: Motor TTS Offline (VozInteractiva Pro)

Este documento recopila todos los problemas críticos enfrentados durante la migración del motor de texto a voz (TTS) hacia un entorno 100% offline y estático en GitHub Pages, junto con las soluciones arquitectónicas implementadas.

## 1. Problema: Error de Inicialización Prematura de WebAssembly
**Síntoma:** Al entrar a la web y seleccionar una voz rápidamente, la consola arrojaba errores como `TypeError: Cannot read properties of undefined (reading 'buffer')` o `_malloc is not a function`.
**Causa:** El motor Emscripten/WASM (`sherpa-onnx-wasm-main-tts.js`) es asíncrono. Los usuarios interactuaban con la interfaz (llamando a `initTTS`) antes de que los archivos `.wasm` y `.data` terminaran de cargarse y montar el sistema de archivos virtual (VFS).
**Solución:** 
Se implementó una bandera de guarda (`wasmReady` y `pendingInit`). Si el usuario solicita sintetizar voz antes de que el motor esté listo, la orden se pone en cola y la interfaz muestra el progreso nativo de descarga. Una vez inicializado correctamente (`Module.onRuntimeInitialized`), el motor arranca la voz solicitada automáticamente.

## 2. Problema: Tiempos de Carga Inicial Excesivos (100MB+)
**Síntoma:** La primera vez que se abría la página, el navegador forzaba la descarga de un archivo `.data` de 92MB.
**Causa:** El compilado original de Sherpa-ONNX empaquetaba el modelo completo de inglés (`en_US-libritts_r-medium.onnx` de 75MB) directamente dentro del archivo base de Emscripten (`sherpa-onnx-wasm-main-tts.data`).
**Solución:** 
Se desarrolló el script `repack-data.js` que abrió, filtró y reconstruyó el paquete binario `.data`, extrayendo el modelo de inglés y dejando solo los diccionarios base (`espeak-ng-data`).
**Resultado:** La carga inicial obligatoria se redujo un **81%** (de 92MB a 17MB). El modelo de inglés ahora se descarga bajo demanda como el resto de las voces.

## 3. Problema: Bloqueos por CORS y Límites de Tamaño en GitHub Pages
**Síntoma:** Al intentar alojar la web en GitHub Pages, los modelos grandes (como Daniela y MMS, que pesan ~108MB) fallaban al descargar.
**Causa:** 
1. **GitHub Pages (Git LFS):** Limita el tamaño a 100MB por archivo. Los archivos mayores a eso se suben vía Git LFS, pero GitHub Pages *no sirve archivos de Git LFS*, devolviendo en su lugar un archivo de texto inútil de 130 bytes.
2. **GitHub Releases:** Se intentó mover los modelos a *GitHub Releases*. Sin embargo, las descargas mediante `fetch()` en JavaScript eran bloqueadas por políticas de seguridad de origen cruzado (**CORS**) implementadas por Amazon AWS/Azure (donde GitHub aloja los binarios de Releases).

## 4. Solución Definitiva: Descarga Dinámica por Fragmentos (Chunks)
Para esquivar tanto el límite de 100MB de GitHub Pages como las restricciones de CORS, se diseñó un sistema de partición de modelos:
**Implementación:**
1. Se creó el script `split-models.js`, el cual lee cualquier archivo `.onnx` y lo divide matemáticamente en partes binarias de máximo **30MB** (`.part1`, `.part2`, etc.).
2. Estos fragmentos pequeños se suben nativamente al repositorio y a GitHub Pages sin activar las restricciones de tamaño.
3. Se reescribió la lógica `fetchChunksWithProgress` en `app.js` para descargar estos múltiples fragmentos en paralelo y unirlos de vuelta en la memoria RAM del navegador usando `Uint8Array`.

## 5. Problema: `RangeError: offset is out of bounds`
**Síntoma:** Durante la reconstrucción de los *chunks* en memoria, la aplicación colapsaba con un error de memoria fuera de límite.
**Causa:** Inicialmente, el código intentaba preasignar la memoria total basada en los metadatos HTTP (`content-length`) que respondía el servidor de GitHub. Sin embargo, GitHub Pages aplica compresión GZIP/Brotli dinámica, lo que alteraba los encabezados y hacía que el tamaño reservado en memoria fuera menor al real.
**Solución:** 
El código de reconstrucción se modificó para funcionar de forma *dinámica*. En lugar de preasignar memoria, los fragmentos crudos descargados (`ArrayBuffers`) se empujan a una lista en RAM. Solo cuando la descarga finaliza al 100%, se suman los tamaños exactos de los bloques y se crea un único `Uint8Array` perfecto, eliminando las dependencias de los encabezados del servidor.

---
**Estado Final:** El motor opera de forma 100% independiente, estática y gratuita, hospedado íntegramente en GitHub Pages con tiempos de respuesta optimizados y libre de errores de memoria o red.
