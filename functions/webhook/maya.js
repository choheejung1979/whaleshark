// Maya 결제 웹훅 (/webhook/maya).
// 손님이 결제 직후 창을 닫거나 다른 브라우저에서 결제해 success 페이지가 못
// 돌더라도, Maya 서버가 직접 알려줘서 예약을 결제완료로 올리고 바우처를 보낸다.
//
// 공개 엔드포인트라 POST 본문은 믿지 않는다. 본문에서 ID만 꺼내 시크릿 키로
// Maya에 직접 되물어, Maya가 "결제됨"이라고 답한 예약번호만 갱신한다.
//
// 중복 발송 방지: Firestore 규칙이 paymentStatus pending → paid 변경을 딱 한 번만
// 허용한다. success 페이지와 웹훅 중 먼저 paid로 바꾼 쪽만 바우처를 보낸다.

const FIREBASE_PROJECT = 'boracaysean-6217a';
// 브라우저 번들에 이미 들어 있는 공개 설정값이다 (js/firebase-config.js).
const FIREBASE_API_KEY = 'AIzaSyB5HjvqxyKucPIx2tMQpmlFM0A2h_DtzBk';
const VOUCHER_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzTPR3kwrarZUs7_H8Eta094STF_xmIN7BVyF-6JLhg7KMTQgG4DUbbRBwFVqxa3F0k/exec';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

export async function onRequestPost({ request, env }) {
  try {
    return await handle(request, env);
  } catch (err) {
    // 500을 주면 Maya가 다시 보내준다
    return json({ ok: false, error: 'server_error', detail: String((err && err.message) || err) }, 500);
  }
}

