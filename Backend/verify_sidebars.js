import fs from 'fs';
import path from 'path';

const dir = 'e:/projectWEB/Smart-Health-Diet-Recommendation/frontend/dietitian';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

const expectedOrder = [
  'dashboard.html',
  'profile.html',
  'patients.html',
  'meal-builder.html',
  'guidance-requests.html',
  'recipe-upload.html',
  'chat.html'
];

let allPassed = true;

for (const file of files) {
  const content = fs.readFileSync(path.join(dir, file), 'utf8');
  const menuMatch = content.match(/<nav class="sidebar-menu">([\s\S]*?)<\/nav>/);
  if (!menuMatch) {
    console.error(file, 'MISSING sidebar-menu');
    allPassed = false;
    continue;
  }
  const hrefs = [];
  const regex = /href="([^"#]+)"/g;
  let match;
  while ((match = regex.exec(menuMatch[1])) !== null) {
    hrefs.push(match[1]);
  }

  // Check active link matches filename
  const activeRegex = /<a\s+href="([^"#]+)"\s+class="sidebar-link active"/;
  const activeMatch = menuMatch[1].match(activeRegex);
  const activeFile = activeMatch ? activeMatch[1] : null;

  console.log(`${file.padEnd(22)}: Active = ${String(activeFile).padEnd(22)} | Links: ${hrefs.join(', ')}`);

  if (JSON.stringify(hrefs) !== JSON.stringify(expectedOrder)) {
    console.error(`  -> MISMATCH IN ${file}!`);
    allPassed = false;
  }
  if (activeFile !== file) {
    console.error(`  -> WRONG ACTIVE LINK IN ${file} (expected ${file}, got ${activeFile})`);
    allPassed = false;
  }
}

if (allPassed) {
  console.log('\nSUCCESS: All 7 dietitian pages have identical sidebar menus with the correct active link!');
}
