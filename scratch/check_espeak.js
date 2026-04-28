const checkEspeak = () => {
    try {
        const contents = Module.FS.readdir('/espeak-ng-data');
        console.log('VFS espeak-ng-data contents:', contents);
        if (contents.includes('es_dict')) {
            console.log('Spanish dictionary FOUND in VFS!');
        } else {
            console.log('Spanish dictionary MISSING in VFS!');
        }
    } catch(e) {
        console.error('Error reading espeak-ng-data in VFS:', e);
    }
};
checkEspeak();
