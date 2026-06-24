const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const timestamp = new Date().toISOString();
let commit = 'unknown';
try { commit = execSync('git rev-parse --short HEAD').toString().trim(); } catch(e){}

const logPayload = JSON.stringify({
  skill: 'plan-eng-review',
  timestamp,
  status: 'clean',
  unresolved: 0,
  critical_gaps: 0,
  issues_found: 0,
  mode: 'FULL_REVIEW',
  commit
});

try {
  const logDir = 'C:\\Users\\coban\\.gstack\\projects\\marketpos';
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const logFile = path.join(logDir, 'main-reviews.jsonl');
  fs.appendFileSync(logFile, logPayload + '\n');
  console.log('Successfully logged to:', logFile);
} catch (err) {
  console.error('Error logging:', err.message);
}
