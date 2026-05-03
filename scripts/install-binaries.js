const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const binDir = path.join(__dirname, '..', 'node_modules', 'youtube-dl-exec', 'bin');
const isWindows = process.platform === 'win32';
const filename = isWindows ? 'yt-dlp.exe' : 'yt-dlp';
const targetPath = path.join(binDir, filename);

async function downloadBinary() {
    if (fs.existsSync(targetPath)) {
        console.log('yt-dlp binary already exists, skipping download.');
        return;
    }

    if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
    }

    console.log(`Downloading yt-dlp to ${targetPath}...`);
    
    // Using direct download link which is less likely to hit API rate limits
    const url = isWindows 
        ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
        : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

    try {
        if (isWindows) {
            execSync(`powershell -Command "Invoke-WebRequest -Uri '${url}' -OutFile '${targetPath}'"`);
        } else {
            execSync(`curl -L -o "${targetPath}" "${url}"`);
            fs.chmodSync(targetPath, 0o755);
        }
        console.log('yt-dlp downloaded successfully.');
    } catch (error) {
        console.error('Failed to download yt-dlp:', error.message);
        // Don't exit with error to allow npm install to finish, 
        // we can handle missing binary at runtime if needed.
    }
}

downloadBinary();
