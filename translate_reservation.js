const fs = require('fs');
const path = require('path');

const dir = __dirname;
let contentHtml = fs.readFileSync(path.join(dir, 'reservation.html'), 'utf8');
let contentSuccess = fs.readFileSync(path.join(dir, 'success.html'), 'utf8');
let contentJs = fs.readFileSync(path.join(dir, 'js', 'reservation.js'), 'utf8');

// 1. reservation.html
const resReplacements = [
  { t: /투어 예약하기/g, r: 'Book Your Tour' },
  { t: /간편하게 예약하고 보라카이의 기적을 만나보세요./g, r: 'Book easily and meet the miracle of Boracay.' },
  { t: /투어 옵션 선택 \*/g, r: 'Select Tour Option *' },
  { t: /패스트트랙/g, r: 'Fast Track' },
  { t: /올인클루시브 \+ 패스트트랙/g, r: 'All-inclusive + Fast Track' },
  { t: /VIP패스트트랙|VIP 패스트트랙/g, r: 'VIP Fast Track' },
  { t: /단독차량 \+ 수중촬영가/g, r: 'Private vehicle + Photographer' },
  { t: /레귤러 고래상어투어/g, r: 'Regular Tour' },
  { t: /기본 포함/g, r: 'Basics included' },
  { t: /고래상어 티켓만/g, r: 'Ticket Only' },
  { t: /티켓만 단독 구매/g, r: 'Purchase ticket only' },
  { t: /예약 날짜 \*/g, r: 'Reservation Date *' },
  { t: /참여 인원 \*/g, r: 'Number of People *' },
  { t: /명/g, r: ' pax' },
  { t: /예약자 성함 \*/g, r: 'Name *' },
  { t: /예약자명을 입력해주세요/g, r: 'Enter your name' },
  { t: /이메일 \*/g, r: 'Email *' },
  { t: /이메일 주소를 남겨주세요/g, r: 'Enter your email address' },
  { t: /결제하기 \(PayMongo\)/g, r: 'Pay with PayMongo' },
  { t: /페소/g, r: 'PHP' }
];

resReplacements.forEach(({ t, r }) => {
  contentHtml = contentHtml.replace(t, r);
});
// Special script replacements in reservation.html
contentHtml = contentHtml.replace(/\[패스트트랙 포함사항\]/g, '[Fast Track Inclusions]');
contentHtml = contentHtml.replace(/입장료, 관람료, 환경세, 왕복 차량비용 전부 포함/g, 'Admission, viewing, environmental fee, round-trip vehicle all included');
contentHtml = contentHtml.replace(/구명조끼, 짐보관, 핀 무료 대여, 생수 제공/g, 'Free rental of life jacket, luggage storage, fins, and bottled water provided');
contentHtml = contentHtml.replace(/패스트트랙 \(고래상어 최소한의 대기로 이용\)/g, 'Fast track (minimal wait for Whale Shark)');
contentHtml = contentHtml.replace(/고래상어 종료 후 호텔 드랍 서비스/g, 'Hotel drop-off after Whale Shark tour');
contentHtml = contentHtml.replace(/고래상어 수중 촬영 포함/g, 'Whale Shark underwater photography included');
contentHtml = contentHtml.replace(/점보크랩 이용시 인당 새우 한마리 무료/g, 'One free shrimp per person when using Jumbo Crab');
contentHtml = contentHtml.replace(/1인 \$30 상당 아일랜드투어 무료 제공/g, 'Free Island Tour worth $30 per person');

contentHtml = contentHtml.replace(/\[VIP 패스트트랙 포함사항\]/g, '[VIP Fast Track Inclusions]');
contentHtml = contentHtml.replace(/입장료, 관람료, 환경세, <b>전용 단독 차량비용<\/b> 전부 포함/g, 'Admission, viewing, environmental fee, <b>Exclusive private vehicle</b> all included');
contentHtml = contentHtml.replace(/구명조끼, 짐보관, 핀, 스노클마스크 무료 대여, 생수 제공/g, 'Free rental of life jacket, luggage storage, fins, snorkel mask, and bottled water');
contentHtml = contentHtml.replace(/<b>리버타드 전문 수중촬영가 서비스<\/b>/g, '<b>Libertad Professional Underwater Photographer Service</b>');

contentHtml = contentHtml.replace(/\[레귤러 고래상어투어 포함사항\]/g, '[Regular Tour Inclusions]');
contentHtml = contentHtml.replace(/안내직원, 오리발 포함/g, 'Guide and fins included');
contentHtml = contentHtml.replace(/※ 티켓은 보라카이션 티켓 이용/g, '※ Tickets used are Boracation tickets');

contentHtml = contentHtml.replace(/\[고래상어 티켓만 안내\]/g, '[Ticket Only Info]');
contentHtml = contentHtml.replace(/입장 티켓만 단독 판매/g, 'Exclusive sale of admission tickets only');
contentHtml = contentHtml.replace(/티켓 수령처: 보라카이 고래상어 공식 사무실/g, 'Ticket pickup: Official Boracay Whale Shark Office');
contentHtml = contentHtml.replace(/수령 가능 시간: 오전 8시 ~ 오후 6시/g, 'Available time: 8:00 AM ~ 6:00 PM');


// 2. success.html
const successReplacements = [
  { t: /결제 및 예약 완료!/g, r: 'Payment & Reservation Confirmed!' },
  { t: /고객님의 결제가 성공적으로 처리되었으며,<br>\s*예약 신청이 안전하게 접수되었습니다\./g, r: 'Your payment has been successfully processed,<br>and your reservation is securely confirmed.' },
  { t: /빠른 시일 내에 이메일 혹은 연락처로 담당자가 확정 바우처를 안내해 드릴 예정입니다\./g, r: 'Our representative will send you the confirmation voucher via email shortly.' },
  { t: /홈으로 돌아가기/g, r: 'Return to Home' }
];

successReplacements.forEach(({ t, r }) => {
  contentSuccess = contentSuccess.replace(t, r);
});

// 3. js/reservation.js
const jsReplacements = [
  { t: /필수 항목을 모두 입력해주세요\./g, r: 'Please fill in all required fields.' },
  { t: /PayMongo 연결 중\.\.\./g, r: 'Connecting to PayMongo...' },
  { t: /\[테스트 모드\] PayMongo 결제창이 호출되었습니다\.\\n\\n'확인'을 누르시면 결제가 성공적으로 완료되었다고 가정하고 데이터베이스에 예약을 확정합니다\./g, r: '[Test Mode] PayMongo checkout session opened.\\n\\nClick OK to simulate a successful payment and confirm the reservation in the database.' },
  { t: /결제가 취소되었습니다\./g, r: 'Payment cancelled.' },
  { t: /결제 승인 중\.\.\./g, r: 'Approving payment...' },
  { t: /예약 신청 중 오류가 발생했습니다\. 잠시 후 다시 시도해주세요\./g, r: 'An error occurred during reservation. Please try again later.' },
  { t: /결제 및 예약 처리 중 오류가 발생했습니다\./g, r: 'An error occurred during payment processing.' },
  { t: /결제하기 \(PayMongo\)/g, r: 'Pay with PayMongo' }
];

jsReplacements.forEach(({ t, r }) => {
  contentJs = contentJs.replace(t, r);
});

fs.writeFileSync(path.join(dir, 'reservation.html'), contentHtml, 'utf8');
fs.writeFileSync(path.join(dir, 'success.html'), contentSuccess, 'utf8');
fs.writeFileSync(path.join(dir, 'js', 'reservation.js'), contentJs, 'utf8');
console.log('Translated reservation and success flows');
