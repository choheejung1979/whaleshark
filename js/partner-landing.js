// 제휴 리조트 랜딩(habagat·azalea·feliz·sample) — 투어 종류를 골라 예약폼으로 넘긴다.
// 외국인·필리핀인 인원은 예약폼에서 따로 받는다(한 예약에 섞을 수 있음).
// 가격은 reservation.html의 PRICES와 같아야 한다. 펠리즈는 data-discount로 10% 할인.
(function () {
  const me = document.currentScript;
  const FORM = me.dataset.form;                       // 예: 'habagat-form'
  const RATE = Number(me.dataset.discount || 0);      // 예: 0.10
  // 첫 화면만 보고 나갔다가 나중에 메인 사이트에서 예약해도 이 리조트 코드가 붙게 7일간 기억한다
  const CODE = (me.dataset.code || '').toUpperCase();
  if (CODE) {
    try { sessionStorage.setItem('ws_ref', CODE); localStorage.setItem('ws_ref_keep', JSON.stringify({ code: CODE, at: Date.now() })); } catch (_) {}
  }
  const PRICES = {
    PH:      { VF: 5820, F: 3300, R: 2520, T: 1620 },
    FOREIGN: { VF: 5820, F: 3600, R: 2820, T: 1920 }
  };
  const TOURS = {
    VF: {
      name: 'VIP Fast Track', h1: 'VIP Fast Track', tag: 'Private vehicle · Photographer',
      inc: ['Entrance, viewing and environmental fees', 'Private vehicle pickup from your resort',
        'Life vest, fins and snorkel mask', 'Luggage storage and drinking water',
        'Professional underwater photographer', 'Fast Track &mdash; minimal waiting time'],
      info: [['Meeting point', 'Your resort lobby (private pickup)'], ['Pickup time', '07:00 / 08:00 / 09:00 / 10:00 AM'],
        ['Duration', 'About 5&ndash;6 hours<small>*May vary with sea and weather conditions</small>'], ['Group size', 'Minimum 2 guests']]
    },
    F: {
      name: 'Fast Track', h1: 'Fast Track', tag: 'Most popular · All-inclusive',
      inc: ['Entrance, viewing and environmental fees', 'Round-trip land transfer', 'Life vest and fins',
        'Luggage storage and drinking water', 'Underwater photos and video', 'Fast Track &mdash; minimal waiting time'],
      info: [['Meeting point', 'Jollibee Main Road, Boracay'], ['Meeting time', '07:30 AM'],
        ['Duration', 'About 5&ndash;6 hours<small>*May vary with sea and weather conditions</small>']]
    },
    R: {
      name: 'Regular Tour', h1: 'Regular Tour', tag: 'The essentials',
      inc: ['Entrance, viewing and environmental fees', 'Round-trip shared vehicle', 'Local guide',
        'Life vest and fins'],
      info: [['Meeting point', 'Jollibee Main Road, Boracay'], ['Meeting time', '07:30 AM'],
        ['Not included', 'Underwater photos, Fast Track entry']]
    }
  };
  // 타임테이블 — 상세페이지(f/vf/r-details) 일정과 같다
  const JOLLIBEE_TT = [['07:30 AM', 'Meet at Jollibee, Main Road', ''], ['09:00 AM', 'Transfer to Libertad', 'About 1 hour'],
    ['09:30 AM', 'Arrive in Libertad', 'Briefing &amp; safety instructions'], ['10:00 AM', 'Whale shark watching', 'About 30 minutes'],
    ['10:30 AM', 'Quick freshwater rinse', ''], ['11:30 AM', 'Return to Boracay', 'About 1 hour'], ['12:30 PM', 'Drop-off at Jollibee, Main Road', '']];
  const TIMETABLE = {
    VF: { head: 'Pickup at 7, 8, 9 or 10 AM &middot; about 5 hours', rows: [['Start', 'Hotel pickup', 'Private vehicle at your chosen time'],
      ['+1h 30m', 'Transfer to Libertad', 'About 1 hour'], ['+2h', 'Arrive in Libertad', 'Briefing &amp; safety instructions'],
      ['+2h 30m', 'Whale shark watching', 'About 30 minutes'], ['+3h', 'Quick freshwater rinse', ''],
      ['+4h', 'Return to Boracay', 'About 1 hour'], ['+5h', 'Hotel drop-off', 'Private vehicle back to your hotel']] },
    F: { head: '07:30 &ndash; 12:30 &middot; about 5 hours', rows: JOLLIBEE_TT },
    R: { head: '07:30 &ndash; 12:30 &middot; about 5 hours', rows: JOLLIBEE_TT }
  };
  const COMMON = [['Payment', 'Online (Card &middot; GCash &middot; Maya &middot; QR Ph)'],
    ['Confirmation', 'E-voucher emailed right after payment']];
  const ORDER = ['VF', 'F', 'R'];

  const h1em = document.querySelector('.masthead h1 em');
  const priceBlock = document.querySelector('.price-block');
  const incList = document.querySelector('.inc-list');
  const infoList = document.querySelector('.info-list');
  const cta = document.querySelector('.cta-btn');
  if (!priceBlock || !cta) return;

  const css = document.createElement('style');
  css.textContent = `
    .pl-pick { padding: 26px 0 0; }
    .pl-tours { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 6px; }
    @media (max-width: 480px) { .pl-tours { grid-template-columns: 1fr; } .pl-tour { display: grid; grid-template-columns: 1fr auto; align-items: center; column-gap: 10px; } .pl-tour em { grid-row: 1 / span 2; grid-column: 2; margin-top: 0; text-align: right; } }
    .pl-tour { text-align: left; padding: 12px; border: 1.5px solid #e5e7eb; border-radius: 12px; background: #fff; cursor: pointer; font: inherit; color: #111; }
    .pl-tour b { display: block; font-size: .92rem; }
    .pl-tour { position: relative; }
    .pl-tour .pl-best { display: inline-block; margin: 0; position: absolute; top: -9px; right: 10px; background: #f59e0b; color: #fff; font-size: .62rem; font-weight: 800; letter-spacing: .8px; padding: 3px 8px; border-radius: 99px; box-shadow: 0 2px 6px rgba(245,158,11,.35); }
    .pl-tour span { display: block; font-size: .72rem; color: #999; margin-top: 2px; }
    .pl-tour em { display: block; font-style: normal; font-weight: 800; font-size: .9rem; margin-top: 6px; color: var(--pl-accent); }
    .pl-tour em small { display: block; font-weight: 600; font-size: .7rem; color: #999; }
    .pl-tt { margin-bottom: 32px; }
    .pl-tt-head { font-size: .86rem; font-weight: 700; color: #111; margin-bottom: 12px; }
    .pl-tt-row { display: grid; grid-template-columns: 74px 1fr; gap: 12px; position: relative; padding: 0 0 14px; }
    .pl-tt-row::before { content: ''; position: absolute; left: 85px; top: 6px; bottom: -6px; width: 2px; background: #eef0f3; }
    .pl-tt-row:last-child::before { display: none; }
    .pl-tt-row .t { font-size: .8rem; font-weight: 800; color: var(--pl-accent); padding-top: 1px; white-space: nowrap; }
    .pl-tt-row .d { padding-left: 14px; position: relative; font-size: .9rem; font-weight: 600; color: #222; }
    .pl-tt-row .d::before { content: ''; position: absolute; left: -7px; top: 5px; width: 10px; height: 10px; border-radius: 50%; background: #fff; border: 2px solid var(--pl-accent); }
    .pl-tt-row .d small { display: block; font-size: .76rem; color: #999; font-weight: 400; margin-top: 2px; }
    .pl-tt-note { font-size: .74rem; color: #aaa; margin-top: 2px; }
    .price-block .ph { margin-top: 6px; font-size: .86rem; color: #666; font-weight: 600; }
    .pl-tour.on { border-color: var(--pl-accent); box-shadow: 0 0 0 1px var(--pl-accent) inset; background: color-mix(in srgb, var(--pl-accent) 6%, #fff); }
    .pl-label { font-size: .7rem; font-weight: 700; color: #bbb; text-transform: uppercase; letter-spacing: 1.2px; margin: 0 0 10px; }
    .price-block .num s { font-size: 1.2rem; font-weight: 700; color: #bbb; margin-right: 10px; letter-spacing: 0; }`;
  document.head.appendChild(css);
  const accent = getComputedStyle(priceBlock.querySelector('.num') || priceBlock).color;
  document.documentElement.style.setProperty('--pl-accent', accent);

  const fmt = (n) => n.toLocaleString('en-US');
  const sale = (base) => (RATE ? Math.round(base * (1 - RATE)) : base);

  const pick = document.createElement('div');
  pick.className = 'pl-pick';
  pick.innerHTML = `
    <p class="pl-label">Choose your tour</p>
    <div class="pl-tours">${ORDER.map((k) => `<button type="button" class="pl-tour" data-tour="${k}">${k === 'F' ? '<span class="pl-best">BEST</span>' : ''}<b>${TOURS[k].name}</b><span>${TOURS[k].tag}</span><em></em></button>`).join('')}</div>`;
  priceBlock.parentNode.insertBefore(pick, priceBlock);

  const q = new URLSearchParams(location.search);
  let tour = ORDER.includes((q.get('tour') || '').toUpperCase()) ? q.get('tour').toUpperCase() : 'F';
  // 타임테이블 칸 — 'Tour information' 아래
  const tt = document.createElement('div');
  if (infoList) {
    const h = document.createElement('p');
    h.className = 'sh';
    h.textContent = 'Timetable';
    infoList.insertAdjacentElement('afterend', h);
    tt.className = 'pl-tt';
    h.insertAdjacentElement('afterend', tt);
  }
  const ph = document.createElement('div');
  ph.className = 'ph';
  priceBlock.querySelector('.num').insertAdjacentElement('afterend', ph);

  function render() {
    const t = TOURS[tour];
    const base = PRICES.FOREIGN[tour];
    const basePH = PRICES.PH[tour];
    if (h1em) h1em.textContent = t.h1;
    pick.querySelectorAll('.pl-tour').forEach((b) => {
      const k = b.dataset.tour;
      b.classList.toggle('on', k === tour);
      b.querySelector('em').innerHTML = '₱' + fmt(sale(PRICES.FOREIGN[k])) +
        (PRICES.PH[k] !== PRICES.FOREIGN[k] ? `<small>Filipino ₱${fmt(sale(PRICES.PH[k]))}</small>` : '');
    });
    priceBlock.querySelector('.num').innerHTML = (RATE ? `<s>&#8369;${fmt(base)}</s>` : '') + `<sup>&#8369;</sup>${fmt(sale(base))}<sub>/ person</sub>`;
    ph.innerHTML = basePH !== base ? `Filipino guests: &#8369;${fmt(sale(basePH))} / person &middot; mixed groups welcome` : 'Same price for all guests';
    if (incList) incList.innerHTML = t.inc.map((s) => `<li><span class="dot"></span>${s}</li>`).join('');
    if (infoList) infoList.innerHTML = [...t.info, ...COMMON].map(([k, v]) => `<div class="info-row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('');
    const T = TIMETABLE[tour];
    tt.innerHTML = `<div class="pl-tt-head">${T.head}</div>` +
      T.rows.map(([t, d, n]) => `<div class="pl-tt-row"><span class="t">${t}</span><span class="d">${d}${n ? `<small>${n}</small>` : ''}</span></div>`).join('') +
      '<div class="pl-tt-note">Times may vary with sea and weather conditions.</div>';
    cta.href = `${FORM}?tour=${tour}`;
  }
  pick.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !b.dataset.tour) return;
    tour = b.dataset.tour;
    render();
  });
  render();
})();
