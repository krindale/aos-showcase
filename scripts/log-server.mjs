// [개발 전용] 브라우저 콘솔/게임 로그 수신 서버 (:3999)
// GamePageClient의 콘솔 미러가 POST로 보내는 로그를 받아 stdout + 파일에 기록한다.
// 메모리 버퍼가 아닌 파일에도 남기므로, 서버를 재시작해도 파일 로그는 유지된다.
import { createServer } from 'node:http';
import { appendFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, '..', 'logs');
mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = join(LOG_DIR, 'game-mirror.log');

const PORT = 3999;

function write(line) {
  process.stdout.write(line + '\n');
  try {
    appendFileSync(LOG_FILE, line + '\n');
  } catch { /* noop */ }
}

const server = createServer((req, res) => {
  // CORS (localhost:3000 → :3999 cross-origin POST)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(200);
    res.end('log-server ok');
    return;
  }

  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    try {
      const { level, msg } = JSON.parse(body);
      const ts = new Date().toISOString().slice(11, 23);
      const tag = level === 'error' ? 'ERR ' : level === 'warn' ? 'WARN' : 'LOG ';
      write(`${ts} [${tag}] ${msg}`);
    } catch {
      write(`?? [RAW ] ${body}`);
    }
    res.writeHead(200);
    res.end('ok');
  });
});

server.listen(PORT, () => {
  write(`=== log-server listening on http://localhost:${PORT} (file: ${LOG_FILE}) ===`);
});
