const getCover = async (req, res) => {
  try {
    const { title, artist } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const cleanTitle = title.replace(/\s*[\[(].*?[\])]/g, '').trim();
    const query = artist && artist !== 'Unknown Artist' && artist !== 'YouTube'
      ? `${artist} ${cleanTitle}`
      : cleanTitle;

    const url = new URL('https://itunes.apple.com/search');
    url.searchParams.append('term', query);
    url.searchParams.append('entity', 'song');
    url.searchParams.append('limit', '1');

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error('iTunes API failed');
    }

    const data = await response.json();
    if (data.results && data.results.length > 0) {
      const track = data.results[0];
      const artworkUrl = track.artworkUrl100.replace('100x100bb.jpg', '600x600bb.jpg');
      return res.json({ artworkUrl });
    }

    res.status(404).json({ error: 'No artwork found' });
  } catch (error) {
    console.error('Cover art search failed:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

module.exports = {
  getCover,
};
