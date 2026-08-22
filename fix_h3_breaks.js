const fs = require('fs');
const path = require('path');

const files = ['f-details.html', 'vf-details.html', 'r-details.html', 't-details.html'];

files.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) return;

  let content = fs.readFileSync(filePath, 'utf8');

  // Find all h3 inside learn-card-vertical-text and replace " (" with "<br>("
  content = content.replace(/(<div class="learn-card-vertical-text">\s*<h3[^>]*>)([^<]+)(<\/h3>)/g, (match, p1, text, p3) => {
    // If it already has <br>, skip
    if (text.includes('<br>')) return match;
    // Replace the first " (" with "<br>("
    const newText = text.replace(' (', '<br>(');
    return p1 + newText + p3;
  });

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Added line breaks to h3 in ${file}`);
});
