const { app } = require('electron');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.whenReady().then(() => {
  const roamingDir = path.join(os.homedir(), 'AppData', 'Roaming');
  
  function findDbFile(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          if (file !== 'Microsoft' && file !== 'npm' && file !== 'Apple') {
            const found = findDbFile(fullPath);
            if (found) return found;
          }
        } else if (file === 'marketpos.db.sqlite') {
          return fullPath;
        }
      } catch (e) {
      }
    }
    return null;
  }

  const dbPath = findDbFile(roamingDir);
  if (!dbPath) {
    console.log('Could not find marketpos.db.sqlite');
    app.quit();
    return;
  }

  try {
    const db = new Database(dbPath, { readonly: true });
    const product = db.prepare("SELECT * FROM cached_products WHERE id = '6936be04-4edc-46f9-b54e-1a1a40de0c7d'").get();
    console.log('Found product in local DB:', product);
    db.close();
  } catch (err) {
    console.error('Error reading database:', err);
  }
  app.quit();
});
