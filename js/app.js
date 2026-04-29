// ── Configuración de Voces ─────────────────────────────────────────────────
const VOICES = {
    // Modelos Piper oficiales de sherpa-onnx (comment: "piper", has_espeak: 1)
    // Usan la API de Piper con espeak integrado
    claude: {
        label: 'Claude (México - Alta Calidad)',
        model: "claude/es_MX-claude-high.onnx",
        tokens: "claude/tokens.txt",
        isPiper: true,
        dataDir: 'espeak-ng-data',
    },
    daniela: {
        label: 'Daniela (Argentina - Alta Calidad)',
        model: "daniela/es_AR-daniela-high.onnx",
        tokens: "daniela/tokens.txt",
        isPiper: true,
        dataDir: 'espeak-ng-data',
    },
    // Modelo Meta MMS (comment: "mms", frontend: "characters")
    mms_spa: {
        label: 'Español (Meta MMS)',
        model: "vits-mms-spa/model.onnx",
        tokens: "vits-mms-spa/tokens.txt",
        isPiper: false,
        dataDir: '',
    },
    // Modelo en inglés (espeak-ng-data y tokens.txt vienen en el .data)
    test_en: {
        label: 'Voz de Prueba (Inglés - Libritts)',
        model: "en_US-libritts_r-medium.onnx",
        tokens: "tokens.txt",
        isPiper: false,
        dataDir: 'espeak-ng-data',
        internalTokens: true,  // tokens.txt ya está en el VFS via .data
    }
};

let tts = null;
let wasmReady = false;
const btn = document.getElementById('btnSpeak');
const btnText = document.getElementById('btnText');
const btnIcon = document.getElementById('btnIcon');
const btnDl = document.getElementById('btnDownload');
const player = document.getElementById('player');
const statusMsg = document.getElementById('statusMsg');
const statusBar = document.getElementById('statusBar');
const voiceSelect = document.getElementById('voiceSelect');
const textInput = document.getElementById('textInput');

// Actualizar etiquetas de sliders
document.getElementById('lengthScale').oninput = e => document.getElementById('valSpeed').textContent = e.target.value;
document.getElementById('noiseScale').oninput = e => document.getElementById('valNoise').textContent = e.target.value;

function setStatus(msg, cls) {
    statusBar.className = 'status-area ' + cls;
    statusMsg.textContent = msg;
}

// Helper para fetch con progreso
async function fetchWithProgress(url, onProgress) {
    const response = await fetch(url);

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const contentLength = response.headers.get('content-length');
    if (!contentLength) {
        // Si no hay content-length, caemos a fetch normal sin barra pero con el buffer
        return await response.arrayBuffer();
    }

    const total = parseInt(contentLength, 10);
    let loaded = 0;

    const reader = response.body.getReader();
    const chunks = [];
    
    while(true) {
        const {done, value} = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        if (onProgress) onProgress(Math.round((loaded / total) * 100));
    }

    const allChunks = new Uint8Array(loaded);
    let position = 0;
    for (const chunk of chunks) {
        allChunks.set(chunk, position);
        position += chunk.length;
    }
    return allChunks.buffer;
}

// ── Inicialización del Motor TTS ───────────────────────────────────────────
async function initTTS() {
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressPercent = document.getElementById('progressPercent');
    
    // Guardia: no ejecutar si el runtime WASM no está listo
    if (!wasmReady) {
        console.warn('WASM aún no está listo. Esperando...');
        setStatus('Esperando al motor WASM...', 'loading');
        return;
    }

    try {
        btn.disabled = true;
        btnText.textContent = "Preparando voz...";
        setStatus('Cargando archivos del modelo...', 'loading');

        const voiceKey = voiceSelect.value;
        const selected = VOICES[voiceKey];

        let modelPath, tokensPath;

        // Determinar rutas según tipo de modelo
        if (selected.internalTokens) {
            // Tokens ya están en el VFS (via .data), solo descargar el .onnx
            tokensPath = '/' + selected.tokens;
            modelPath = '/model_' + voiceKey + '.onnx';

            setStatus('Descargando modelo (' + selected.label + ')...', 'loading');
            progressContainer.style.display = 'block';
            progressBar.style.width = '0%';
            progressPercent.textContent = '0%';

            const modelBuffer = await fetchWithProgress(selected.model, (percent) => {
                progressBar.style.width = percent + '%';
                progressPercent.textContent = percent + '%';
                statusMsg.textContent = `Descargando modelo: ${percent}%`;
            });

            progressContainer.style.display = 'none';

            try { Module.FS_unlink(modelPath); } catch(e) {}
            Module.FS_createDataFile("/", modelPath.substring(1), new Uint8Array(modelBuffer), true, true, true);
        } else {
            // Descargar tanto modelo como tokens
            modelPath = '/model_' + voiceKey + '.onnx';
            tokensPath = '/tokens_' + voiceKey + '.txt';

            setStatus('Descargando modelo (' + selected.label + ')...', 'loading');
            progressContainer.style.display = 'block';
            progressBar.style.width = '0%';
            progressPercent.textContent = '0%';

            // Descargar modelo con progreso
            const modelBuffer = await fetchWithProgress(selected.model, (percent) => {
                progressBar.style.width = percent + '%';
                progressPercent.textContent = percent + '%';
                statusMsg.textContent = `Descargando modelo: ${percent}%`;
            });

            // Descargar tokens
            const tokensResp = await fetch(selected.tokens);
            if (!tokensResp.ok) throw new Error(`No se pudo cargar tokens: ${selected.tokens}`);
            const tokensBuffer = await tokensResp.arrayBuffer();

            progressContainer.style.display = 'none';
            progressBar.style.width = '0%';
            progressPercent.textContent = '0%';

            // Escribir al VFS
            try { Module.FS_unlink(modelPath); } catch(e) {}
            Module.FS_createDataFile("/", modelPath.substring(1), new Uint8Array(modelBuffer), true, true, true);

            try { Module.FS_unlink(tokensPath); } catch(e) {}
            Module.FS_createDataFile("/", tokensPath.substring(1), new Uint8Array(tokensBuffer), true, true, true);
        }

        setStatus('Configurando motor Sherpa-ONNX...', 'loading');

        const lengthScale = parseFloat(document.getElementById('lengthScale').value);
        const dataDir = selected.dataDir;

        // Construir config según tipo de modelo
        const config = {
            offlineTtsModelConfig: {
                offlineTtsVitsModelConfig: {
                    model: modelPath,
                    lexicon: '',
                    tokens: tokensPath,
                    dataDir: dataDir,
                    noiseScale: 0.667,
                    noiseScaleW: 0.8,
                    lengthScale: lengthScale,
                },
                numThreads: 1,
                debug: 0,
                provider: 'cpu',
            },
            ruleFsts: '',
            maxNumSentences: 1,
        };

        console.log("Iniciando TTS con configuracion:", JSON.stringify(config, null, 2));

        // Si ya hay un motor activo, liberarlo antes de crear uno nuevo
        if (tts) {
            try {
                tts.free();
            } catch (e) {
                console.warn("Error al liberar motor anterior:", e);
            }
        }

        tts = createOfflineTts(Module, config);

        btn.disabled = false;
        btnText.textContent = 'Sintetizar y Escuchar';
        btnIcon.textContent = '🎙️';
        setStatus('Motor listo y optimizado ✓', 'ready');
    } catch (err) {
        setStatus('Error crítico de motor', 'error');
        btnText.textContent = "Error al cargar";
        btnIcon.textContent = '❌';
        console.error("Fallo en Sherpa-ONNX:", err);
    }
}

