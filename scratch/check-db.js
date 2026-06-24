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
    
    // Group by company and is_active
    const counts = db.prepare('SELECT company_id, is_active, COUNT(*) as count FROM cached_products GROUP BY company_id, is_active').all();
    console.log('Product status breakdown by company:');
    console.log(counts);
    
    // Check if there are active products for the current company
    const sample = db.prepare("SELECT id, name, barcode, company_id, is_active FROM cached_products WHERE company_id = 'eaeb3c79-78de-4466-9d7f-3b885c38f415' LIMIT 5").all();
    console.log('Sample products for current company:', sample);
    
    db.close();
  } catch (err) {
    console.error('Error reading database:', err);
  }
  app.quit();
});