async function handle(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: true, skipped: 'bad_json' });
  }
  if (!env.MAYA_SECRET_KEY) return json({ ok: false, error: 'missing_secret_key' }, 500);

  const auth = { Authorization: 'Basic ' + btoa(env.MAYA_SECRET_KEY.trim() + ':') };
  const base = env.MAYA_BASE || 'https://pg.paymaya.com/checkout/v1/checkouts';

  // 1) 체크아웃 웹훅이면 id = checkoutId → 체크아웃을 직접 조회
  let info = null;
  const id = body.checkoutId || body.id || '';
  if (id) {
    const res = await fetch(`${base}/${encodeURIComponent(id)}`, { headers: auth });
    if (res.ok) {
      const c = await res.json();
      // status COMPLETED는 '결제창이 끝났다'는 뜻일 뿐이다. 카드 인증 실패(AUTH_FAILED)도 COMPLETED로 온다.
      const paid = c.paymentStatus === 'PAYMENT_SUCCESS' || c.status === 'PAYMENT_SUCCESS';
      info = { paid, rrn: c.requestReferenceNumber || '', buyer: c.buyer || {}, meta: c.metadata || {}, amount: c.totalAmount, items: c.items || [] };
    }
  }

  // 2) 결제 웹훅이면 id = paymentId → 예약번호로 그 예약의 결제들을 조회
  if (!info && body.requestReferenceNumber) {
    const rrn = String(body.requestReferenceNumber);
    const res = await fetch(`https://pg.paymaya.com/payments/v1/payment-rrns/${encodeURIComponent(rrn)}`, { headers: auth });
    if (res.ok) {
      const list = await res.json();
      const arr = Array.isArray(list) ? list : (list.data || []);
      const ok = arr.find(p => p.status === 'PAYMENT_SUCCESS');
      const p = ok || arr[0] || {};
      info = { paid: !!ok, rrn, buyer: p.buyer || body.buyer || {}, meta: p.metadata || body.metadata || {}, amount: p.amount, items: p.items || body.items || [] };
    }
  }

  if (!info) return json({ ok: true, skipped: 'lookup_failed' });
  const hasMeta = !!(info.meta && info.meta.ws);
  if (!info.rrn) return json({ ok: true, skipped: 'no_rrn', hasMeta });
  if (!info.paid) {
    // 결제 실패·만료·중도 이탈 → 리마인드 메일 대기열에 올린다. 실제 발송은 Apps Script가
    // 1시간 뒤에 그 사이 결제됐는지 Maya에 다시 확인하고 나서 한다.
    const queued = await queueReminder(env, info);
    return json({ ok: true, skipped: 'not_paid', hasMeta, reminder: queued });
  }

  // 3) 결제완료로 갱신 (status는 그대로 — 관리자가 대기중 목록에서 확정)
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/reservations/${encodeURIComponent(info.rrn)}` +
    `?key=${FIREBASE_API_KEY}&updateMask.fieldPaths=paymentStatus&currentDocument.exists=true`;
  const save = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { paymentStatus: { stringValue: 'paid' } } })
  });

  // 이미 success 페이지(또는 어드민)가 처리했다 — 바우처도 그쪽에서 나갔다.
  if (save.status === 403) return json({ ok: true, alreadyConfirmed: true });
  if (save.status === 404) return json({ ok: true, skipped: 'no_reservation' });
  if (!save.ok) return json({ ok: false, error: 'save_failed', httpStatus: save.status }, 500);

  // 4) 우리가 처음 확정했다 → 손님이 바우처를 못 받았으니 여기서 보낸다
  // 이름·이메일 등은 어드민과 똑같이 우리 예약 문서 값을 쓴다. Maya의 buyer 이름은
  // 손님이 결제창에서 바꿔 적은 값(카드 명의자 등)일 수 있어서 예약자와 다를 수 있다.
  let rec = {};
  try {
    const f = ((await save.json()) || {}).fields || {};
    for (const k of Object.keys(f)) {
      const v = f[k];
      rec[k] = v.stringValue ?? v.integerValue ?? v.doubleValue ?? v.booleanValue;
    }
  } catch {}
  const ws = (info.meta && info.meta.ws) || {};
  const buyer = info.buyer || {};
  const email = rec.email || (buyer.contact && buyer.contact.email) || '';
  const tourType = rec.tourType || ws.tourType;
  const date = rec.date || ws.date;
  let voucher = 'skipped_no_details';
  if (email && tourType && date) {
    const name = rec.name || [buyer.firstName, buyer.lastName].filter(x => x && x !== '-').join(' ');
    const payload = {
      secret: env.VOUCHER_SECRET,
      tourType, date, people: rec.people != null ? Number(rec.people) : ws.people,
      pickup: rec.pickup || ws.pickup, meetingTime: rec.meetingTime || ws.meetingTime,
      nationality: rec.nationality || ws.nationality,
      totalPrice: (rec.totalPrice != null ? Number(rec.totalPrice) : 0) || ws.totalPrice || (info.amount && (info.amount.value || info.amount)),
      paymentStatus: 'paid', paymentMethod: 'Maya',
      currency: rec.currency || ws.currency || 'PHP', name, email, lang: ws.lang || 'en',
      malumpati: rec.malumpati === true || ws.malumpati === true
    };
    try {
      const r = await fetch(VOUCHER_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      voucher = r.ok ? 'sent' : 'http_' + r.status;
    } catch (e) {
      voucher = 'error';
    }
  }

  return json({ ok: true, confirmed: info.rrn, voucher });
}

// 체크아웃에 실어 보낸 예약 정보(metadata.ws). 오래된 결제엔 없어서 상품명
// "VF tour - 2026-12-26"에서라도 투어·날짜를 뽑는다.
function bookingDetails(info) {
  const ws = Object.assign({}, (info.meta && info.meta.ws) || {});
  if (!ws.tourType || !ws.date) {
    const m = String((info.items && info.items[0] && info.items[0].name) || '').match(/^(\w+) tour - (\d{4}-\d{2}-\d{2})/);
    if (m) { ws.tourType = ws.tourType || m[1]; ws.date = ws.date || m[2]; }
  }
  return ws;
}

async function queueReminder(env, info) {
  const ws = bookingDetails(info);
  const buyer = info.buyer || {};
  const email = (buyer.contact && buyer.contact.email) || '';
  if (!email || !ws.tourType || !ws.date) return 'no_details';
  try {
    const r = await fetch(VOUCHER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        secret: env.VOUCHER_SECRET, action: 'queueReminder', rrn: info.rrn, email,
        name: [buyer.firstName, buyer.lastName].filter(x => x && x !== '-').join(' '),
        tourType: ws.tourType, date: ws.date, people: ws.people || '',
        lang: ws.lang || 'en', path: ws.path || '/reservation'
      })
    });
    return r.ok ? 'queued' : 'http_' + r.status;
  } catch (e) {
    return 'error';
  }
}
