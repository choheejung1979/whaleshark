// Maya 결제 완료 웹훅.
// 손님이 결제 직후 브라우저를 닫아 success 페이지가 못 돌더라도 예약이
// 확정되도록, 서버끼리 주고받는 경로로 한 번 더 확정한다.
//
// 공개 엔드포인트라 POST 본문은 믿지 않는다. 본문에서 결제 ID만 꺼내
// 시크릿 키로 Maya에 직접 조회하고, Maya가 돌려준 예약번호로만 갱신한다.

const FIREBASE_PROJECT = 'boracaysean-6217a';
// 브라우저 번들에 이미 들어 있는 공개 설정값이다 (js/firebase-config.js).
const FIREBASE_API_KEY = 'AIzaSyB5HjvqxyKucPIx2tMQpmlFM0A2h_DtzBk';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: true, skipped: 'bad_json' });
  }

  const checkoutId = body.id || body.checkoutId || '';
  if (!checkoutId || !env.MAYA_SECRET_KEY) {
    return json({ ok: true, skipped: 'no_id' });
  }

  const base = env.MAYA_BASE || 'https://pg.paymaya.com/checkout/v1/checkouts';
  let maya;
  try {
    const res = await fetch(`${base}/${encodeURIComponent(checkoutId)}`, {
      headers: { Authorization: 'Basic ' + btoa(env.MAYA_SECRET_KEY.trim() + ':') }
    });
    maya = await res.json();
    if (!res.ok) return json({ ok: false, error: 'lookup_failed', httpStatus: res.status }, 500);
  } catch (err) {
    return json({ ok: false, error: 'maya_unreachable' }, 500);
  }

  const paid = maya.paymentStatus === 'PAYMENT_SUCCESS' ||
    maya.status === 'PAYMENT_SUCCESS' ||
    maya.status === 'COMPLETED';
  const reservationId = maya.requestReferenceNumber || '';
  if (!paid || !reservationId) {
    return json({ ok: true, skipped: 'not_paid' });
  }

  // status는 건드리지 않는다 — 확정은 관리자가 대기중 목록에서 직접 한다.
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/reservations/${encodeURIComponent(reservationId)}` +
    `?key=${FIREBASE_API_KEY}&updateMask.fieldPaths=paymentStatus`;

  const save = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: { paymentStatus: { stringValue: 'paid' } }
    })
  });

  // success 페이지가 먼저 확정했으면 규칙이 재차 갱신을 막는다 — 이미 끝난 일이다.
  if (save.status === 403) return json({ ok: true, alreadyConfirmed: true });
  if (!save.ok) return json({ ok: false, error: 'save_failed', httpStatus: save.status }, 500);

  return json({ ok: true, confirmed: reservationId });
}
