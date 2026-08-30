const fs = require('fs');
const path = require('path');

const dir = __dirname;
const htmlFiles = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

const replacements = [
  // index.html price blocks
  { target: /49,900<span>원<\/span>/g, replace: '1,920<span>페소</span>' },
  { target: /74,900<span>원<\/span>/g, replace: '2,820<span>페소</span>' },
  { target: /95,000<span>원<\/span>/g, replace: '3,800<span>페소</span>' },
  { target: /145,500<span>원<\/span>/g, replace: '5,820<span>페소</span>' },

  // index.html hyper labels and detail sidebars
  { target: /49,900원/g, replace: '1,920페소' },
  { target: /74,900원/g, replace: '2,820페소' },
  { target: /95,000원/g, replace: '3,800페소' },
  { target: /145,500원/g, replace: '5,820페소' },

  // just in case they are formatted differently
  { target: /49900원/g, replace: '1,920페소' },
  { target: /74900원/g, replace: '2,820페소' },
  { target: /95000원/g, replace: '3,800페소' },
  { target: /145500원/g, replace: '5,820페소' }
];

htmlFiles.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  replacements.forEach(({ target, replace }) => {
    content = content.replace(target, replace);
  });

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated prices in ${file}`);
  }
});
