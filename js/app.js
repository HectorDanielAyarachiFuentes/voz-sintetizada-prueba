const VOICES = {
    daniela: {
        model: "./daniela/es_AR-daniela-high.onnx",
        config: "./daniela/es_AR-daniela-high.onnx.json"
    },
    claude: {
        model: "./claude/es_MX-claude-high.onnx",
        config: "./claude/es_MX-claude-high.onnx.json"
    },
    test_en: {
        model: "./en_US-libritts_r-medium.onnx",
        tokens: "./tokens.txt",
        isInternal: true
    }
};

let tts = null;
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

// Función para convertir el JSON de Piper al formato tokens.txt de Sherpa-ONNX
function generateTokensFromPiperJson(piperJson) {
    let tokensText = "";
    const idMap = piperJson.phoneme_id_map;
    for (const [char, ids] of Object.entries(idMap)) {
        tokensText += `${char} ${ids[0]}\n`;
    }
    return tokensText;
}

async function initTTS() {
    try {
        btn.disabled = true;
        btnText.textContent = "Preparando voz...";
        setStatus('Cargando archivos del modelo...', 'loading');

        const voiceKey = voiceSelect.value;
        const selected = VOICES[voiceKey];

        let modelPath = '/model.onnx';
        let tokensPath = '/tokens.txt';

        if (selected.isInternal) {
            modelPath = selected.model;
            tokensPath = selected.tokens;
        } else {
            modelPath = '/model_' + voiceKey + '.onnx';
            tokensPath = '/tokens_' + voiceKey + '.txt';

            // 1. Cargar el modelo ONNX externo
            const modelResp = await fetch(selected.model);
            const modelBuffer = await modelResp.arrayBuffer();
            
            try { Module.FS_unlink(modelPath); } catch(e) {}
            Module.FS_createDataFile("/", modelPath.substring(1), new Uint8Array(modelBuffer), true, true, true);

            // 2. Cargar el JSON de Piper y generar tokens.txt
            const configResp = await fetch(selected.config);
            const piperConfig = await configResp.json();
            const tokensText = generateTokensFromPiperJson(piperConfig);
            
            try { Module.FS_unlink(tokensPath); } catch(e) {}
            Module.FS_createDataFile("/", tokensPath.substring(1), tokensText, true, true, true);
        }

        setStatus('Configurando motor Sherpa-ONNX...', 'loading');
        
        const config = {
            offlineTtsModelConfig: {
                offlineTtsVitsModelConfig: {
                    model: modelPath,
                    tokens: tokensPath,
                    dataDir: './espeak-ng-data', 
                    noiseScale: 0.667,
                    noiseScaleW: 0.8,
                    lengthScale: parseFloat(document.getElementById('lengthScale').value),
                },
                numThreads: 1,
                debug: 0,
                provider: 'cpu',
            },
            ruleFsts: '',
            maxNumSentences: 1,
        };

        console.log("Iniciando TTS con:", { modelPath, tokensPath, voiceKey });
        
        if (tts) {
            console.log("Reiniciando motor...");
            location.reload();
            return;
        }

        try {
            tts = createOfflineTts(Module, config);
        } catch (innerErr) {
            console.error("Excepción interna en createOfflineTts:", innerErr);
            throw innerErr;
        }

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

btn.onclick = async () => {
    const text = textInput.value.trim();
    if (!text || !tts) return;

    btn.disabled = true;
    btnText.textContent = 'Sintetizando...';
    setStatus('Procesando audio...', 'loading');

    await new Promise(r => setTimeout(r, 50));

    try {
        const startTime = performance.now();
        
        const audio = tts.generate({ 
            text: text, 
            sid: 0,
            speed: 1.0 / parseFloat(document.getElementById('lengthScale').value)
        });
        
        const endTime = performance.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);

        const sampleRate = audio.sampleRate;
        const wavBlob = exportWav(audio.samples, sampleRate);
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

        setStatus(`Generado en ${duration}s ✓`, 'ready');
    } catch (e) {
        console.error(e);
        setStatus('Error en la síntesis', 'error');
    } finally {
        btn.disabled = false;
        btnText.textContent = 'Sintetizar y Escuchar';
    }
};

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

if (typeof Module !== 'undefined') {
    if (Module.calledRun) {
        initTTS();
    } else {
        Module.onRuntimeInitialized = () => initTTS();
    }
}
