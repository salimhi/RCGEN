import { getDataLayer } from '../server/data-layer.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const store = getDataLayer();

  try {
    const data = await store.getLiveArenaData();
    return res.status(200).json(data);
  } catch (err) {
    console.error('API /api/live error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
