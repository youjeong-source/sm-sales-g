// Vercel Serverless Function - SM본부 매출관리 데이터 동기화
// GET /api/data → 클라우드 저장된 최신 스냅샷 반환
// POST /api/data → 스냅샷 클라우드 저장
// 환경변수 자동 인식:
//   - Vercel KV: KV_REST_API_URL, KV_REST_API_TOKEN
//   - Upstash Redis: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

export default async function handler(req, res) {
  // 환경변수 자동 인식 (KV → Upstash 순)
  const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  const KEY = 'sm_sales_data_v1';

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (!KV_URL || !KV_TOKEN) {
    return res.status(503).json({
      error: 'KV_NOT_CONFIGURED',
      message: 'Vercel 환경변수가 설정되지 않았습니다. Vercel 대시보드 → Storage → Upstash Redis 또는 KV 데이터베이스 생성 후 프로젝트에 연결하세요.'
    });
  }

  try {
    if (req.method === 'GET') {
      const r = await fetch(`${KV_URL}/get/${KEY}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      if (!r.ok) {
        return res.status(500).json({ error: 'KV_GET_FAILED', status: r.status });
      }
      const json = await r.json();
      const data = json.result ? JSON.parse(json.result) : null;
      return res.status(200).json({ data, fetchedAt: Date.now() });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = null; }
      }
      if (!body || !body.data) {
        return res.status(400).json({ error: 'NO_DATA' });
      }
      const payload = JSON.stringify(body.data);
      if (payload.length > 5_000_000) {
        return res.status(413).json({ error: 'PAYLOAD_TOO_LARGE', size: payload.length });
      }
      const r = await fetch(`${KV_URL}/set/${KEY}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${KV_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (!r.ok) {
        const errText = await r.text().catch(()=>'');
        return res.status(500).json({ error: 'KV_SET_FAILED', status: r.status, detail: errText });
      }
      return res.status(200).json({ success: true, savedAt: Date.now() });
    }

    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  } catch (e) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message });
  }
}