voiceSelect.onchange = initTTS;

// ── Síntesis de Audio ──────────────────────────────────────────────────────
btn.onclick = async () => {
    const text = textInput.value.trim();
    if (!text || !tts) return;

    btn.disabled = true;
    btnText.textContent = 'Sintetizando...';
    setStatus('Procesando audio...', 'loading');
    
    // Mostrar barra e iniciar cronómetro
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressPercent = document.getElementById('progressPercent');
    const statusMsg = document.getElementById('statusMsg');
    
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressPercent.textContent = '0%';
    progressBar.classList.add('pulse');
    
    const startTime = performance.now();
    let timerInterval = setInterval(() => {
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
        statusMsg.textContent = `Procesando audio... (${elapsed}s)`;
        // Como no tenemos el progreso real de la función interna,
        // mostramos el tiempo transcurrido en la barrita para que se mueva.
        progressPercent.textContent = elapsed + 's';
    }, 100);

    // Pequeño respiro para que el navegador pinte el estado inicial
    await new Promise(r => setTimeout(r, 100));

    try {
        const audio = tts.generate({ 
            text: text, 
            sid: 0,
            speed: 1.0
        });
        
        clearInterval(timerInterval);
        const endTime = performance.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);

        progressBar.style.width = '100%';
        progressPercent.textContent = '100%';

        const wavBlob = exportWav(audio.samples, audio.sampleRate);
        const url = URL.createObjectURL(wavBlob);
        
        player.src = url;
        player.style.display = 'block';
        player.play();

        btnDl.style.display = 'flex';
        btnDl.onclick = () => {
            const a = document.createElement('a');
            a.href = url;
            a.download = `voz_${voiceSelect.value}_${Date.now()}.wav`;
            a.click();
        };

        setTimeout(() => {
            progressBar.classList.remove('pulse');
            progressContainer.style.display = 'none';
        }, 500);

        setStatus(`Generado en ${duration}s ✓`, 'ready');
    } catch (e) {
        clearInterval(timerInterval);
        progressBar.classList.remove('pulse');
        progressContainer.style.display = 'none';
        console.error(e);
        setStatus('Error en la síntesis', 'error');
    } finally {
        btn.disabled = false;
        btnText.textContent = 'Sintetizar y Escuchar';
    }
};



// ── Exportar WAV ───────────────────────────────────────────────────────────
function exportWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeString = (off, s) => { for (let i=0; i<s.length; i++) view.setUint8(off+i, s.charCodeAt(i)); };
    
    writeString(0, 'RIFF'); 
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE'); 
    writeString(12, 'fmt '); 
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); 
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true); 
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true); 
    view.setUint16(34, 16, true);
    writeString(36, 'data'); 
    view.setUint32(40, samples.length * 2, true);

    for (let i = 0, offset = 44; i < samples.length; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Blob([buffer], { type: 'audio/wav' });
}

// ── Arranque ───────────────────────────────────────────────────────────────
if (typeof Module !== 'undefined') {
    const onReady = () => {
        wasmReady = true;
        console.log('WASM runtime inicializado correctamente.');
        initTTS();
    };

    if (Module.calledRun) {
        onReady();
    } else {
        Module.onRuntimeInitialized = onReady;
    }
}
