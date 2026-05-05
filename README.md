# Star Player Backend

The powerful Node.js backend for **Star Player**, providing YouTube audio extraction, metadata fetching, and lyrics generation.

## 🚀 Features

- **YouTube Extraction**: Fetch video info and download high-quality MP3s using `yt-dlp`.
- **Lyrics Service**: Integrated lyrics fetching and management.
- **Cover Art**: Automated cover art retrieval for downloaded tracks.
- **Bot Protection Bypass**: Integrated `youtube-po-token-generator` to handle YouTube's latest bot detection mechanisms.
- **FFMPEG Integration**: Automatic audio conversion and processing.

## 🛠 Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Audio Processing**: FFMPEG (via `ffmpeg-static` and `ffprobe-static`)
- **Downloader**: `youtube-dl-exec` (wrapped `yt-dlp`)
- **Logging**: Morgan

## 📋 Prerequisites

- **Node.js**: v18 or higher recommended.
- **FFMPEG**: The backend uses static binaries, but ensure your system allows execution of these binaries.

## 🔧 Installation

1. **Clone and Navigate**:

   ```bash
   cd star-player-backend
   ```

2. **Install Dependencies**:

   ```bash
   npm install
   ```

3. **Configure Environment**:
   Create a `.env` file in the root directory:

   ```env
   PORT=5000
   NODE_ENV=production
   # Add any specific API keys or tokens here
   ```

4. **Start the Server**:
   - Development: `npm run dev`
   - Production: `npm start`

## 📡 API Endpoints

### YouTube

- `GET /api/youtube/info?url=...` - Get video title, thumbnail, and duration.
- `POST /api/youtube/download` - Download and convert a YouTube video to MP3.
- `GET /api/youtube/progress` - Monitor active download progress.

### Lyrics

- `GET /api/lyrics/:id` - Fetch lyrics for a specific track.

### Cover Art

- `GET /api/cover/:id` - Retrieve cover art for a track.

### System

- `GET /api/cron` - Keep-alive endpoint (useful for Render/railway free tiers).

## ☁️ Deployment

This backend is designed to be easily deployed on platforms like **Render**, **Railway**, or **Heroku**. It includes a `postinstall` script to ensure necessary binaries are ready for the environment.

---

_Developed for Project Star Player_
