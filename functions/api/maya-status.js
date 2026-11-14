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

  if (!body.checkoutId) {
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
