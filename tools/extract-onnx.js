#!/usr/bin/env node
/**
 * extract-onnx.js
 * Extracts the en_US-libritts_r-medium.onnx from the original .data backup
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BACKUP = path.join(ROOT, 'sherpa-onnx-wasm-main-tts.data.original');
const JS_BACKUP = path.join(ROOT, 'sherpa-onnx-wasm-main-tts.js.original');

// Read the original JS to find file offsets
const jsContent = fs.readFileSync(JS_BACKUP, 'utf-8');
const filesMarker = '"files":';
const filesIdx = jsContent.indexOf(filesMarker);
const arrayStart = filesIdx + filesMarker.length;

let depth = 0, arrayEnd = -1;
for (let i = arrayStart; i < jsContent.length; i++) {
    if (jsContent[i] === '[') depth++;
    if (jsContent[i] === ']') { depth--; if (depth === 0) { arrayEnd = i + 1; break; } }
}

const files = JSON.parse(jsContent.substring(arrayStart, arrayEnd));
const onnxFile = files.find(f => f.filename.endsWith('.onnx'));

if (!onnxFile) {
    console.error('No .onnx file found in manifest!');
    process.exit(1);
}

console.log(`Found: ${onnxFile.filename}`);
console.log(`Offset: ${onnxFile.start} - ${onnxFile.end} (${((onnxFile.end - onnxFile.start)/1024/1024).toFixed(2)} MB)`);

// Read the slice from the backup .data
const fd = fs.openSync(BACKUP, 'r');
const size = onnxFile.end - onnxFile.start;
const buffer = Buffer.alloc(size);
fs.readSync(fd, buffer, 0, size, onnxFile.start);
fs.closeSync(fd);

// Write as standalone file
const outPath = path.join(ROOT, onnxFile.filename.replace(/^\//, ''));
fs.writeFileSync(outPath, buffer);
console.log(`Extracted to: ${outPath}`);
console.log('Done!');
