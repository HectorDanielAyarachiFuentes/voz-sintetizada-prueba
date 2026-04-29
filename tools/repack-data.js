#!/usr/bin/env node
/**
 * repack-data.js
 * 
 * Strips the large .onnx model from the pre-packaged .data file,
 * keeping only espeak-ng-data and tokens.txt.
 * Reduces initial download from ~92MB to ~17MB.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'sherpa-onnx-wasm-main-tts.data');
const JS_FILE = path.join(ROOT, 'sherpa-onnx-wasm-main-tts.js');

// Patterns to EXCLUDE from the new .data file
const EXCLUDE_PATTERNS = [
    /\.onnx$/,       // Exclude .onnx models (75MB)
    /\.gitignore$/,  // Not needed
    /README\.md$/,   // Not needed
];

function shouldInclude(filename) {
    return !EXCLUDE_PATTERNS.some(p => p.test(filename));
}

try {
    // 1. Read the JS file
    console.log('Reading JS glue code...');
    const jsContent = fs.readFileSync(JS_FILE, 'utf-8');

    // 2. Extract the files array from the loadPackage call
    // In the minified JS it looks like: "files":[{...},{...},...],
    const filesMarker = '"files":';
    const filesIdx = jsContent.indexOf(filesMarker);
    if (filesIdx === -1) {
        throw new Error('Could not find "files": in JS glue code');
    }

    const arrayStart = filesIdx + filesMarker.length;
    // Find matching ] for the opening [
    let depth = 0;
    let arrayEnd = -1;
    for (let i = arrayStart; i < jsContent.length; i++) {
        if (jsContent[i] === '[') depth++;
        if (jsContent[i] === ']') {
            depth--;
            if (depth === 0) {
                arrayEnd = i + 1;
                break;
            }
        }
    }

    if (arrayEnd === -1) {
        throw new Error('Could not find end of files array');
    }

    const filesArrayStr = jsContent.substring(arrayStart, arrayEnd);
    const files = JSON.parse(filesArrayStr);
    console.log(`Found ${files.length} files in manifest.`);

    // 3. Read the original .data file
    console.log('Reading original .data file...');
    const dataBuffer = fs.readFileSync(DATA_FILE);
    console.log(`Original .data size: ${(dataBuffer.length / (1024*1024)).toFixed(2)} MB`);

    // 4. Filter files
    const includedFiles = files.filter(f => shouldInclude(f.filename));
    const excludedFiles = files.filter(f => !shouldInclude(f.filename));

    console.log(`\nExcluding ${excludedFiles.length} files:`);
    excludedFiles.forEach(f => {
        const sizeMB = ((f.end - f.start) / (1024*1024)).toFixed(2);
        console.log(`  - ${f.filename} (${sizeMB} MB)`);
    });

    console.log(`\nKeeping ${includedFiles.length} files.`);

    // 5. Build new .data file
    const chunks = [];
    let offset = 0;
    const newFiles = [];

    for (const file of includedFiles) {
        const chunk = dataBuffer.subarray(file.start, file.end);
        chunks.push(Buffer.from(chunk));

        newFiles.push({
            filename: file.filename,
            start: offset,
            end: offset + chunk.length,
            audio: file.audio || 0
        });

        offset += chunk.length;
    }

    const newDataBuffer = Buffer.concat(chunks);
    const savedMB = ((dataBuffer.length - newDataBuffer.length) / (1024*1024)).toFixed(2);
    console.log(`\nNew .data size: ${(newDataBuffer.length / (1024*1024)).toFixed(2)} MB`);
    console.log(`Savings: ${savedMB} MB (${((1 - newDataBuffer.length/dataBuffer.length)*100).toFixed(1)}% smaller)`);

    // 6. Backup originals
    const backupData = DATA_FILE + '.original';
    if (!fs.existsSync(backupData)) {
        console.log(`\nBacking up original .data -> ${path.basename(backupData)}`);
        fs.copyFileSync(DATA_FILE, backupData);
    }

    const backupJs = JS_FILE + '.original';
    if (!fs.existsSync(backupJs)) {
        console.log(`Backing up original .js -> ${path.basename(backupJs)}`);
        fs.copyFileSync(JS_FILE, backupJs);
    }

    // 7. Write new .data file
    fs.writeFileSync(DATA_FILE, newDataBuffer);
    console.log('Wrote new .data file.');

    // 8. Patch the JS file
    const newFilesStr = JSON.stringify(newFiles);
    let newJsContent = jsContent.substring(0, arrayStart) + newFilesStr + jsContent.substring(arrayEnd);

    // Update remote_package_size
    newJsContent = newJsContent.replace(
        /"remote_package_size":\d+/,
        `"remote_package_size":${newDataBuffer.length}`
    );

    fs.writeFileSync(JS_FILE, newJsContent);
    console.log('Patched JS manifest.');

    console.log('\n✅ Listo! El archivo .data se ha reducido de ~92MB a ~17MB.');
    console.log('   El modelo de ingles ahora se cargara bajo demanda como las otras voces.');
    console.log('   Los archivos originales se guardaron con extension .original');

} catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
}
