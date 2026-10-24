const fs = require('fs');
const path = require('path');

const dir = __dirname;
const detailsFiles = ['f-details.html', 'vf-details.html', 'r-details.html', 't-details.html'];

const replacements = [
  { t: /최소한의 대기로<br>빠르고 편(안)?한 프리미엄 투어!/g, r: 'Minimal wait time<br>Fast and comfortable premium tour!' },
  { t: /고래상어 투어를 합리적인 가격으로 경험하고 싶은 분/g, r: 'Those who want to experience the tour at a reasonable price' },
  { t: /기본 구성만으로도 충분히 만족스러운 투어를 원하는 분/g, r: 'Those who are satisfied with just the basic inclusions' },
  { t: /개별적으로 자유롭게 일정 운영을 계획 중인 분/g, r: 'Those who are planning their own flexible schedule' },
  { t: /예약 및 결제/g, r: 'Booking & Payment' },
  { t: /원하는 날짜에 예약 및 결제/g, r: 'Book and pay for your desired date' },
  { t: /미팅장소 집결/g, r: 'Meet at the Meeting Point' },
  { t: /미팅시간 내 디몰 맥도날드/g, r: "At D'Mall McDonald's within the meeting time" },
  { t: /미팅시간 내 메인로드 졸리비/g, r: "At Main Road Jollibee within the meeting time" },
  { t: /고래상어 투어 참여/g, r: 'Join the Whale Shark Tour' },
  { t: /고래상어 투어를 즐겁게 참여!/g, r: 'Enjoy the whale shark tour!' },
  { t: /최소한의 대기로 입장! 즐겁게 참여!/g, r: 'Enter with minimal wait! Enjoy the tour!' },
  { t: /미팅시간 엄수/g, r: 'Strict Meeting Time' },
  { t: /운영시간 내 도착 필수 지각 시 참여 제한/g, r: 'Must arrive within operating hours, latecomers may be restricted' },
  { t: /노쇼 주의/g, r: 'No-show Policy' },
  { t: /미팅시간에 불참할 경우 노쇼로 처리되며, 환불 불가/g, r: 'Failure to attend the meeting time will be considered a no-show, non-refundable' },
  { t: /조인 투어로 진행/g, r: 'Join-in Tour' },
  { t: /조인 투어로 진행이 되므로 개인활동 시간은 없습니다\./g, r: 'Since this is a join-in tour, there is no personal free time.' },
  { t: /현지 교통 상황/g, r: 'Local Traffic Conditions' },
  { t: /현지 교통 상황에 따라 일정 및 시간이 변경될 수 있습니다\./g, r: 'Schedules and times may change depending on local traffic conditions.' },
  { t: /운영시간 내 보라카이 고래상어 공식 Visit Office/g, r: 'Visit the official Boracay Whale Shark office during operating hours' },
  { t: /바우처 확인 후 Ticket Pickup/g, r: 'Pick up ticket after verifying voucher' },
  { t: /고래상어 투어 Enter Site/g, r: 'Enter the Whale Shark tour site' },
  { t: /VIP Fast Track 고래상어 투어/g, r: 'VIP Fast Track Tour' },
  { t: /(?:패스트트랙|Fast Track)<br>\(고래상어 최소한의 대기로 이용\) \(최소한의 대기로 입장! 시간을 절약하세요\)/g, r: 'Fast Track<br>(Minimal wait for Whale Shark) (Enter with minimal wait! Save your time)' },
  { t: /고래상어 종료 후 호텔 드랍 서비스<br>\(투어 후 편안하게 호텔까지 모셔다 드려요\)/g, r: 'Hotel drop-off after Whale Shark tour<br>(We will comfortably take you to your hotel after the tour)' },
  { t: /리바다트 전문 수중촬영가 서비스<br>\(소중한 순간을 전문가가 수중 촬영해 드려요\)/g, r: 'Libertad Professional Underwater Photographer Service<br>(A professional will take underwater photos of your precious moments)' },
  { t: /스노클 마스크 무료대여<br>\(깨끗하고 안전한 스노클 마스크 제공\)/g, r: 'Free Snorkel Mask Rental<br>(Clean and safe snorkel masks provided)' },
  { t: /고래상어 수중 촬영 포함<br>\(OSMO ACTION 5 PRO\) \(소중한 순간을 생생하게! 최신 액션캠으로 추억을 간직하세요\)/g, r: 'Whale Shark Underwater Photography Included<br>(OSMO ACTION 5 PRO) (Capture precious moments vividly! Keep memories with the latest action cam)' },
  { t: /긴 대기시간 없이 최소한의 대기로 투어를 즐기고 싶은 분/g, r: 'Those who want to enjoy the tour with minimal wait time' },
  { t: /시간을 효율적으로 사용하고 싶은 분/g, r: 'Those who want to use their time efficiently' },
  { t: /더 편안하고 프리미엄한 서비스를 원하는 분/g, r: 'Those who want more comfortable and premium services' },
  { t: /가족, 연인, 친구와 특별한 경험을 하고 싶은 분/g, r: 'Those who want a special experience with family, lovers, or friends' },
  { t: /15일 전 취소/g, r: 'Cancellation 15 days in advance' },
  { t: /100% 환불/g, r: '100% Refund' },
  { t: /8일 전 취소/g, r: 'Cancellation 8 days in advance' },
  { t: /80% 환불/g, r: '80% Refund' },
  { t: /4일 전 취소/g, r: 'Cancellation 4 days in advance' },
  { t: /50% 환불/g, r: '50% Refund' },
  { t: /3일 전 취소/g, r: 'Cancellation 3 days in advance' },
  { t: /환불 불가/g, r: 'Non-refundable' }
];

detailsFiles.forEach(file => {
  const filePath = path.join(dir, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    replacements.forEach(({ t, r }) => {
      content = content.replace(t, r);
    });

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Translated ${file}`);
  }
});
