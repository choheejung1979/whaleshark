const fs = require('fs');
const path = require('path');

const files = ['f-details.html', 'vf-details.html'];

files.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) return;

  let content = fs.readFileSync(filePath, 'utf8');

  // Match the learn-card-vertical div that contains "멤버십 카드 제공"
  // and remove it
  const regex = /<div class="learn-card-vertical"[^>]*>[\s\S]*?<div class="premium-icon">[\s\S]*?<i data-lucide="credit-card"><\/i>[\s\S]*?<\/div>\s*<div class="learn-card-vertical-text">\s*<h3[^>]*>보라카이션 멤버십 카드 제공<br>\(보라카이션만의 특별한 멤버십 혜택!\)<\/h3>\s*<\/div>\s*<\/div>/g;
  
  content = content.replace(regex, '');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Removed membership card from ${file}`);
});
