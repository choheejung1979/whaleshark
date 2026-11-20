const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

export async function onRequestPost({ request, env }) {
  // 실패도 200으로 돌려준다 — Cloudflare Pages가 5xx 본문을 자기 에러 페이지로
  // 갈아치우는 탓에, success 페이지의 r.json()이 결제 확인 전에 터진다.
  try {
    return await handle(request, env);
  } catch (err) {
    return json({ ok: false, error: 'server_error', detail: String((err && err.message) || err) });
  }
}

async function handle(request, env) {
  const MAYA_BASE = env.MAYA_BASE || 'https://pg.paymaya.com/checkout/v1/checkouts';

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400);
  }

  if (!env.VOUCHER_SECRET || body.secret !== env.VOUCHER_SECRET) {
    return json({ ok: false, error: 'invalid_secret' }, 403);
  }
  // 대시보드를 못 볼 때 환경변수 상태만 확인하는 용도. 키 값은 돌려주지 않는다.
  if (body.action === 'diag') {
    const k = env.MAYA_SECRET_KEY || '';
    return json({
      ok: true,
      base: MAYA_BASE,
      baseFromEnv: !!env.MAYA_BASE,
      keyPrefix: k.slice(0, 3),
      keyLength: k.length,
      keyTrimmedLength: k.trim().length
    });
  }

  if (!body.checkoutId && !body.rrn && body.action !== 'webhooks' && body.action !== 'register_webhooks') {
    return json({ ok: false, error: 'missing_checkoutId' }, 400);
  }
  if (!env.MAYA_SECRET_KEY) {
    return json({ ok: false, error: 'missing_secret_key' });
  }

  // 대시보드에 붙여넣은 키에 공백·줄바꿈이 섞여 들어오는 일이 있다
  const key = env.MAYA_SECRET_KEY.trim();
  if (!/^[\x21-\x7e]+$/.test(key)) {
    return json({ ok: false, error: 'bad_secret_key_charset', length: key.length });
  }

  // Maya에 등록된 웹훅 목록 확인용 (읽기 전용)
  if (body.action === 'webhooks') {
    const r = await fetch('https://pg.paymaya.com/checkout/v1/webhooks', {
      headers: { Authorization: 'Basic ' + btoa(key + ':') }
    });
    const t = await r.text();
    let list; try { list = JSON.parse(t); } catch { list = t.slice(0, 300); }
    return json({ ok: r.ok, httpStatus: r.status, webhooks: list });
  }

  // 우리 웹훅 주소를 Maya에 등록한다. 주소·이벤트는 고정값이라 누가 불러도
  // 우리 사이트 말고 다른 곳으로 결제 알림이 새지 않는다. 이미 있으면 건너뛴다.
  if (body.action === 'register_webhooks') {
    const CALLBACK = 'https://boracaywhaleshark.com/webhook/maya';
    const EVENTS = ['CHECKOUT_SUCCESS', 'PAYMENT_SUCCESS', 'PAYMENT_EXPIRED', 'CHECKOUT_FAILURE', 'CHECKOUT_DROPOUT'];
    const h = { Authorization: 'Basic ' + btoa(key + ':'), 'Content-Type': 'application/json' };
    const cur = await fetch('https://pg.paymaya.com/checkout/v1/webhooks', { headers: h });
    let existing = [];
    try { const j = await cur.json(); if (Array.isArray(j)) existing = j; } catch {}
    const results = {};
    for (const name of EVENTS) {
      const have = existing.find(w => w.name === name);
      if (have && have.callbackUrl === CALLBACK) { results[name] = 'exists'; continue; }
      if (have) { results[name] = 'other_url_kept'; continue; }
      const r = await fetch('https://pg.paymaya.com/checkout/v1/webhooks', {
        method: 'POST', headers: h, body: JSON.stringify({ name, callbackUrl: CALLBACK })
      });
      results[name] = r.ok ? 'created' : 'error_' + r.status + ' ' + (await r.text()).slice(0, 120);
    }
    return json({ ok: true, results });
  }

  // checkoutId가 예약에 저장되지 못한 경우를 위해, 예약번호(= requestReferenceNumber)로
  // 그 예약에 걸린 결제들을 조회한다. 하나라도 성공이면 결제된 것으로 본다.
  if (body.rrn) {
    const r = await fetch(`https://pg.paymaya.com/payments/v1/payment-rrns/${encodeURIComponent(body.rrn)}`, {
      headers: { Authorization: 'Basic ' + btoa(key + ':') }
    });
    const t = await r.text();
    let list;
    try { list = JSON.parse(t); } catch { return json({ ok: false, error: 'maya_non_json', httpStatus: r.status }); }
    if (!r.ok) return json({ ok: false, error: list.error || list.message || 'maya_error', code: list.code || '', httpStatus: r.status });
    const arr = Array.isArray(list) ? list : (list.data || []);
    const statuses = arr.map(p => p.status || '');
    const paid = statuses.includes('PAYMENT_SUCCESS');
    return json({ ok: true, rrn: true, paid, statuses, status: paid ? 'PAYMENT_SUCCESS' : (statuses[0] || ''), paymentStatus: paid ? 'PAYMENT_SUCCESS' : '' });
  }

  const res = await fetch(`${MAYA_BASE}/${encodeURIComponent(body.checkoutId)}`, {
    headers: { Authorization: 'Basic ' + btoa(key + ':') }
  });

  const text = await res.text();
  let maya;
  try {
    maya = JSON.parse(text);
  } catch {
    return json({ ok: false, error: 'maya_non_json', httpStatus: res.status });
  }
  if (!res.ok) {
    return json({ ok: false, error: maya.error || maya.message || 'maya_error', code: maya.code || '', httpStatus: res.status });
  }

  return json({
    ok: true,
    status: maya.status || '',
    paymentStatus: maya.paymentStatus || ''
  });
}
