import * as sherpa_onnx from 'https://cdn.jsdelivr.net/npm/sherpa-onnx-wasm@1.9.21/sherpa-onnx.js';

let tts = null;
const btn = document.getElementById('btnSpeak');
const status = document.getElementById('status');
const voiceSelect = document.getElementById('voiceSelect');

// Configuración de rutas según tus carpetas
const voices = {
    daniela: {
        model: "./daniela/es_AR-daniela-high.onnx",
        tokens: "./daniela/es_AR-daniela-high.onnx.json"
    },
    claude: {
        model: "./claude/es_MX-claude-high.onnx",
        tokens: "./claude/es_MX-claude-high.onnx.json"
    }
};

async function initTTS() {
    try {
        btn.disabled = true;
        status.textContent = "Cargando motor de voz...";
        status.className = "status loading";

        const selected = voices[voiceSelect.value];

        const config = {
            vits: {
                model: selected.model,
                tokens: selected.tokens,
                noiseScale: 0.667,
                noiseScaleW: 0.8,
                lengthScale: 1.0, // Puedes bajarlo a 0.95 para que Daniela hable más natural
            },
            sampleRate: 22050,
        };

        // Si ya existe una instancia, la liberamos para no saturar la RAM
        if (tts) {
            tts.free();
        }

        tts = await sherpa_onnx.createOfflineTts(config);

        btn.disabled = false;
        btn.textContent = "Sintetizar y Escuchar";
        status.textContent = "Voz lista (Modo Offline)";
        status.className = "status ready";
    } catch (err) {
        status.textContent = "Error al cargar. Revisa la consola (F12).";
        console.error("Error detallado:", err);
    }
}

// Eventos
voiceSelect.onchange = initTTS;

btn.onclick = () => {
    const text = document.getElementById('textInput').value;
    if (!text || !tts) return;

    // Generamos los samples de audio
    const audio = tts.generate({ text: text, sid: 0 });

    // Reproducción usando el AudioContext del navegador
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 22050 });
    const buffer = audioContext.createBuffer(1, audio.samples.length, 22050);
    buffer.getChannelData(0).set(audio.samples);

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start();
};

// Iniciar carga al abrir la página
initTTS();