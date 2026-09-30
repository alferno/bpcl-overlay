const { app } = require('electron');
const fs = require('fs');
app.on('ready', () => {
  const isDir = fs.statSync('C:\\Users\\anian\\AppData\\Roaming\\BPCLStreamer\\resources\\app.asar').isDirectory();
  console.log('isDir:', isDir);
  app.quit();
});
