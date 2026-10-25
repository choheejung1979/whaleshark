(function () {
  // 어드민이 써둔 요약본 한 건만 읽는다 (규칙상 토큰을 정확히 알아야 열림)
  const REPORT_URL = 'https://firestore.googleapis.com/v1/projects/boracaysean-6217a/databases/(default)/documents/partnerReports/';
  const API_KEY = 'AIzaSyB5HjvqxyKucPIx2tMQpmlFM0A2h_DtzBk';
  // /partner?t=토큰 또는 토큰을 박아둔 전용 주소(/partneryebo 등) 둘 다 지원
  const token = new URLSearchParams(location.search).get('t') || document.documentElement.dataset.token || '';
  const app = document.getElementById('app');

  const peso = n => '₱' + Math.round(n || 0).toLocaleString('en-US');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const STATUS = {
    confirmed: '<span class="b b-ok">확정</span>',
    pending:   '<span class="b b-wait">대기</span>',
    cancelled: '<span class="b b-no">취소</span>'
  };

  let data = null;
  let tab = 'month';
  let monthFilter = '';

  if (!token) {
    app.innerHTML = '<div class="msg">유효하지 않은 링크입니다.</div>';
    document.getElementById('updated').textContent = '';
    return;
  }

  async function load() {
    try {
      const res = await fetch(REPORT_URL + encodeURIComponent(token) + '?key=' + API_KEY, { cache: 'no-store' });
      if (res.status === 404 || res.status === 403) {
        app.innerHTML = '<div class="msg">유효하지 않은 링크입니다.</div>';
        document.getElementById('updated').textContent = '';
        return;
      }
      if (!res.ok) throw new Error('http_' + res.status);
      const docJson = await res.json();
      data = JSON.parse(docJson.fields.json.stringValue);
      const upd = docJson.fields.updatedAt && docJson.fields.updatedAt.timestampValue;
      document.getElementById('p-name').textContent = data.partner.name;
      document.getElementById('p-rate').textContent = peso(data.partner.perPerson);
      document.title = data.partner.name + ' 정산 현황 – Boracay Whale Shark';
      document.getElementById('updated').textContent = upd
        ? '업데이트 ' + new Date(upd).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '';
      render();
    } catch (e) {
      app.innerHTML = '<div class="msg">불러오지 못했습니다. 잠시 후 새로고침해 주세요.</div>';
    }
  }

  // 확정 예약만 수수료 대상 — 인원 × 1인당 수수료
  const commissionOf = r => r.status === 'confirmed' ? (Number(r.people) || 0) * data.partner.perPerson : 0;

  function byMonth(rows) {
    const m = {};
    rows.forEach(r => {
      if (!r.date) return;
      const key = r.date.slice(0, 7);  // 투어일 기준
      (m[key] = m[key] || []).push(r);
    });
    return m;
  }

  function render() {
    const rows = data.reservations;
    const confirmed = rows.filter(r => r.status === 'confirmed');
    const thisMonth = new Date().toISOString().slice(0, 7);
    const tm = confirmed.filter(r => (r.date || '').slice(0, 7) === thisMonth);
    const unsettled = confirmed.filter(r => !r.settled);

    let html = '<div class="cards">' +
      card('이번 달 확정 예약', tm.length + '건') +
      card('이번 달 인원', tm.reduce((s, r) => s + (Number(r.people) || 0), 0) + '명') +
      card('이번 달 수수료', peso(tm.reduce((s, r) => s + commissionOf(r), 0)), 'hl') +
      card('미정산 수수료', peso(unsettled.reduce((s, r) => s + commissionOf(r), 0)), unsettled.length ? 'warn' : '') +
      '</div>';

    html += '<div class="tabs">' +
      '<button data-tab="month" class="' + (tab === 'month' ? 'on' : '') + '">월별 정산</button>' +
      '<button data-tab="list" class="' + (tab === 'list' ? 'on' : '') + '">예약 내역</button>' +
      '</div>';

    html += '<div class="panel">' + (tab === 'month' ? monthView(rows) : listView(rows)) + '</div>';
    app.innerHTML = html;

    app.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
    const sel = app.querySelector('#mf');
    if (sel) sel.onchange = () => { monthFilter = sel.value; render(); };
  }

  function card(k, v, cls) {
    return '<div class="card ' + (cls || '') + '"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>';
  }

  function monthView(rows) {
    const m = byMonth(rows);
    const months = Object.keys(m).sort().reverse();
    if (!months.length) return '<div class="empty">아직 예약이 없습니다.</div>';

    let t = '<div class="tbl-wrap"><table><thead><tr>' +
      '<th>투어 월</th><th class="num">확정 건수</th><th class="num">인원</th><th class="num">매출</th><th class="num">수수료</th><th>정산</th>' +
      '</tr></thead><tbody>';
    let tot = { n: 0, p: 0, rev: 0, com: 0 };
    months.forEach(key => {
      const c = m[key].filter(r => r.status === 'confirmed');
      const p = c.reduce((s, r) => s + (Number(r.people) || 0), 0);
      const rev = c.reduce((s, r) => s + (Number(r.totalPrice) || 0), 0);
      const com = c.reduce((s, r) => s + commissionOf(r), 0);
      const allSettled = c.length > 0 && c.every(r => r.settled);
      tot.n += c.length; tot.p += p; tot.rev += rev; tot.com += com;
      t += '<tr><td><b>' + key.replace('-', '년 ') + '월</b></td>' +
        '<td class="num">' + c.length + '</td><td class="num">' + p + '명</td>' +
        '<td class="num">' + peso(rev) + '</td><td class="num"><b>' + peso(com) + '</b></td>' +
        '<td>' + (!c.length ? '-' : allSettled ? '<span class="b b-paid">정산완료</span>' : '<span class="b b-due">미정산</span>') + '</td></tr>';
    });
    t += '<tr class="total"><td>합계</td><td class="num">' + tot.n + '</td><td class="num">' + tot.p + '명</td>' +
      '<td class="num">' + peso(tot.rev) + '</td><td class="num">' + peso(tot.com) + '</td><td></td></tr>';
    return t + '</tbody></table></div>';
  }

  function listView(rows) {
    const months = Object.keys(byMonth(rows)).sort().reverse();
    const shown = monthFilter ? rows.filter(r => (r.date || '').slice(0, 7) === monthFilter) : rows;
    let t = '<div class="filter">투어 월 <select id="mf"><option value="">전체</option>' +
      months.map(k => '<option value="' + k + '"' + (k === monthFilter ? ' selected' : '') + '>' + k + '</option>').join('') +
      '</select> · ' + shown.length + '건</div>';
    if (!shown.length) return t + '<div class="empty">해당 기간 예약이 없습니다.</div>';

    t += '<div class="tbl-wrap"><table><thead><tr>' +
      '<th>투어일</th><th>예약자</th><th class="num">인원</th><th class="num">금액</th><th class="num">수수료</th><th>상태</th><th>정산</th>' +
      '</tr></thead><tbody>';
    shown.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).forEach(r => {
      const com = commissionOf(r);
      t += '<tr><td><b>' + esc(r.date) + '</b></td><td>' + esc(r.name) + '</td>' +
        '<td class="num">' + (Number(r.people) || 0) + '명</td><td class="num">' + peso(r.totalPrice) + '</td>' +
        '<td class="num">' + (com ? peso(com) : '-') + '</td>' +
        '<td>' + (STATUS[r.status] || esc(r.status)) + '</td>' +
        '<td>' + (r.status !== 'confirmed' ? '-' : r.settled ? '<span class="b b-paid">완료</span>' : '<span class="b b-due">미정산</span>') + '</td></tr>';
    });
    return t + '</tbody></table></div>';
  }

  load();
  setInterval(load, 60000);   // 1분마다 갱신
})();
