#!/usr/bin/env python3
"""제휴 리조트 예약폼(habagat/azalea/feliz/sample-form.html)을 reservation.html에서 만든다.

메인 예약폼을 고친 뒤 이 스크립트를 다시 돌리면 제휴 폼에도 그대로 반영된다.
제휴 폼에서 다른 점: 머리말(제목·OG·noindex), 상단 로고, 레퍼럴 코드 고정, 펠리즈 10% 할인, 티켓 단독 없음.
실행: python3 scripts/build_partner_forms.py
"""
import re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
LOGO_STYLE = 'background:#fff;border-radius:8px;padding:3px 6px;height:40px;width:auto;'
PARTNERS = {
    'habagat': dict(code='HABAGAT', title='Habagat Kiteboarding', logo='assets/logos/habagat-logo.webp',
                    og='assets/logos/habagat-logo.png', alt='Habagat Kite &amp; Beach Resort', text='HABAGAT x WHALE SHARK'),
    'azalea':  dict(code='AZALEA', title='Azalea Boracay', logo='assets/logos/azalea-logo.webp',
                    og='assets/logos/azalea-logo.png', alt='Azalea Hotels &amp; Residences Boracay', text='AZALEA x WHALE SHARK'),
    'feliz':   dict(code='FELIZ', title='Feliz Hotel Boracay', logo='assets/logos/feliz-logo.webp',
                    og='assets/logos/feliz-logo.webp', alt='Feliz Hotel Boracay', text='FELIZ HOTEL x WHALE SHARK', rate=0.10),
    'sample':  dict(code='SAMPLE', title='Your Resort', logo='assets/mwlogo.png',
                    og='assets/mwlogo.png', alt='Your Resort', text='YOUR RESORT x WHALE SHARK'),
    # 보자무싸 — 예보처럼 레귤러·패스트트랙만 판다. 언어는 메인 폼처럼 폰 언어를 따르고, 없으면 영어.
    'bojamussa': dict(code='BOJAMUSSA', title='보자무싸', logo='assets/logos/bojamussa-logo.webp',
                    og='assets/logos/bojamussa-logo.png', alt='보자무싸', text='BOJAMUSSA x WHALE SHARK',
                    drop=('VF', 'T'), no_addon=True),
}

def sub1(pattern, repl, s, flags=re.S):
    out, n = re.subn(pattern, lambda m: repl, s, count=1, flags=flags)
    assert n == 1, f'pattern not found: {pattern[:60]}'
    return out

src = (ROOT / 'reservation.html').read_text()
for slug, p in PARTNERS.items():
    s = src
    ko = p.get('lang') == 'ko'
    if not ko:
        s = sub1(r'<html lang="ko">', '<html lang="en">', s)
    if p.get('first_lang'):
        # 언어를 고른 적 없는 손님은 브라우저 언어와 상관없이 이 언어로 연다
        s = sub1(r"const savedLang = localStorage\.getItem\(LANG_STORAGE_KEY\);",
                 f"const savedLang = localStorage.getItem(LANG_STORAGE_KEY) || '{p['first_lang']}';", s)
    # 아젤리아 옛 QR 리다이렉트는 메인 전용
    s = sub1(r'<script>\s*// 예전에 뿌린 아젤리아.*?</script>\n', '', s)
    head = f'''<title>{p['title']} x Boracay Whale Shark – Booking</title>
<meta name="description" content="Book a whale shark tour in Libertad, Antique. Instant confirmation and an e-voucher by email.">
<meta name="robots" content="noindex, nofollow">
<meta property="og:type" content="website">
<meta property="og:locale" content="{'ko_KR' if ko else 'en_US'}">
<meta property="og:title" content="{p['title']} x {'보라카이 고래상어' if ko else 'Boracay Whale Shark'}">
<meta property="og:description" content="{'리베르타드 고래상어 투어. 온라인 예약 즉시 확정.' if ko else 'Whale shark tours in Libertad, Antique. Book online, confirmed instantly.'}">
<meta property="og:image" content="https://boracaywhaleshark.com/{p['og']}">
<meta property="og:url" content="https://boracaywhaleshark.com/{slug}-form">
<meta property="og:site_name" content="Boracay Whale Shark">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://boracaywhaleshark.com/{p['og']}">
<link rel="canonical" href="https://boracaywhaleshark.com/{slug}-form">'''
    s = sub1(r'<title>.*?<link rel="canonical"[^>]*>', head, s)
    s = sub1(r'<a href="\./" class="logo">.*?</a>',
             f'<a href="{slug}" class="logo"><img src="{p["logo"]}" alt="{p["alt"]}" class="logo-img" style="{LOGO_STYLE}"><span class="logo-text">{p["text"]}</span></a>', s)
    lock = f'''if (requestedRef) document.getElementById('referralCode').value = requestedRef;
    // {p['title']} 전용 — 레퍼럴 코드 고정(칸 숨김). 7일 동안 메인 사이트에서도 이 코드가 붙는다.
    document.getElementById('referralCode').value = '{p['code']}';
    try {{ sessionStorage.setItem('ws_ref', '{p['code']}'); localStorage.setItem('ws_ref_keep', JSON.stringify({{ code: '{p['code']}', at: Date.now() }})); }} catch (_) {{}}
    const refGroup = document.getElementById('referralCode').closest('.form-group');
    if (refGroup) refGroup.style.display = 'none';'''
    s = sub1(r"if \(requestedRef\) document\.getElementById\('referralCode'\)\.value = requestedRef;", lock, s)
    if p.get('rate'):
        # 화면 금액(updateSummary)과 결제 금액(js/reservation.js)이 모두 이 함수를 거친다
        rate = p['rate']
        felix = f'''const upper = (code || '').trim().toUpperCase();
      if (upper === '{p['code']}') {{
        // {p['title']} 손님 {int(rate*100)}% 할인 — 국적별 정가 기준, 말룸파티 옵션은 제외
        const n = nat || (document.getElementById('nationality') || {{}}).value;
        const base = ((PRICES[n] || PRICES.FOREIGN)[tourType]) || 0;
        return base ? base - Math.round(base * {1 - rate:.2f}) : 0;
      }}'''
        s = sub1(r"const upper = \(code \|\| ''\)\.trim\(\)\.toUpperCase\(\);", felix, s)
    # 리조트 페이지는 티켓 단독을 팔지 않는다 (VIP·패스트트랙·레귤러만). 보자무싸는 VIP도 뺀다.
    for t in p.get('drop', ('T',)):
        s = sub1(r'\n\s*<label class="tour-option">\s*<input type="radio" name="tourType" value="' + t + r'".*?</label>', '', s)
    if p.get('no_addon'):
        # 말룸파티 옵션을 팔지 않는 제휴사 — 옵션 스크립트를 빼면 옵션 칸도 금액도 안 붙는다
        s = sub1(r'<script src="/js/addon\.js\?v=\d+"></script>\n', '', s)
    (ROOT / f'{slug}-form.html').write_text(s)
    print('built', f'{slug}-form.html')
