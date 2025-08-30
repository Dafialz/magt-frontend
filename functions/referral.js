// functions/referral.js  (Node/CJS style)
// Повертаємо { statusCode, headers, body } замість Response

const { getStore } = require('@netlify/blobs');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const isB64 = (a) =>
  typeof a === 'string' &&
  (a.startsWith('EQ') || a.startsWith('UQ')) &&
  /^[A-Za-z0-9_-]{48,68}$/.test(a.trim());

function send(statusCode, data) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...cors },
    body: JSON.stringify(data),
  };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };

    const SITE_ID = process.env.NETLIFY_SITE_ID;
    const TOKEN   = process.env.NETLIFY_AUTH_TOKEN;

    if (!SITE_ID || !TOKEN) {
      return send(500, {
        ok: false,
        error: 'internal',
        detail:
          'Missing NETLIFY_SITE_ID or NETLIFY_AUTH_TOKEN (set them in Environment variables).',
      });
    }

    // ЯВНО створюємо store з siteID + token (саме siteID у camelCase)
    const store = getStore({ name: 'magt-referrals', siteID: SITE_ID, token: TOKEN });

    if (event.httpMethod === 'POST') {
      let wallet = '';
      let ref = '';
      try {
        const body = JSON.parse(event.body || '{}');
        wallet = String(body.wallet || '').trim();
        ref    = String(body.ref || '').trim();
      } catch {}

      if (!isB64(wallet) || !isB64(ref)) {
        return send(400, { ok: false, error: 'bad_params' });
      }

      const existing = await store.get(wallet);
      if (existing) return send(200, { ok: true, referrer: existing, existed: true });

      await store.set(wallet, ref);
      return send(200, { ok: true, referrer: ref, existed: false });
    }

    if (event.httpMethod === 'GET') {
      const wallet = String(event.queryStringParameters?.wallet || '').trim();
      if (!isB64(wallet)) return send(400, { ok: false, error: 'bad_wallet' });

      const referrer = await store.get(wallet);
      return send(200, { ok: true, referrer: referrer || null });
    }

    return send(405, { ok: false, error: 'method_not_allowed' });
  } catch (e) {
    // щоб бачити помилку у логах Netlify
    console.error('referral crash:', e);
    return send(500, { ok: false, error: 'internal', detail: 'uncaught' });
  }
};
