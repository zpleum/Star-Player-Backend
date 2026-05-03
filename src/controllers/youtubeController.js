const { create } = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { promisify } = require('util');
const { exec, execFile } = require('child_process');

const execAsync = promisify(exec);

const isWindows = process.platform === 'win32';
const ytDlpBinary = isWindows ? 'yt-dlp.exe' : 'yt-dlp';

// Resolve the binary path correctly
const ytDlpPath = path.join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', ytDlpBinary);

// Ensure executable permissions on Linux/macOS
if (!isWindows && fs.existsSync(ytDlpPath)) {
  try {
    fs.chmodSync(ytDlpPath, 0o755);
  } catch (e) {
    console.warn('Failed to set permissions on yt-dlp binary:', e.message);
  }
}

let cookiesPath = path.join(process.cwd(), 'cookies.txt');

// If cookies are provided via environment variable, write them to a temp file
if (process.env.YOUTUBE_COOKIES) {
  const tempCookiesPath = path.join(os.tmpdir(), `star-player-cookies-${Math.random().toString(36).substring(7)}.txt`);
  let cookieContent = process.env.YOUTUBE_COOKIES.trim();

  // 1. Check if it's Base64
  if (cookieContent && !cookieContent.includes('\t') && !cookieContent.startsWith('[') && !cookieContent.startsWith('{')) {
    try {
      const decoded = Buffer.from(cookieContent, 'base64').toString('utf-8');
      if (decoded.includes('\t') || decoded.includes('# Netscape') || decoded.trim().startsWith('[')) {
        cookieContent = decoded.trim();
        console.log('Detected and decoded Base64 YouTube cookies');
      }
    } catch (e) {}
  }

  // 2. Check if it's JSON and convert to Netscape format
  if (cookieContent.startsWith('[') || cookieContent.startsWith('{')) {
    try {
      const jsonCookies = JSON.parse(cookieContent);
      const cookiesArray = Array.isArray(jsonCookies) ? jsonCookies : [jsonCookies];
      
      let netscapeContent = '# Netscape HTTP Cookie File\n';
      cookiesArray.forEach(c => {
        const domain = c.domain || '';
        // If hostOnly is false, it means it's a domain cookie (TRUE for subdomains)
        const includeSubdomains = (c.hostOnly === false || domain.startsWith('.')) ? 'TRUE' : 'FALSE';
        const path = c.path || '/';
        const secure = (c.secure || c.isSecure) ? 'TRUE' : 'FALSE';
        const expiry = Math.floor(c.expirationDate || c.expiry || 0);
        const name = c.name || '';
        const value = c.value || '';
        
        if (domain && name) {
          // Standard Netscape format with #HttpOnly_ prefix for httpOnly cookies
          const domainPrefix = c.httpOnly ? '#HttpOnly_' : '';
          netscapeContent += `${domainPrefix}${domain}\t${includeSubdomains}\t${path}\t${secure}\t${expiry}\t${name}\t${value}\n`;
        }
      });
      
      cookieContent = netscapeContent;
      console.log('Successfully converted JSON cookies to Netscape format (with HttpOnly support)');
    } catch (e) {
      console.error('Failed to parse JSON cookies:', e.message);
    }
  }

  // 3. Ensure the content starts with the required Netscape header
  if (cookieContent && !cookieContent.trim().startsWith('# Netscape')) {
    cookieContent = `# Netscape HTTP Cookie File\n${cookieContent}`;
  }

  try {
    fs.writeFileSync(tempCookiesPath, cookieContent);
    cookiesPath = tempCookiesPath;
    console.log('Using YouTube cookies from environment variable');
  } catch (e) {
    console.error('Failed to write temporary cookies file:', e);
  }
}

const youtubedl = create(ytDlpPath);

