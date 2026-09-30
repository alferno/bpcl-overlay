const fs = require('fs');
const path = require('path');
const INSTALL_DIR = 'C:\\Users\\anian\\AppData\\Roaming\\BPCLStreamer';
try {
  const items = fs.readdirSync(INSTALL_DIR);
  for (const item of items) {
    if (item === 'version.txt') continue;
    const itemPath = path.join(INSTALL_DIR, item);
    console.log('Deleting', itemPath);
    fs.rmSync(itemPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
} catch (e) {
  console.error(e);
}
