const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'reservation.html');
let content = fs.readFileSync(filePath, 'utf8');

const replacements = [
  { t: /<title>예약하기 \| BORACAY WHALE SHARK<\/title>/g, r: '<title>Book Now | BORACAY WHALE SHARK</title>' },
  { t: /<a href="index.html">홈<\/a>/g, r: '<a href="index.html">Home</a>' },
  { t: /<a href="index.html#tours">투어 소개<\/a>/g, r: '<a href="index.html#tours">Tours</a>' },
  { t: /<a href="reservation.html">예약하기<\/a>/g, r: '<a href="reservation.html">Book Now</a>' },
  { t: /프라이빗한 보라카이 고래상어 투어를 지금 바로 예약하세요\./g, r: 'Book your private Boracay Whale Shark tour right now.' },
  { t: /올인클루시브/g, r: 'All-inclusive' },
  { t: /투어 희망 날짜 \*/g, r: 'Desired Tour Date *' },
  { t: /예약자 성함 \(영문\) \*/g, r: 'Name (English) *' },
  { t: /전용 단독차량과 수중촬영가가 동행하는 완벽한 프리미엄 투어입니다\./g, r: 'A perfect premium tour with an exclusive private vehicle and underwater photographer.' },
  { t: /가장 인기 있는 올인클루시브 패키지\. 최소한의 대기로 쾌적하게 즐기세요\./g, r: 'The most popular all-inclusive package. Enjoy comfortably with minimal wait time.' },
  { t: /기본에 충실한 고래상어 투어입니다\./g, r: 'A whale shark tour that stays true to the basics.' },
  { t: /보라카이 고래상어 공식 사무실에서 입장 티켓만 간편하게 수령하세요\./g, r: 'Simply pick up your admission ticket at the official Boracay Whale Shark office.' },
  { t: /Y년 m월 d일/g, r: 'F j, Y' },
  { t: /예약 날짜를 선택해주세요/g, r: 'Please select a date' },
  { t: /※ Tickets used are Boracation tickets/g, r: '※ General admission tickets are used' }
];

replacements.forEach(({ t, r }) => {
  content = content.replace(t, r);
});

fs.writeFileSync(filePath, content, 'utf8');
console.log('reservation.html fully translated.');
