'use client';

/**
 * 전송 계층 검증 페이지 (Phase 0 게이트) — 두 브라우저 탭에서 에코 왕복 확인용.
 * 게임과 무관한 개발 도구. Phase 1 로비 UI가 생기면 제거 예정.
 */
import { useRef, useState } from 'react';
import { getTransport, isNetConfigured, type RoomConnection, type RoomEvents } from '@/net';

export default function NetTestPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [chatText, setChatText] = useState('');
  const [presence, setPresence] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const connRef = useRef<RoomConnection | null>(null);

  const append = (line: string) =>
    setLogs((prev) => [...prev.slice(-49), `${new Date().toLocaleTimeString()}  ${line}`]);

  const events: RoomEvents = {
    onChat: (msg) => append(`💬 수신 [${msg.name}] ${msg.text}`),
    onIntent: (msg) => append(`📩 intent 수신: ${msg.type} (from ${msg.clientId.slice(0, 8)})`),
    onSnapshot: (msg) => append(`📦 snapshot 수신: rev ${msg.rev}`),
    onPresence: (ids) => {
      setPresence(ids);
      append(`👥 접속자 ${ids.length}명: ${ids.map((id) => id.slice(0, 8)).join(', ')}`);
    },
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      append(`❌ ${label} 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = () =>
    run('방 생성', async () => {
      const conn = await getTransport().createRoom({ mapId: 'net-test', seats: [] }, events);
      connRef.current = conn;
      setRoomCode(conn.room.code);
      append(`✅ 방 생성됨 — 코드: ${conn.room.code} (다른 탭에서 이 코드로 입장)`);
    });

  const handleJoin = () =>
    run('방 입장', async () => {
      const conn = await getTransport().joinRoom(joinCode, events);
      connRef.current = conn;
      setRoomCode(conn.room.code);
      append(`✅ 방 입장 — 코드: ${conn.room.code}`);
    });

  const handleChat = () =>
    run('채팅 전송', async () => {
      const conn = connRef.current;
      if (!conn || !chatText.trim()) return;
      await conn.sendChat(`탭-${conn.clientId.slice(0, 4)}`, chatText.trim());
      append(`💬 전송: ${chatText.trim()}`);
      setChatText('');
    });

  const handlePing = () =>
    run('intent 전송', async () => {
      const conn = connRef.current;
      if (!conn) return;
      await conn.sendIntent({ seat: 0, type: 'ping', payload: { at: Date.now() } });
      append('📩 intent 전송: ping');
    });

  if (!isNetConfigured()) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <div className="glass-card p-8 max-w-md">
          <h1 className="text-xl font-bold mb-2">전송 계층 테스트</h1>
          <p className="text-foreground-secondary">
            Supabase 환경변수가 없습니다 — <code>.env.local</code>에
            NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 설정 후 dev 서버를
            재시작하세요.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">전송 계층 테스트 (Phase 0)</h1>
      <p className="text-sm text-foreground-secondary">
        탭 2개로 열어 한쪽에서 방 생성 → 다른 쪽에서 코드 입장 → 채팅/핑이 왕복하면 게이트 통과.
      </p>

      <div className="glass-card p-4 space-y-3">
        {roomCode ? (
          <p>
            현재 방: <span className="font-bold text-accent text-lg">{roomCode}</span>
            <span className="ml-3 text-sm text-foreground-secondary">접속자 {presence.length}명</span>
          </p>
        ) : (
          <div className="flex flex-wrap gap-2 items-center">
            <button className="btn-primary" onClick={handleCreate} disabled={busy}>
              방 생성
            </button>
            <span className="text-foreground-muted">또는</span>
            <input
              className="border border-glass-border rounded-lg px-3 py-2 w-32 uppercase"
              placeholder="방 코드"
              value={joinCode}
              maxLength={6}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            />
            <button className="btn-secondary" onClick={handleJoin} disabled={busy || joinCode.length !== 6}>
              입장
            </button>
          </div>
        )}

        {roomCode && (
          <div className="flex flex-wrap gap-2 items-center">
            <input
              className="border border-glass-border rounded-lg px-3 py-2 flex-1 min-w-40"
              placeholder="채팅 메시지"
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleChat()}
            />
            <button className="btn-primary" onClick={handleChat} disabled={busy}>
              전송
            </button>
            <button className="btn-secondary" onClick={handlePing} disabled={busy}>
              intent 핑
            </button>
          </div>
        )}
      </div>

      <div className="glass-card p-4">
        <h2 className="font-bold mb-2">이벤트 로그</h2>
        <div className="font-mono text-xs space-y-1 max-h-96 overflow-y-auto">
          {logs.length === 0 ? (
            <p className="text-foreground-muted">아직 없음</p>
          ) : (
            logs.map((line, i) => <div key={i}>{line}</div>)
          )}
        </div>
      </div>
    </main>
  );
}
