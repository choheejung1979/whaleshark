const fs = require('fs');
const path = require('path');

const dir = __dirname;
const detailsFiles = ['f-details.html', 'vf-details.html', 'r-details.html', 't-details.html'];

const commonReplacements = [
  { t: /포함사항 <span>INCLUSIONS<\/span>/g, r: 'Inclusions <span>INCLUSIONS</span>' },
  { t: /이런 분께 추천해요! <span>RECOMMENDATIONS<\/span>/g, r: 'Recommendations <span>RECOMMENDATIONS</span>' },
  { t: /이용 방법 <span>PROCESS<\/span>/g, r: 'Process <span>PROCESS</span>' },
  { t: /안내사항 및 규정 <span>NOTICES<\/span>/g, r: 'Notices & Rules <span>NOTICES</span>' },
  { t: /지금 바로 예약하기/g, r: 'Book Now' },
  { t: /페소/g, r: 'PHP' },

  // Process Steps
  { t: /예약확정/g, r: 'Confirmed' },
  { t: /예약 확정 후 바우처 수신/g, r: 'Receive voucher after confirmation' },
  { t: /사무실 방문/g, r: 'Visit Office' },
  { t: /운영시간 내 보라카이 고래상어 공식 사무실 방문/g, r: 'Visit the official Boracay Whale Shark office during operating hours' },
  { t: /티켓 수령/g, r: 'Ticket Pickup' },
  { t: /바우처 확인 후 티켓 수령/g, r: 'Pick up ticket after verifying voucher' },
  { t: /현장 입장/g, r: 'Enter Site' },
  { t: /고래상어 투어 현장 입장/g, r: 'Enter the Whale Shark tour site' },
  
  // Notices
  { t: /운영시간 엄수/g, r: 'Strict Operating Hours' },
  { t: /오전 8시 ~ 오후 6시 운영시간 내 방문 필수/g, r: 'Must visit during operating hours from 8:00 AM to 6:00 PM' },
  { t: /티켓 분실 주의/g, r: 'Do not lose your ticket' },
  { t: /티켓 분실 시 재발급 및 환불이 불가할 수 있습니다\./g, r: 'Lost tickets may not be reissued or refunded.' },
  { t: /개별 책임/g, r: 'Personal Responsibility' },
  { t: /개별 일정 진행 시 사고에 대한 책임은 개별적으로 부담됩니다\./g, r: 'You are individually responsible for any accidents during your independent schedule.' },
  { t: /현장 규정 준수/g, r: 'Follow Site Rules' },
  { t: /현지 환경 보호 및 안내 규정을 반드시 준수해주세요\./g, r: 'Please follow local environmental protection and safety guidelines.' }
];

