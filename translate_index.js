const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'index.html');
let content = fs.readFileSync(file, 'utf8');

const replacements = [
  { t: /<title>BORACAY WHALE SHARK \| 고래상어 투어 예약<\/title>/g, r: '<title>BORACAY WHALE SHARK | Tour Booking</title>' },
  { t: /보라카이 현지에서 직접 운영하는 고래상어 투어 예약 사이트입니다. 스노클링부터 다이빙까지 프리미엄 서비스를 경험하세요./g, r: 'Locally operated Whale Shark tour booking site in Boracay. Experience premium services from snorkeling to diving.' },
  { t: /보라카이 고래상어와 함께하는 스노클링 · 다이빙 체험 예약 사이트/g, r: 'Snorkeling and Diving Experience with Boracay Whale Sharks' },
  
  // Navigation (remove data-ko)
  { t: /data-ko="홈">Home/g, r: '>Home' },
  { t: /data-ko="투어 소개">Tours/g, r: '>Tours' },
  { t: /data-ko="예약하기">Book Now/g, r: '>Book Now' },
  { t: /<button id="lang-toggle" [^>]+>.*?<\/button>/g, r: '' }, // Remove lang toggle
  
  // Compare Section
  { t: /<h2>한눈에 비교하기<\/h2>/g, r: '<h2>Compare at a Glance</h2>' },
  { t: /<p>나에게 딱 맞는 고래상어 투어를 선택하세요<\/p>/g, r: '<p>Choose the perfect Whale Shark tour for you</p>' },
  
  { t: /<h3>VIP 패스트트랙<\/h3>/g, r: '<h3>VIP Fast Track</h3>' },
  { t: /<p>전용 단독 차량으로 즐기는 최고급 투어<\/p>/g, r: '<p>The ultimate premium tour with a private vehicle</p>' },
  
  { t: /<h3>패스트트랙<\/h3>/g, r: '<h3>Fast Track</h3>' },
  { t: /<p>최소한의 대기로 빠르고 편안한 올인클루시브<\/p>/g, r: '<p>Fast, comfortable all-inclusive tour with minimal waiting</p>' },
  
  { t: /<h3>레귤러 고래상어투어<\/h3>/g, r: '<h3>Regular Tour</h3>' },
  { t: /<p>기본에 충실한 합리적 조인 투어 선택<\/p>/g, r: '<p>A reasonable join-in tour with all the essentials</p>' },
  
  { t: /<h3>고래상어 티켓만<\/h3>/g, r: '<h3>Ticket Only</h3>' },
  { t: /<p>보라카이 고래상어 공식 사무실에서 간편 수령하는 입장권<\/p>/g, r: '<p>Easy pick-up at the official Boracay Whale Shark office</p>' },
  
  { t: /<span class="price-label">가격<\/span>/g, r: '<span class="price-label">Price</span>' },
  { t: /<span>페소<\/span>/g, r: '<span>PHP</span>' },
  
  // Big Hero Sections
  { t: /VIP 패스트트랙/g, r: 'VIP Fast Track' },
  { t: /패스트트랙/g, r: 'Fast Track' },
  { t: /레귤러 고래상어투어/g, r: 'Regular Tour' },
  { t: /고래상어 티켓만/g, r: 'Ticket Only' },
  
  { t: /전용 단독차량 이동<br>전문 수중촬영가 서비스 포함<br>고래상어 투어 완전체 프리미엄/g, r: 'Private exclusive vehicle<br>Professional underwater photographer included<br>The ultimate premium whale shark experience' },
  { t: /왕복차량, 고래상어 수중 촬영 포함<br>아일랜드 투어 & 점보크랩 혜택<br>가장 인기있는 올인클루시브/g, r: 'Round-trip vehicle, underwater photography included<br>Island tour & Jumbo Crab benefits<br>The most popular all-inclusive package' },
  { t: /안내직원, 오리발 기본 포함/g, r: 'Guide and fins included as standard' },
  { t: /보라카이 고래상어 공식 사무실에서 티켓 수령<br>오전 8시 ~ 오후 6시/g, r: 'Pick up tickets at the official Whale Shark office<br>8:00 AM ~ 6:00 PM' },
  { t: /페소<\/span>/g, r: 'PHP</span>' },
  
  // Footer / Info section
  { t: /<span class="hyper-eyebrow">이용 안내<\/span>/g, r: '<span class="hyper-eyebrow">Information</span>' },
  { t: /<h2>예약 전<br>확인하세요<\/h2>/g, r: '<h2>Things to Know<br>Before Booking</h2>' },
  { t: /예약 확정 후 담당자가 연락드립니다 \(영업일 기준 1일 이내\)\./g, r: 'A representative will contact you within 1 business day after booking.' },
  { t: /기상 상황에 따라 일정이 변경될 수 있습니다\./g, r: 'Schedules may change depending on weather conditions.' },
  { t: /당일 취소는 환불이 어려우니 유의해 주세요\./g, r: 'Same-day cancellations are non-refundable.' },
  { t: />예약하기<\/a>/g, r: '>Book Now</a>' },
  { t: /문의: 010-0000-0000/g, r: 'Contact: +82-10-0000-0000' }
];

replacements.forEach(({ t, r }) => {
  content = content.replace(t, r);
});

// Remove data-ko and data-en attributes globally
content = content.replace(/data-ko="[^"]*"/g, '');
content = content.replace(/data-en="[^"]*"/g, '');

fs.writeFileSync(file, content, 'utf8');
console.log('Translated index.html');
