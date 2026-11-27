// 오늘 고래상어 안내 팝업 — 어드민이 settings/whalesharkToday 에 등록한 내용을 보여준다.
// 오늘(마닐라) 날짜 공지만 뜨고, 날짜가 지나면 자동으로 안 뜬다.
(function () {
  const URL_DOC = 'https://firestore.googleapis.com/v1/projects/boracaysean-6217a/databases/(default)/documents/settings/whalesharkToday';
  const HIDE_KEY = 'ws_notice_hide';

  const T = {
    ko: { title: '오늘의 고래상어 투어', sighted: n => `🐋 오늘 ${n}마리 출현!`, searching: '🔍 고래상어 탐색중', closed: '⛔ 오늘 투어 운영 중단',
          open: '투어 정상 운영', later: '추후 업데이트 예정', waves: '파도', wind: '바람', vis: '시야', note: '특이사항',
          d1: '고래상어는 야생동물이므로 출현 여부와 개체 수는 변동될 수 있습니다.', d2: '기상 및 해상 상황에 따라 투어 일정이 변경될 수 있습니다.',
          hide: '오늘 하루 보지 않기', close: '닫기', locale: 'ko-KR',
          c: { excellent: '매우 좋음', good: '좋음', normal: '보통', bad: '나쁨', verybad: '매우 나쁨' } },
    en: { title: "Today's Whale Shark Tour", sighted: n => `🐋 ${n} whale shark${n > 1 ? 's' : ''} spotted today!`, searching: '🔍 Searching for whale sharks', closed: '⛔ No tours today',
          open: 'Tours operating normally', later: 'Updates to follow', waves: 'Waves', wind: 'Wind', vis: 'Visibility', note: 'Note',
          d1: 'Whale sharks are wild animals, so sightings and numbers may vary.', d2: 'Tour schedules may change depending on weather and sea conditions.',
          hide: "Don't show today", close: 'Close', locale: 'en-US',
          c: { excellent: 'Excellent', good: 'Good', normal: 'Moderate', bad: 'Poor', verybad: 'Very poor' } },
    zh: { title: '今日鲸鲨出游', sighted: n => `🐋 今日出现 ${n} 条鲸鲨！`, searching: '🔍 正在寻找鲸鲨', closed: '⛔ 今日暂停出游',
          open: '出游正常运营', later: '稍后更新', waves: '海浪', wind: '风', vis: '能见度', note: '备注',
          d1: '鲸鲨是野生动物，出现与否及数量可能有所变化。', d2: '行程可能因天气和海况而调整。',
          hide: '今天不再显示', close: '关闭', locale: 'zh-CN',
          c: { excellent: '非常好', good: '好', normal: '一般', bad: '差', verybad: '很差' } },
    ja: { title: '本日のジンベエザメツアー', sighted: n => `🐋 本日${n}匹出現！`, searching: '🔍 ジンベエザメ探索中', closed: '⛔ 本日ツアー休止',
          open: 'ツアーは通常通り催行', later: '追ってお知らせします', waves: '波', wind: '風', vis: '視界', note: '特記事項',
          d1: 'ジンベエザメは野生動物のため、出現や頭数は変動することがあります。', d2: '天候や海況によりツアー日程が変更になる場合があります。',
          hide: '今日は表示しない', close: '閉じる', locale: 'ja-JP',
          c: { excellent: 'とても良い', good: '良い', normal: '普通', bad: '悪い', verybad: 'とても悪い' } },
    ru: { title: 'Китовые акулы сегодня', sighted: n => `🐋 Сегодня замечено: ${n}!`, searching: '🔍 Идёт поиск китовых акул', closed: '⛔ Сегодня туров нет',
          open: 'Туры проходят в обычном режиме', later: 'Обновим позже', waves: 'Волны', wind: 'Ветер', vis: 'Видимость', note: 'Примечание',
          d1: 'Китовые акулы — дикие животные, их появление и количество могут меняться.', d2: 'Расписание может измениться из-за погоды и состояния моря.',
          hide: 'Не показывать сегодня', close: 'Закрыть', locale: 'ru-RU',
          c: { excellent: 'Отлично', good: 'Хорошо', normal: 'Умеренно', bad: 'Плохо', verybad: 'Очень плохо' } }
  };

  const todayManila = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  const esc = s => String(s || '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const val = f => (f && (f.stringValue ?? f.integerValue ?? f.booleanValue ?? f.doubleValue));

  function lang() {
    const l = (document.documentElement.lang || 'ko').slice(0, 2);
    return T[l] ? l : 'en';
  }

  function css() {
    const s = document.createElement('style');
    s.textContent = `
#wsn-overlay{position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.62);display:flex;align-items:center;justify-content:center;padding:16px;animation:wsnFade .25s ease}
@keyframes wsnFade{from{opacity:0}to{opacity:1}}
@keyframes wsnUp{from{transform:translateY(18px);opacity:0}to{transform:none;opacity:1}}
#wsn-card{width:100%;max-width:380px;max-height:calc(100vh - 32px);overflow:auto;background:#fff;border-radius:22px;box-shadow:0 24px 60px rgba(0,0,0,.35);animation:wsnUp .3s ease;font-family:inherit;color:#0f172a}
#wsn-card .wsn-hero{position:relative;aspect-ratio:736/460;background:#1d4f91 url(/assets/whaleshark-popup.webp) center/cover}
#wsn-card .wsn-hero:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,37,80,.05) 40%,rgba(10,37,80,.78))}
#wsn-card .wsn-date{position:absolute;top:14px;left:14px;z-index:1;background:rgba(255,255,255,.92);color:#0b3b75;font-weight:800;font-size:.8rem;padding:6px 12px;border-radius:99px}
#wsn-card .wsn-cap{position:absolute;left:18px;right:18px;bottom:14px;z-index:1;display:flex;flex-direction:column;gap:4px}
#wsn-card .wsn-ttl{color:#e0f2fe;font-size:.82rem;font-weight:700;letter-spacing:.02em}
#wsn-card .wsn-badge{color:#fff;font-size:1.4rem;font-weight:900;line-height:1.25;text-shadow:0 2px 8px rgba(0,0,0,.35)}
#wsn-card .wsn-body{padding:16px 18px 14px}
#wsn-card .wsn-op{display:inline-flex;align-items:center;gap:6px;font-size:.82rem;font-weight:800;color:#047857;background:#ecfdf5;border-radius:99px;padding:5px 12px}
#wsn-card .wsn-op.off{color:#b91c1c;background:#fef2f2}
#wsn-card .wsn-later{font-size:.8rem;color:#64748b;margin-left:6px}
#wsn-card .wsn-cond{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0 10px}
#wsn-card .wsn-cond div{background:#f0f7ff;border-radius:12px;padding:9px 4px;text-align:center}
#wsn-card .wsn-cond span{display:block;font-size:.7rem;color:#64748b;margin-bottom:3px}
#wsn-card .wsn-cond b{font-size:.84rem;color:#0b3b75}
#wsn-card .wsn-note{font-size:.84rem;background:#fff7ed;color:#9a3412;border-radius:10px;padding:8px 11px;margin-bottom:10px;white-space:pre-line}
#wsn-card .wsn-dis{font-size:.72rem;color:#94a3b8;line-height:1.5;margin:0}
#wsn-card .wsn-foot{display:flex;border-top:1px solid #e2e8f0}
#wsn-card .wsn-foot button{flex:1;background:none;border:0;padding:14px 8px;font-size:.82rem;color:#475569;cursor:pointer;font-family:inherit}
#wsn-card .wsn-foot button+button{border-left:1px solid #e2e8f0;font-weight:700;color:#0f172a}`;
    document.head.appendChild(s);
  }

  function show(d) {
    const t = T[lang()];
    const st = d.status;
    const n = parseInt(d.count, 10) || 0;
    const badge = st === 'sighted' && n > 0 ? t.sighted(n) : st === 'closed' ? t.closed : t.searching;
    const dateTxt = new Date(d.date + 'T12:00:00+08:00').toLocaleDateString(t.locale, { timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
    const cond = ['waves', 'wind', 'vis'].filter(k => d[k]).map(k => `<div><span>${t[k]}</span><b>${esc(t.c[d[k]] || d[k])}</b></div>`).join('');
    const note = lang() === 'ko' && d.note ? `<div class="wsn-note"><b>${t.note}</b> · ${esc(d.note)}</div>` : '';

    css();
    const o = document.createElement('div');
    o.id = 'wsn-overlay';
    o.innerHTML = `<div id="wsn-card" class="notranslate" translate="no" role="dialog" aria-modal="true" aria-label="${esc(t.title)}">
  <div class="wsn-hero"><div class="wsn-date">📅 ${esc(dateTxt)}</div><div class="wsn-cap"><div class="wsn-ttl">${esc(t.title)}</div><div class="wsn-badge">${esc(badge)}</div></div></div>
  <div class="wsn-body">
    <div><span class="wsn-op${st === 'closed' ? ' off' : ''}">${st === 'closed' ? '●' : '●'} ${esc(st === 'closed' ? t.closed.replace('⛔ ', '') : t.open)}</span>${st === 'searching' ? `<span class="wsn-later">${esc(t.later)}</span>` : ''}</div>
    ${cond ? `<div class="wsn-cond">${cond}</div>` : '<div style="height:12px"></div>'}
    ${note}
    <p class="wsn-dis">※ ${esc(t.d1)}<br>※ ${esc(t.d2)}</p>
  </div>
  <div class="wsn-foot"><button type="button" data-a="hide">${esc(t.hide)}</button><button type="button" data-a="close">${esc(t.close)}</button></div>
</div>`;
    const close = () => { o.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    o.addEventListener('click', e => {
      const a = e.target.closest('[data-a]');
      if (e.target === o || (a && a.dataset.a === 'close')) close();
      else if (a && a.dataset.a === 'hide') { try { localStorage.setItem(HIDE_KEY, d.sig); } catch (_) {} close(); }
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(o);
  }

  async function run() {
    try {
      const r = await fetch(URL_DOC, { cache: 'no-store' });
      if (!r.ok) return;
      const f = (await r.json()).fields || {};
      const d = {};
      ['date', 'status', 'count', 'waves', 'wind', 'vis', 'note', 'active'].forEach(k => { d[k] = val(f[k]); });
      if (!d.active || d.date !== todayManila()) return;
      // 상태가 바뀌면(탐색중 → 출현 등) "오늘 하루 보지 않기"를 눌렀어도 다시 뜬다
      d.sig = [d.date, d.status, d.count].join('|');
      let hidden = null;
      try { hidden = localStorage.getItem(HIDE_KEY); } catch (_) {}
      if (hidden === d.sig) return;
      show(d);
    } catch (_) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(run, 400));
  else setTimeout(run, 400);
})();
