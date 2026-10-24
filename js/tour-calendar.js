// 홈 화면 "투어 사진 및 영상 받기".
// 날짜를 고르면 그날의 구글 드라이브 폴더를 바로 연다 — 중간에 썸네일을
// 보여주는 단계는 두지 않는다.
// PC는 펼쳐둔 달력, 모바일은 OS 기본 날짜 선택기를 쓴다(CSS에서 전환).
(function () {
  const root = document.getElementById('tour-calendar');
  const btn = document.getElementById('tour-photos-go');
  if (!root || !btn) return;

  const ENDPOINT = 'https://script.google.com/macros/s/AKfycbzTPR3kwrarZUs7_H8Eta094STF_xmIN7BVyF-6JLhg7KMTQgG4DUbbRBwFVqxa3F0k/exec';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lang = document.documentElement.lang || 'en';
  const locale = { ko: 'ko-KR', en: 'en-US', zh: 'zh-CN', ja: 'ja-JP' }[lang] || lang;

  const T = {
    ko: { pick: '날짜를 선택해 주세요.', loading: '여는 중...', none: '해당 날짜의 사진이 아직 없습니다.', error: '불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', prev: '이전 달', next: '다음 달' },
    en: { pick: 'Please choose a date.', loading: 'Opening...', none: 'No photos for that date yet.', error: 'Could not load. Please try again shortly.', prev: 'Previous month', next: 'Next month' },
    zh: { pick: '请选择日期。', loading: '正在打开...', none: '该日期的内容尚未上传。', error: '无法载入，请稍后再试。', prev: '上个月', next: '下个月' },
    ja: { pick: '日付を選択してください。', loading: '開いています...', none: 'その日付のデータはまだありません。', error: '読み込めませんでした。しばらくしてからお試しください。', prev: '前の月', next: '次の月' }
  }[lang] || {};

  const monthFmt = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' });
  const dowFmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });

  const statusEl = document.getElementById('tour-photos-status');
  const dateInput = document.getElementById('tour-photos-date');

  let view = new Date(today.getFullYear(), today.getMonth(), 1);
  let selected = null;

  function ymd(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function say(msg) {
    if (statusEl) statusEl.textContent = msg || '';
  }

  function weekdayNames() {
    // 2024-01-07은 일요일 — 로케일과 무관하게 일요일 시작으로 7칸을 만든다
    const base = new Date(2024, 0, 7);
    return Array.from({ length: 7 }, (_, i) =>
      dowFmt.format(new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)));
  }

  function render() {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const atCurrentMonth =
      view.getFullYear() === today.getFullYear() && view.getMonth() === today.getMonth();

    let html = '<div class="cal-head">' +
      `<button type="button" class="cal-nav" data-step="-1" aria-label="${T.prev}">‹</button>` +
      `<span class="cal-title">${monthFmt.format(first)}</span>` +
      `<button type="button" class="cal-nav" data-step="1" aria-label="${T.next}"` +
      (atCurrentMonth ? ' disabled' : '') + '>›</button>' +
      '</div><div class="cal-grid">';

    for (const n of weekdayNames()) html += `<span class="cal-dow">${n}</span>`;
    for (let i = 0; i < first.getDay(); i++) html += '<span class="cal-pad"></span>';

    // 달마다 5주·6주로 높이가 달라지면 아래 버튼이 따라 움직이므로 6주로 맞춘다
    const trailing = 42 - first.getDay() - daysInMonth;

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(view.getFullYear(), view.getMonth(), d);
      const key = ymd(date);
      const cls = ['cal-day'];
      if (date.getTime() === today.getTime()) cls.push('is-today');
      if (key === selected) cls.push('is-selected');
      html += `<button type="button" class="${cls.join(' ')}" data-date="${key}"` +
        (date > today ? ' disabled' : '') + `>${d}</button>`;
    }

    for (let i = 0; i < trailing; i++) html += '<span class="cal-pad"></span>';

    root.innerHTML = html + '</div>';
  }

  root.addEventListener('click', (e) => {
    const nav = e.target.closest('.cal-nav');
    if (nav) {
      view = new Date(view.getFullYear(), view.getMonth() + Number(nav.dataset.step), 1);
      render();
      return;
    }
    const day = e.target.closest('.cal-day');
    if (day && !day.disabled) {
      selected = day.dataset.date;
      if (dateInput) dateInput.value = selected;
      say('');
      render();
    }
  });

  if (dateInput) {
    dateInput.max = ymd(today);
    dateInput.addEventListener('change', () => {
      selected = dateInput.value || null;
      say('');
      render();
    });
  }

  btn.addEventListener('click', async () => {
    const date = selected || (dateInput && dateInput.value);
    if (!date) { say(T.pick); return; }

    // 팝업 차단을 피하려면 클릭과 같은 흐름에서 창을 먼저 열어야 한다.
    // 주소는 폴더를 확인한 뒤에 넣는다.
    const win = window.open('', '_blank');

    const btnLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = T.loading;
    say('');

    try {
      const res = await fetch(`${ENDPOINT}?action=listTourPhotos&date=${encodeURIComponent(date)}`);
      const data = await res.json();

      if (!data.ok) throw new Error(data.error || 'failed');
      if (!data.folderId) {
        if (win) win.close();
        say(T.none);
        return;
      }

      const url = `https://drive.google.com/drive/folders/${data.folderId}`;
      if (win) win.location = url; else location.href = url;
    } catch (err) {
      console.error(err);
      if (win) win.close();
      say(T.error);
    } finally {
      btn.disabled = false;
      btn.textContent = btnLabel;
    }
  });

  render();
})();
