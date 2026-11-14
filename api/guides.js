import { getDataLayer } from '../server/data-layer.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const store = getDataLayer();

  try {
    const { category, slug } = req.query || {};
    const data = await store.listGuides(category, slug);
    if (slug && !data) {
      return res.status(404).json({ error: 'Guide not found' });
    }
    return res.status(200).json(data || []);
  } catch (err) {
    console.error('API /api/guides error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
