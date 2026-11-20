// 광고 성과 추적 (페이스북 픽셀 + 구글 광고 전환).
// 아래 ID가 비어 있으면 아무것도 불러오지 않고 아무것도 보내지 않는다.
// 광고 계정에서 ID를 받으면 여기 세 줄만 채우면 된다.
const META_PIXEL_ID = '';          // 예: '1234567890123456'
const GADS_ID = '';                // 예: 'AW-123456789'
const GADS_PURCHASE_LABEL = '';    // 예: 'AbC-D_efG-h12_34-567'

(function () {
  const on = { meta: !!META_PIXEL_ID, gads: !!GADS_ID };

  if (on.meta) {
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', META_PIXEL_ID);
    fbq('track', 'PageView');
  }

  if (on.gads) {
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GADS_ID);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { dataLayer.push(arguments); };
    gtag('js', new Date());
    gtag('config', GADS_ID);
  }

  // 사이트 코드에서 부르는 함수. ID가 없으면 조용히 아무 일도 안 한다.
  //   wsTrack('view',     { tour: 'F' })
  //   wsTrack('checkout', { tour: 'F', value: 7200 })
  //   wsTrack('purchase', { tour: 'F', value: 7200, id: '예약번호' })
  window.wsTrack = function (event, d) {
    d = d || {};
    const value = Number(d.value) || 0;
    try {
      if (event === 'view') {
        if (on.meta) fbq('track', 'ViewContent', { content_ids: [d.tour], content_type: 'product' });
        if (on.gads) gtag('event', 'view_item', { items: [{ item_id: d.tour }] });
      } else if (event === 'checkout') {
        if (on.meta) fbq('track', 'InitiateCheckout', { content_ids: [d.tour], value, currency: 'PHP' });
        if (on.gads) gtag('event', 'begin_checkout', { value, currency: 'PHP', items: [{ item_id: d.tour }] });
      } else if (event === 'purchase') {
        // 같은 예약이 두 번 잡히지 않게 (새로고침 등)
        const key = 'ws_tracked_' + (d.id || '');
        try { if (d.id && localStorage.getItem(key)) return; } catch (_) {}
        if (on.meta) fbq('track', 'Purchase', { content_ids: [d.tour], value, currency: 'PHP' }, { eventID: d.id });
        if (on.gads && GADS_PURCHASE_LABEL) {
          gtag('event', 'conversion', { send_to: GADS_ID + '/' + GADS_PURCHASE_LABEL, value, currency: 'PHP', transaction_id: d.id || '' });
        }
        try { if (d.id) localStorage.setItem(key, '1'); } catch (_) {}
      }
    } catch (_) {}
  };
  window.wsTrackEnabled = on.meta || on.gads;

  // 투어 상세페이지 = 상품 조회
  const m = location.pathname.match(/(?:^|\/)(f|r|t|vf)-details/);
  if (m) window.wsTrack('view', { tour: m[1].toUpperCase() });
})();

// 레퍼럴 코드 7일 기억 + 유입 경로 기록. 광고 ID와 상관없이 항상 돈다.
// 외부로 보내는 건 없고, 손님 브라우저에만 저장했다가 예약할 때 같이 저장한다.
(function () {
  try {
    const now = Date.now();
    const q = new URLSearchParams(location.search);
    const ref = (q.get('ref') || '').trim().toUpperCase();
    if (ref) localStorage.setItem('ws_ref_keep', JSON.stringify({ code: ref, at: now }));
    if (sessionStorage.getItem('ws_src')) return;   // 이번 방문의 첫 페이지만 기록
    let host = '';
    try { host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''; } catch (_) {}
    if (host === location.hostname.replace(/^www\./, '')) host = 'site';
    const src = {
      from: host || 'direct',
      utm: [q.get('utm_source'), q.get('utm_medium'), q.get('utm_campaign')].filter(Boolean).join('/'),
      ad: q.get('gclid') ? 'google_ads' : q.get('fbclid') ? 'facebook' : '',
      ref: ref,
      landing: location.pathname,
      at: new Date(now).toISOString()
    };
    sessionStorage.setItem('ws_src', JSON.stringify(src));
    const first = JSON.parse(localStorage.getItem('ws_src_first') || 'null');
    if (!first || now - Date.parse(first.at) > 7 * 864e5) localStorage.setItem('ws_src_first', JSON.stringify(src));
  } catch (_) {}
})();
