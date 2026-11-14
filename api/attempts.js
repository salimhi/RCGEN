import { getDataLayer } from '../server/data-layer.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const store = getDataLayer();

  try {
    if (req.method === 'GET') {
      const data = await store.listAttempts(req.query || {});
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      const { test_id } = req.body || {};
      if (!test_id) {
        return res.status(400).json({ error: 'test_id is required' });
      }

      const result = await store.createAttempt(req.body || {});
      return res.status(201).json(result);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API /api/attempts error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
