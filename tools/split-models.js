#!/usr/bin/env node
/**
 * split-models.js
 * Splits large .onnx files into 30MB chunks to bypass GitHub's 100MB file limit
 * and allow hosting directly on GitHub Pages without CORS or Git LFS issues.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CHUNK_SIZE = 30 * 1024 * 1024; // 30 MB

const modelsToSplit = [
    { file: 'claude/es_MX-claude-high.onnx', name: 'claude' },
    { file: 'daniela/es_AR-daniela-high.onnx', name: 'daniela' },
    { file: 'vits-mms-spa/vits-mms-spa.onnx', name: 'mms_spa' },
    { file: 'en_US-libritts_r-medium.onnx', name: 'test_en' }
];

const configUpdates = {};

modelsToSplit.forEach(modelInfo => {
    const filePath = path.join(ROOT, modelInfo.file);
    if (!fs.existsSync(filePath)) {
        // Fallback for mms if original name
        if (modelInfo.name === 'mms_spa') {
            const fallbackPath = path.join(ROOT, 'vits-mms-spa/model.onnx');
            if (fs.existsSync(fallbackPath)) {
                fs.copyFileSync(fallbackPath, filePath);
            } else {
                console.warn(`File not found: ${filePath}`);
                return;
            }
        } else {
            console.warn(`File not found: ${filePath}`);
            return;
        }
    }

    const buffer = fs.readFileSync(filePath);
    const numChunks = Math.ceil(buffer.length / CHUNK_SIZE);
    
    console.log(`Splitting ${path.basename(filePath)} (${(buffer.length/1024/1024).toFixed(2)} MB) into ${numChunks} chunks...`);
    
    const chunkPaths = [];
    for (let i = 0; i < numChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, buffer.length);
        const chunkBuf = buffer.subarray(start, end);
        
        const chunkExt = `.part${i + 1}`;
        const chunkPath = filePath + chunkExt;
        fs.writeFileSync(chunkPath, chunkBuf);
        
        // Relative path for web
        const relativeChunk = modelInfo.file.replace(/\\/g, '/') + chunkExt;
        chunkPaths.push(relativeChunk);
        console.log(`  Created ${path.basename(chunkPath)} (${(chunkBuf.length/1024/1024).toFixed(2)} MB)`);
    }
    
    configUpdates[modelInfo.name] = chunkPaths;
    
    // We can delete the original or rename it to .onnx.bak to avoid pushing it
    fs.renameSync(filePath, filePath + '.bak');
});

console.log('\n--- UPDATE app.js VOICES WITH THESE CHUNKS ---');
console.log(JSON.stringify(configUpdates, null, 2));