const getInfo = async (req, res) => {
  let { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Clean URL to prevent yt-dlp from trying to parse playlists/radio
  try {
    if (url.includes('youtube.com/watch')) {
      const urlObj = new URL(url);
      const v = urlObj.searchParams.get('v');
      if (v) {
        url = `https://www.youtube.com/watch?v=${v}`;
        console.log(`Cleaned URL to: ${url}`);
      }
    }
  } catch (e) {
    console.warn('Failed to clean URL:', e.message);
  }

  try {
    const args = [
      url,
      '--dump-json',
      '--no-warnings',
      '--no-check-certificates',
      '--no-playlist',
      '--ignore-config',
      '--no-cache-dir',
    ];

    if (fs.existsSync(cookiesPath)) {
      args.push('--cookies', cookiesPath);
    }

    console.log(`Executing raw yt-dlp: ${ytDlpPath} ${args.join(' ')}`);

    execFile(ytDlpPath, args, { timeout: 40000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        console.error('Raw yt-dlp error:', error.message);
        return res.status(500).json({ error: 'Failed to fetch video info', details: stderr });
      }

      try {
        const info = JSON.parse(stdout);
        res.json({
          title: info.title,
          thumbnail: info.thumbnail,
          duration: info.duration,
        });
      } catch (parseError) {
        console.error('Failed to parse yt-dlp output:', parseError.message);
        res.status(500).json({ error: 'Failed to parse video info' });
      }
    });

  } catch (error) {
    console.error('Unexpected getInfo error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const downloadAudio = async (req, res) => {
  try {
    let { url, taskId } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Clean URL
    try {
      if (url.includes('youtube.com/watch')) {
        const urlObj = new URL(url);
        const v = urlObj.searchParams.get('v');
        if (v) {
          url = `https://www.youtube.com/watch?v=${v}`;
          console.log(`Cleaned download URL to: ${url}`);
        }
      }
    } catch (e) {
      console.warn('Failed to clean download URL:', e.message);
    }

    const tempId = Math.random().toString(36).substring(7);
    const tempDir = os.tmpdir();
    const outputPath = path.join(tempDir, `star-player-${tempId}.%(ext)s`);

    const ffmpegDir = path.join(tempDir, 'star-player-ffmpeg');
    if (!fs.existsSync(ffmpegDir)) {
      fs.mkdirSync(ffmpegDir, { recursive: true });
    }
    const ffmpegBinary = isWindows ? 'ffmpeg.exe' : 'ffmpeg';
    const ffprobeBinary = isWindows ? 'ffprobe.exe' : 'ffprobe';

    const destFfmpeg = path.join(ffmpegDir, ffmpegBinary);
    const destFfprobe = path.join(ffmpegDir, ffprobeBinary);
    
    // Use the paths from the static packages
    const ffmpegPath = require('ffmpeg-static');
    const ffprobePath = require('ffprobe-static').path;
    
    if (!fs.existsSync(destFfmpeg) && ffmpegPath) fs.copyFileSync(ffmpegPath, destFfmpeg);
    if (!fs.existsSync(destFfprobe) && ffprobePath) fs.copyFileSync(ffprobePath, destFfprobe);

    // Ensure permissions on Linux/macOS
    if (!isWindows) {
      fs.chmodSync(destFfmpeg, 0o755);
      fs.chmodSync(destFfprobe, 0o755);
    }
    const ytOptions = {
      extractAudio: true,
      audioFormat: 'mp3',
      audioQuality: 0,
      output: outputPath,
      noWarnings: true,
      noCheckCertificates: true,
      noPlaylist: true,
      ignoreConfig: true,
      noCacheDir: true,
      format: 'bestaudio/best', 
      ffmpegLocation: ffmpegDir,
    };

    if (fs.existsSync(cookiesPath)) {
      ytOptions.cookies = cookiesPath;
    }

    if (taskId) {
      const progressPath = path.join(tempDir, `star-player-progress-${taskId}.json`);
      const subprocess = youtubedl.exec(url, ytOptions);
      
      subprocess.stdout?.on('data', (data) => {
        const text = data.toString();
        const match = text.match(/\[download\]\s+([\d\.]+)%/);
        if (match && match[1]) {
          const progress = parseFloat(match[1]);
          fs.writeFileSync(progressPath, JSON.stringify({ progress }));
        }
      });

      await subprocess;
      
      if (fs.existsSync(progressPath)) {
        try { fs.unlinkSync(progressPath); } catch (e) {}
      }
    } else {
      await youtubedl(url, ytOptions);
    }

    const mp3Path = path.join(tempDir, `star-player-${tempId}.mp3`);
    
    if (!fs.existsSync(mp3Path)) {
        throw new Error('Downloaded file not found');
    }

    res.download(mp3Path, 'audio.mp3', (err) => {
      if (err) {
        console.error('Download error during file transfer:', err);
      }
      // Cleanup after download
      try {
        fs.unlinkSync(mp3Path);
      } catch (e) {
        console.error('Failed to cleanup temp file:', e);
      }
    });

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Failed to download audio' });
  }
};

const getProgress = (req, res) => {
  const { taskId } = req.params;
  const tempDir = os.tmpdir();
  const progressPath = path.join(tempDir, `star-player-progress-${taskId}.json`);

  if (fs.existsSync(progressPath)) {
    const data = fs.readFileSync(progressPath, 'utf8');
    res.json(JSON.parse(data));
  } else {
    res.json({ progress: 0 });
  }
};

module.exports = {
  getInfo,
  downloadAudio,
  getProgress,
};
