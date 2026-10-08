const fs = require('fs');
const path = require('path');

const files = ['f-details.html', 'vf-details.html', 'r-details.html', 't-details.html'];

files.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) return;

  let content = fs.readFileSync(filePath, 'utf8');

  // Add Lucide CDN in head if not present
  if (!content.includes('lucide@latest')) {
    content = content.replace('</head>', '  <script src="https://unpkg.com/lucide@latest"></script>\n</head>');
  }

  // Add lucide.createIcons() before </body> if not present
  if (!content.includes('lucide.createIcons()')) {
    content = content.replace('</body>', '  <script>\n    lucide.createIcons();\n  </script>\n</body>');
  }

  // Replace premium-icon emoji with Lucide icon
  content = content.replace(/<div class="premium-icon">([\s\S]*?)<\/div>\s*<div class="learn-card-vertical-text">\s*<h3[^>]*>(.*?)<\/h3>/g, (match, emoji, text) => {
    let iconName = 'check-circle'; // default
    if (text.includes('차량') || text.includes('미팅') || text.includes('드랍')) iconName = 'bus';
    else if (text.includes('구명조끼')) iconName = 'life-buoy';
    else if (text.includes('스노클') || text.includes('핀') || text.includes('오리발')) iconName = 'waves';
    else if (text.includes('새우') || text.includes('점보크랩')) iconName = 'utensils-crossed';
    else if (text.includes('아일랜드')) iconName = 'palmtree';
    else if (text.includes('멤버십')) iconName = 'credit-card';
    else if (text.includes('패스트트랙') && text.includes('VIP')) iconName = 'crown';
    else if (text.includes('패스트트랙')) iconName = 'zap';
    else if (text.includes('수중 촬영') || text.includes('액션캠') || text.includes('수중촬영')) iconName = 'camera';
    else if (text.includes('티켓') || text.includes('관람료')) iconName = 'ticket';
    else if (text.includes('사우스웨스트') || text.includes('이동')) iconName = 'bus-front';
    else if (text.includes('안내직원') || text.includes('헬퍼')) iconName = 'user-check';

    return `<div class="premium-icon">
            <i data-lucide="${iconName}"></i>
          </div>
          <div class="learn-card-vertical-text">
            <h3 style="color: #fff; font-size:1.15rem; line-height: 1.4; font-weight: 600;">${text}</h3>`;
  });

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${file} with Lucide icons`);
});
