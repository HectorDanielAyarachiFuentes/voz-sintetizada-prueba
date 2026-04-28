const listVFS = () => {
    try {
        const files = Module.FS.readdir('/');
        console.log('VFS root files:', files);
        files.forEach(f => {
            try {
                const stat = Module.FS.stat('/' + f);
                console.log(`  - ${f} (${stat.size} bytes)`);
                if (Module.FS.isDir(stat.mode)) {
                    console.log(`    [DIR] contents:`, Module.FS.readdir('/' + f));
                }
            } catch(e) {}
        });
    } catch(e) {
        console.error('Error reading VFS:', e);
    }
};
listVFS();
