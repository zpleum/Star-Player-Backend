function parseLrcToSegments(syncedLyrics) {
  const lines = syncedLyrics.split('\n');
  const segments = [];
  const regex = /\[(\d{2}):(\d{2}\.\d{2,3})\](.*)/;

  for (const line of lines) {
    const match = regex.exec(line);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseFloat(match[2]);
      const text = match[3].trim();
      if (text) {
        const time = minutes * 60 + seconds;
        segments.push({ start: time, end: time + 5, text });
      }
    }
  }

  // Fix end times
  for (let i = 0; i < segments.length - 1; i++) {
    segments[i].end = segments[i + 1].start;
  }
  if (segments.length > 0) {
    segments[segments.length - 1].end = segments[segments.length - 1].start + 15;
  }

  return segments;
}

async function searchLrcLib(query) {
  const url = new URL('https://lrclib.net/api/search');
  url.searchParams.append('q', query);

  try {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'StarPlayer/1.0 (https://github.com/star-player)' },
    });

    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('LrcLib search error:', error);
    return [];
  }
}

function cleanTitle(title) {
  let cleaned = title.replace(/^Radio\s+[\d.]+\s+MHz\s+[^\s]+\s+/i, '');
  if (cleaned === title && title.toLowerCase().startsWith('radio ')) {
    const parts = title.split('◡̈');
    if (parts.length > 1) {
      cleaned = parts.slice(1).join('◡̈').trim();
    }
  }
  return cleaned
    .replace(/\s*[\[(].*?[\])]/g, '')
    .replace(/\s*ft\.?.*/i, '')
    .replace(/\s*feat\.?.*/i, '')
    .replace(/\s*official\s*video.*/i, '')
    .replace(/\s*mv$/i, '')
    .replace(/\s*lyric\s*video.*/i, '')
    .trim();
}

const getLyrics = async (req, res) => {
  try {
    const { title, artist } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const cleanedTitle = cleanTitle(title);
    const cleanedArtist = artist?.toLowerCase() === 'youtube' ? '' : artist;

    const strategies = [
      cleanedArtist ? `${cleanedTitle} ${cleanedArtist}` : cleanedTitle,
      cleanedTitle,
      cleanedArtist ? `${title} ${cleanedArtist}` : title,
      title,
    ].filter(Boolean);

    let results = [];
    for (const query of strategies) {
      results = await searchLrcLib(query);
      if (results.length > 0) break;
    }

    if (results.length === 0) {
      return res.status(404).json({ 
        error: `No lyrics found for "${title}"${artist ? ` by ${artist}` : ''}.` 
      });
    }

    const syncedResult = results.find(r => r.syncedLyrics && !r.instrumental);
    const plainResult = results.find(r => r.plainLyrics && !r.instrumental);
    const target = syncedResult || plainResult || results[0];

    if (target.syncedLyrics) {
      const segments = parseLrcToSegments(target.syncedLyrics);
      if (segments.length > 0) {
        return res.json({ 
          lyrics: segments, 
          source: 'synced',
          artist: target.artistName,
          title: target.trackName 
        });
      }
    }

    if (target.plainLyrics) {
      const lines = target.plainLyrics
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);

      const segments = lines.map((text, i) => ({
        start: i * 5,
        end: (i + 1) * 5,
        text,
      }));

      return res.json({ 
        lyrics: segments, 
        source: 'plain',
        artist: target.artistName,
        title: target.trackName
      });
    }

    res.status(404).json({ error: 'Lyrics found but content is empty.' });
  } catch (error) {
    console.error('Error fetching lyrics:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch lyrics' });
  }
};

module.exports = {
  getLyrics,
};
