import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const copyDir = (src, dest) => {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    entry.isDirectory() ? copyDir(srcPath, destPath) : fs.copyFileSync(srcPath, destPath);
  }
};

try {
  copyDir(path.resolve(__dirname, '../admin-web/dist'), path.resolve(__dirname, 'release/BPCL Streamer Desktop-win32-x64/resources/admin-web/dist'));
  copyDir(path.resolve(__dirname, '../overlay-web/dist'), path.resolve(__dirname, 'release/BPCL Streamer Desktop-win32-x64/resources/overlay-web/dist'));
  
  fs.copyFileSync(
    path.resolve(__dirname, 'resources/cloudflared-windows-amd64.exe'),
    path.resolve(__dirname, 'release/BPCL Streamer Desktop-win32-x64/resources/cloudflared-windows-amd64.exe')
  );
  
  console.log("✅ Successfully copied admin-web, overlay-web, and cloudflared into the packaged resources!");
} catch (err) {
  console.error("Failed to copy resources:", err);
  process.exit(1);
}
