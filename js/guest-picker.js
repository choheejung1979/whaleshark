// 메인 빠른예약 — "N 게스트" 칸을 누르면 외국인/필리핀인 인원을 −/+ 로 고르는 창
(function () {
  const T = {
    ko: { f: '외국인', p: '필리핀인', done: '완료', sum: n => `${n} 게스트` },
    en: { f: 'Foreigner', p: 'Filipino', done: 'Done', sum: n => `${n} Guest${n === 1 ? '' : 's'}` },
    zh: { f: '外国人', p: '菲律宾人', done: '完成', sum: n => `${n} 位客人` },
    ja: { f: '外国人', p: 'フィリピン人', done: '完了', sum: n => `ゲスト ${n} 名` },
    ru: { f: 'Иностранцы', p: 'Граждане Филиппин', done: 'Готово', sum: n => `Гостей: ${n}` }
  };
  const t = () => T[(document.documentElement.lang || 'en').slice(0, 2)] || T.en;
  const MAX = 20;

  const css = document.createElement('style');
  css.textContent = `
.gp{position:relative}
.gp-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;font-family:inherit;font-size:.88rem;font-weight:600;color:#1C2B3A;border:1px solid #E5E7EB;background:#F8FAFC;border-radius:10px;padding:11px 12px;cursor:pointer;text-align:left}
.gp-trigger:focus,.gp.open .gp-trigger{outline:none;border-color:#1C529E}
.gp-trigger svg{width:18px;height:18px;color:#64748b;flex:none}
.gp-pop{position:absolute;top:calc(100% + 8px);left:0;z-index:50;width:280px;max-width:calc(100vw - 32px);background:#fff;border:1px solid #E5E7EB;border-radius:14px;box-shadow:0 14px 34px rgba(28,43,58,.16);padding:14px 16px}
.gp-pop[hidden]{display:none}
.gp-row{display:flex;align-items:center;justify-content:space-between;padding:9px 0}
.gp-row b{font-size:.9rem;color:#1C2B3A}
.gp-ctl{display:flex;align-items:center;gap:12px}
.gp-ctl button{width:30px;height:30px;border-radius:50%;border:1px solid #CBD5E1;background:#fff;color:#1C2B3A;font-size:1rem;line-height:1;cursor:pointer;padding:0}
.gp-ctl button:disabled{opacity:.35;cursor:default}
.gp-ctl span{min-width:18px;text-align:center;font-weight:700}
.gp-done{display:block;margin:8px 0 0 auto;background:#1C2B3A;color:#fff;border:0;border-radius:10px;padding:9px 22px;font-family:inherit;font-weight:800;font-size:.85rem;cursor:pointer}
@media (max-width:760px){.gp-pop{width:100%}}`;
  document.head.appendChild(css);

  function init(root) {
    const fIn = root.querySelector('#qs-foreign');
    const pIn = root.querySelector('#qs-ph');
    const trig = root.querySelector('.gp-trigger');
    const pop = root.querySelector('.gp-pop');
    const val = el => Math.max(0, parseInt(el.value, 10) || 0);

    function paint() {
      const L = t();
      const f = val(fIn), p = val(pIn);
      trig.querySelector('.gp-sum').textContent = L.sum(f + p);
      pop.innerHTML = [['f', fIn, L.f], ['p', pIn, L.p]].map(([k, el, name]) => {
        const n = val(el);
        return `<div class="gp-row"><b>${name}</b><div class="gp-ctl">
          <button type="button" data-k="${k}" data-d="-1" aria-label="-" ${n <= 0 ? 'disabled' : ''}>−</button>
          <span>${n}</span>
          <button type="button" data-k="${k}" data-d="1" aria-label="+" ${f + p >= MAX ? 'disabled' : ''}>+</button></div></div>`;
      }).join('') + `<button type="button" class="gp-done">${L.done}</button>`;
    }

    const open = v => { pop.hidden = !v; root.classList.toggle('open', v); if (v) paint(); };
    trig.addEventListener('click', () => open(pop.hidden));
    pop.addEventListener('click', e => {
      e.stopPropagation(); // 다시 그리면 눌린 버튼이 사라져 "바깥 클릭"으로 오인된다
      const b = e.target.closest('button');
      if (!b) return;
      if (b.classList.contains('gp-done')) { open(false); return; }
      const el = b.dataset.k === 'f' ? fIn : pIn;
      el.value = Math.max(0, val(el) + Number(b.dataset.d));
      paint();
    });
    document.addEventListener('click', e => { if (!root.contains(e.target)) open(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') open(false); });
    paint();
  }

  const go = () => document.querySelectorAll('[data-gp]').forEach(init);
  // i18n.js가 언어를 정한 뒤에 그린다
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(go, 0));
  else go();
})();
