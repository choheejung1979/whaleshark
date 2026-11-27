// 예약 페이지 "옵션 추가" — 고래상어 + 말룸파티 원데이.
// 패스트트랙(F)·VIP 패스트트랙(VF)에서만 보인다. VIP는 말룸파티 구간이 조인 진행.
// 가격 계산은 각 페이지의 updateSummary와 js/reservation.js가 window.wsAddonPP()를 더해서 한다.
(function () {
  const PRICE = 3600; // 1인 추가 금액 (PHP)
  const form = document.getElementById('reservation-form');
  const anchor = document.getElementById('price-preview');
  if (!form || !anchor) return;

  const L = (o) => Object.entries(o).map(([k, v]) => `data-${k}="${v.replace(/"/g, '&quot;')}"`).join(' ');
  const TXT = {
    head: { en: 'Add-on Option', ko: '옵션 추가', zh: '附加选项', ja: 'オプション追加', ru: 'Дополнительная опция' },
    title: { en: 'Whale Shark + Malumpati One-Day', ko: '고래상어 + 말룸파티 원데이', zh: '鲸鲨 + Malumpati 一日游', ja: 'ジンベエザメ + マルンパティ1日ツアー', ru: 'Китовые акулы + Малумпати за один день' },
    price: { en: '+3,600 PHP / person', ko: '1인 +3,600 PHP', zh: '每人 +3,600 PHP', ja: '1名 +3,600 PHP', ru: '+3 600 PHP / чел.' },
    desc: {
      en: 'Right after the whale shark tour, go straight to Malumpati Blue Lagoon & Secret Garden — air swing, air walk, kayak, diving, spider web and kawa spa, herbal chicken lunch with unlimited drinks. Transfers, boat & terminal fees and entrance included. Back to Boracay after the program.',
      ko: '고래상어 투어가 끝나면 바로 말룸파티 블루라군 · 시크릿가든으로 이동해요. 에어스윙, 에어워킹, 카약, 다이빙, 스파이더웹, 카와스파, 한방백숙 한상 + 술·음료 무제한. 차량·배값·터미널비·입장료 포함, 일정 후 보라카이 복귀.',
      zh: '鲸鲨行程结束后直接前往 Malumpati 蓝色泻湖与秘密花园：空中秋千、空中漫步、皮划艇、跳水、蜘蛛网、Kawa 温泉，药膳炖鸡午餐及饮品无限畅饮。含交通、船费、码头费及门票，行程结束后返回长滩岛。',
      ja: 'ジンベエザメツアーの後、そのままマルンパティのブルーラグーン＆シークレットガーデンへ。エアスイング、エアウォーク、カヤック、ダイビング、スパイダーウェブ、カワスパ、薬膳参鶏湯ランチ＋ドリンク飲み放題。送迎・船代・ターミナル費・入場料込み、終了後ボラカイへ戻ります。',
      ru: 'Сразу после тура с китовыми акулами — Голубая лагуна Малумпати и Secret Garden: тарзанка, воздушная тропа, каяк, прыжки в воду, паутина, кава-спа, обед из курицы с травами и безлимитные напитки. Трансфер, лодка, сборы терминала и вход включены. Возвращение на Боракай после программы.'
    },
    extra: {
      en: 'Paid on site: tubing 350 PHP (optional, 125 cm+), tip 100 PHP per person. Tubing may be unavailable due to local conditions.',
      ko: '현지 별도: 튜빙 1인 350페소(선택, 키 125cm 이상), 매너팁 1인 100페소. 튜빙은 현지 사정에 따라 불가할 수 있습니다.',
      zh: '现场另付：漂流 350 PHP（自选，身高 125cm 以上），小费每人 100 PHP。漂流可能因当地情况无法进行。',
      ja: '現地払い：チュービング 350ペソ（任意・身長125cm以上）、チップ 1名100ペソ。チュービングは現地の事情により実施できない場合があります。',
      ru: 'Оплачивается на месте: тюбинг 350 PHP (по желанию, рост от 125 см), чаевые 100 PHP с человека. Тюбинг может быть недоступен из-за местных условий.'
    },
    vip: {
      en: 'VIP Fast Track: the Malumpati part is a joined (shared) group tour.',
      ko: 'VIP 패스트트랙: 말룸파티 일정은 조인(합류)으로 진행됩니다.',
      zh: 'VIP 快速通道：Malumpati 部分为拼团行程。',
      ja: 'VIPファストトラック：マルンパティ部分は混載（ジョイン）ツアーです。',
      ru: 'VIP Fast Track: часть в Малумпати проходит в сборной группе.'
    },
    sum: { en: 'Malumpati Add-on', ko: '말룸파티 옵션', zh: 'Malumpati 附加', ja: 'マルンパティ追加', ru: 'Малумпати (опция)' },
    add: { en: 'Add', ko: '추가하기', zh: '添加', ja: '追加する', ru: 'Добавить' },
    added: { en: '✓ Added', ko: '✓ 추가됨', zh: '✓ 已添加', ja: '✓ 追加済み', ru: '✓ Добавлено' }
  };
  const lang = (document.documentElement.lang || 'en').slice(0, 2);
  const t = (k) => TXT[k][lang] || TXT[k].en;

  if (!document.getElementById('ws-addon-css')) {
    const css = document.createElement('style');
    css.id = 'ws-addon-css';
    css.textContent = `
      .ws-addon { border:1.5px solid rgba(37,99,235,.25); border-radius:14px; background:rgba(37,99,235,.04); padding:14px; display:grid; gap:14px; grid-template-areas:"photos" "info" "actions"; }
      .ws-addon.on { border-color:#16a34a; background:rgba(22,163,74,.06); }
      .ws-addon-photos { grid-area:photos; display:grid; grid-template-columns:1fr 1fr; gap:6px; }
      .ws-addon-photos img { width:100%; aspect-ratio:1; object-fit:cover; border-radius:10px; display:block; }
      .ws-addon-info { grid-area:info; line-height:1.55; border-top:1px solid rgba(127,127,127,.25); padding-top:12px; }
      .ws-addon-title { display:block; font-size:1.05rem; font-weight:700; }
      .ws-addon-price { display:block; color:#2563eb; font-weight:800; font-size:1.15rem; margin-top:2px; }
      .ws-addon-desc { display:block; font-size:.86rem; opacity:.85; margin-top:8px; }
      .ws-addon-extra { display:block; font-size:.8rem; opacity:.7; margin-top:6px; }
      .ws-addon-vip { display:none; font-size:.84rem; font-weight:600; color:#b45309; margin-top:6px; }
      .ws-addon-actions { grid-area:actions; display:grid; }
      .ws-addon-actions button { padding:12px; border-radius:10px; font-weight:700; font-size:.95rem; cursor:pointer; border:1.5px solid transparent; }
      .ws-addon-add { background:#2563eb; color:#fff; }
      .ws-addon.on .ws-addon-add { background:#16a34a; }
      @media (min-width: 768px) {
        .ws-addon { grid-template-columns:minmax(0,1fr) minmax(0,1.15fr); grid-template-areas:"photos info" "actions actions"; align-items:start; }
        .ws-addon-info { border-top:0; padding-top:0; }
      }`;
    document.head.appendChild(css);
  }

  const box = document.createElement('div');
  box.className = 'form-group';
  box.id = 'addon-group';
  box.style.display = 'none';
  box.innerHTML = `
    <label ${L(TXT.head)}>${t('head')}</label>
    <div class="ws-addon">
      <div class="ws-addon-photos">
        ${[1, 2, 3, 4].map((n) => `<img src="/assets/malumpati/${n}.webp" alt="Malumpati" loading="lazy" onerror="this.remove()">`).join('')}
      </div>
      <div class="ws-addon-info">
        <span class="ws-addon-title" ${L(TXT.title)}>${t('title')}</span>
        <span class="ws-addon-price" ${L(TXT.price)}>${t('price')}</span>
        <span class="ws-addon-desc" ${L(TXT.desc)}>${t('desc')}</span>
        <span class="ws-addon-extra" ${L(TXT.extra)}>${t('extra')}</span>
        <span class="ws-addon-vip" id="addon-vip-note" ${L(TXT.vip)}>${t('vip')}</span>
      </div>
      <div class="ws-addon-actions">
        <button type="button" class="ws-addon-add" ${L(TXT.add)}>${t('add')}</button>
      </div>
      <input type="checkbox" id="addonMalumpati" name="addonMalumpati" value="1" hidden>
    </div>`;
  anchor.insertAdjacentElement('afterend', box);
  const cb = box.querySelector('#addonMalumpati');
  const vipNote = box.querySelector('#addon-vip-note');
  const card = box.querySelector('.ws-addon');
  const btnAdd = box.querySelector('.ws-addon-add');
  // 페이지마다 배경이 달라(어두운 예약 화면 등) 글자색을 같은 화면의 라벨 색에 맞춘다
  const matchColor = () => {
    const ref = form.querySelector('.form-group > label');
    if (ref) card.style.color = getComputedStyle(ref).color;
  };
  matchColor();
  window.matchMedia && matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', matchColor);
  // 언어 전환(data-* 교체)에도 맞게, 상태에 따라 버튼 문구 속성을 바꿔 둔다
  function paintButtons() {
    const src = cb.checked ? TXT.added : TXT.add;
    Object.entries(src).forEach(([k, v]) => btnAdd.setAttribute('data-' + k, v));
    const cur = (document.documentElement.lang || 'en').slice(0, 2);
    btnAdd.textContent = src[cur] || src.en;
    card.classList.toggle('on', cb.checked);
  }
  // 한 버튼으로 켜고 끈다 (추가됨 상태에서 다시 누르면 빠진다)
  btnAdd.addEventListener('click', () => { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); });

  // 사이드 요약에 옵션 줄
  let sumRow = null;
  const totalRow = document.querySelector('.summary-card .summary-row--total');
  if (totalRow) {
    sumRow = document.createElement('div');
    sumRow.className = 'summary-row';
    sumRow.style.display = 'none';
    sumRow.innerHTML = `<span ${L(TXT.sum)}>${t('sum')}</span><strong id="sum-addon">-</strong>`;
    totalRow.parentNode.insertBefore(sumRow, totalRow);
  }

  const tour = () => ((document.querySelector('input[name="tourType"]:checked') || {}).value || '').trim();
  // 이 달에 투어하는 예약은 말룸파티 옵션을 고를 수 없다 (YYYY-MM)
  const BLOCKED_MONTHS = ['2026-11'];
  const dateVal = () => ((document.getElementById('date') || {}).value || '');
  const monthOk = () => !BLOCKED_MONTHS.includes(dateVal().slice(0, 7));
  const eligible = () => (tour() === 'F' || tour() === 'VF') && monthOk();
  window.wsAddonPP = () => (eligible() && cb.checked ? PRICE : 0);
  window.wsAddonMalumpati = () => window.wsAddonPP() > 0;

  function refresh() {
    if (!eligible() && cb.checked) cb.checked = false;
    paintButtons();
    box.style.display = eligible() ? '' : 'none';
    vipNote.style.display = tour() === 'VF' ? 'block' : 'none';
    const people = Number((document.getElementById('people') || {}).value) || 0;
    if (sumRow) {
      sumRow.style.display = window.wsAddonPP() ? '' : 'none';
      sumRow.querySelector('#sum-addon').textContent = '+' + (PRICE * people).toLocaleString('en-US') + ' PHP';
    }
  }
  // 금액 다시 계산 — 페이지의 updateSummary는 인원 칸 change에 걸려 있다
  function recalc() {
    refresh();
    const p = document.getElementById('people');
    if (p) p.dispatchEvent(new Event('change', { bubbles: true }));
  }
  cb.addEventListener('change', recalc);
  document.querySelectorAll('input[name="tourType"]').forEach((r) => r.addEventListener('change', recalc));
  document.getElementById('people')?.addEventListener('input', refresh);
  document.getElementById('date')?.addEventListener('change', recalc);
  document.getElementById('date')?.addEventListener('input', recalc);
  // 결제 실패 후 되돌아오면 저장된 값이 복원된다 — 복원 뒤 한 번 더 맞춘다
  window.addEventListener('load', () => setTimeout(recalc, 0));
  recalc();
})();