const specificReplacements = {
  't-details.html': [
    { t: /티켓만 구매/g, r: 'Ticket Only' },
    { t: /입장권만 구매하고,<br>현장에서 자유롭게 즐기세요!/g, r: 'Purchase your ticket in advance<br>and enjoy freely on-site!' },
    { t: /고래상어 투어 입장권을 직접 구매하여 자유롭게 이용할 수 있습니다\./g, r: 'Purchase your own Whale Shark tour ticket and enjoy it at your own pace.' },
    { t: /현지에서 일정이나 옵션을 자유롭게 선택하고 싶은 분/g, r: 'Those who want to freely choose schedules and options on-site.' },
    { t: /가이드나 차량 없이, 개별적으로 투어를 즐기고 싶은 분/g, r: 'Those who want to enjoy the tour independently without a guide or vehicle.' },
    { t: /원하는 날짜에 예약 및 결제/g, r: 'Book and pay for your preferred date' }
  ],
  'r-details.html': [
    { t: /레귤러 고래상어투어/g, r: 'Regular Tour' },
    { t: /합리적인 가격에<br>꼭 필요한 모든 것!/g, r: 'Everything you need<br>at a reasonable price!' },
    { t: /가장 기본적이고 필수적인 사항들만 쏙쏙 골라 담았습니다\./g, r: 'We selected only the most basic and essential features.' },
    { t: /현지 안내직원 동행/g, r: 'Local guide included' },
    { t: /고급 오리발\(핀\) 대여 포함/g, r: 'Premium fins rental included' },
    { t: /공식 사무실에서 빠르고 안전한 티켓 발권/g, r: 'Fast and safe ticketing at the official office' },
    { t: /군더더기 없이 깔끔한 기본 투어를 원하시는 분/g, r: 'Those who want a clean, basic tour without unnecessary add-ons.' },
    { t: /비용을 절약하면서도 핵심은 놓치고 싶지 않은 분/g, r: 'Those who want to save money but not miss the essentials.' },
    { t: /투어 예약/g, r: 'Tour Booking' },
    { t: /픽업 미팅/g, r: 'Pickup Meeting' },
    { t: /지정된 장소에서 가이드 미팅/g, r: 'Meet your guide at the designated location' },
    { t: /투어 진행/g, r: 'Tour in Progress' },
    { t: /고래상어와 함께하는 스노클링/g, r: 'Snorkeling with whale sharks' },
    { t: /투어 종료/g, r: 'Tour Ends' },
    { t: /개별 복귀 또는 추가 일정 진행/g, r: 'Return independently or continue with your schedule' }
  ],
  'f-details.html': [
    { t: /패스트트랙/g, r: 'Fast Track' },
    { t: /가장 인기있는 선택,<br>편안하게 모십니다\./g, r: 'The most popular choice,<br>we serve you comfortably.' },
    { t: /대기 시간을 최소화하고 완벽한 올인클루시브 혜택을 누리세요\./g, r: 'Minimize waiting time and enjoy perfect all-inclusive benefits.' },
    { t: /입장료, 관람료, 환경세, 왕복 차량 전면 포함/g, r: 'Admission, viewing, environmental fees, and round-trip vehicle included' },
    { t: /최소한의 대기 시간 보장 \(Fast Track\)/g, r: 'Minimal waiting time guaranteed (Fast Track)' },
    { t: /전문 수중 촬영 제공/g, r: 'Professional underwater photography provided' },
    { t: /호텔 드랍 서비스 및 각종 무료 대여\(구명조끼, 짐보관 등\)/g, r: 'Hotel drop-off service and various free rentals (life jackets, luggage storage, etc.)' },
    { t: /특별 혜택: 점보크랩 새우 무료, 아일랜드투어 무료/g, r: 'Special benefits: Free Jumbo Crab shrimp, free Island Tour' },
    { t: /기다리는 것을 싫어하고 편안한 이동을 원하시는 분/g, r: 'Those who hate waiting and want comfortable transportation.' },
    { t: /사진 촬영부터 장비 대여까지 한 번에 해결하고 싶은 분/g, r: 'Those who want everything from photo shoots to equipment rental solved at once.' }
  ],
  'vf-details.html': [
    { t: /VIP 패스트트랙/g, r: 'VIP Fast Track' },
    { t: /최고의 VIP 경험,<br>완벽한 프라이빗 케어/g, r: 'The ultimate VIP experience,<br>perfect private care' },
    { t: /오직 우리 일행만을 위한 단독 차량과 프리미엄 서비스를 경험하세요\./g, r: 'Experience exclusive vehicles and premium services just for your group.' },
    { t: /우리 일행만을 위한 전용 단독 차량 배정/g, r: 'Exclusive private vehicle assigned just for your group' },
    { t: /리버타드 전문 수중촬영가 전담 마크/g, r: 'Dedicated Libertad professional underwater photographer' },
    { t: /패스트트랙 포함사항 전면 기본 제공/g, r: 'All Fast Track inclusions provided as standard' },
    { t: /스노클마스크 등 모든 장비 완벽 대여/g, r: 'Perfect rental of all equipment including snorkel masks' },
    { t: /가족 단위나 프라이빗한 투어를 원하시는 분/g, r: 'Those who want a family-oriented or private tour.' },
    { t: /타인과 섞이지 않고 우리만의 여유로운 시간을 즐기고 싶은 분/g, r: 'Those who want to enjoy a relaxing time without mixing with others.' }
  ]
};

detailsFiles.forEach(file => {
  const filePath = path.join(dir, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Apply common replacements
    commonReplacements.forEach(({ t, r }) => {
      content = content.replace(t, r);
    });

    // Apply specific replacements
    if (specificReplacements[file]) {
      specificReplacements[file].forEach(({ t, r }) => {
        content = content.replace(t, r);
      });
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Translated ${file}`);
  }
});
