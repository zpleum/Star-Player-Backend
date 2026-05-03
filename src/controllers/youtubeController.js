const { create } = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { promisify } = require('util');
const { exec } = require('child_process');

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
  let cookieContent = process.env.YOUTUBE_COOKIES;

  // Check if it's Base64 (doesn't contain tabs which are required in Netscape format)
  if (cookieContent && !cookieContent.includes('\t')) {
    try {
      const decoded = Buffer.from(cookieContent, 'base64').toString('utf-8');
      if (decoded.includes('\t')) {
        cookieContent = decoded;
        console.log('Detected and decoded Base64 YouTube cookies');
      }
    } catch (e) {
      // Not base64 or failed to decode, use original
    }
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
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const infoOptions = {
      dumpJson: true,
      noWarnings: true,
      callHome: false,
      noCheckCertificates: true,
      preferFreeFormats: true,
      youtubeSkipDashManifest: true,
      noPlaylist: true,
    };

    if (fs.existsSync(cookiesPath)) {
      infoOptions.cookies = cookiesPath;
    }

    const info = await youtubedl(url, infoOptions);

    res.json({
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration,
    });
  } catch (error) {
    console.error('youtube-dl info error:', error);
    res.status(500).json({ error: 'Failed to fetch video info' });
  }
};

const downloadAudio = async (req, res) => {
  try {
    const { url, taskId } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
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
      callHome: false,
      noCheckCertificates: true,
      noPlaylist: true,
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
