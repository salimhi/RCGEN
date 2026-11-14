import { getDataLayer } from '../server/data-layer.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const store = getDataLayer();

  try {
    if (req.method === 'GET') {
      const { id, slug, category, topic, exam_type } = req.query || {};

      if (id) {
        const test = await store.getTestById(id);
        if (!test) return res.status(404).json({ error: 'Test not found' });
        return res.status(200).json(test);
      }

      if (slug) {
        const test = await store.getTestBySlug(slug);
        if (!test) return res.status(404).json({ error: 'Test not found' });
        return res.status(200).json(test);
      }

      const list = await store.listTests({ category, topic, exam_type });
      return res.status(200).json(list || []);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Missing test id' });

      const authHeader = req.headers.authorization || '';
      const userToken = authHeader.replace(/^Bearer\s+/i, '').trim();

      const result = await store.deleteTest(id, userToken);
      if (!result.ok) {
        return res.status(result.status || 400).json({ error: result.error });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API /api/tests error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
