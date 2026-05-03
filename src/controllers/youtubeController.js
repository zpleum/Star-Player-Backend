const { create } = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { promisify } = require('util');
const { exec } = require('child_process');

const execAsync = promisify(exec);

// Resolve the binary path correctly
const ytDlpPath = path.join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp.exe');
const youtubedl = create(ytDlpPath);

const getInfo = async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const info = await youtubedl(url, {
      dumpJson: true,
      noWarnings: true,
      callHome: false,
      noCheckCertificates: true,
      preferFreeFormats: true,
      youtubeSkipDashManifest: true,
      noPlaylist: true,
    });

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
    const destFfmpeg = path.join(ffmpegDir, 'ffmpeg.exe');
    const destFfprobe = path.join(ffmpegDir, 'ffprobe.exe');
    
    const ffmpegPath = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
    const ffprobePath = path.join(process.cwd(), 'node_modules', 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe');
    
    if (!fs.existsSync(destFfmpeg)) fs.copyFileSync(ffmpegPath, destFfmpeg);
    if (!fs.existsSync(destFfprobe)) fs.copyFileSync(ffprobePath, destFfprobe);

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
