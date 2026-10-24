const fs = require('fs');
const path = require('path');
const htmlFiles = fs.readdirSync(__dirname).filter(f => f.endsWith('.html'));

htmlFiles.forEach(file => {
  const content = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    if (/[가-힣]/.test(line)) {
      console.log(`${file}:${i+1}: ${line.trim()}`);
    }
  });
});
