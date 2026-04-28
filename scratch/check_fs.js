const checkFS = () => {
    try {
        const stat = Module.FS.stat('/tokens.txt');
        console.log('tokens.txt size:', stat.size);
    } catch(e) {
        console.log('tokens.txt error:', e);
    }
};
checkFS();
