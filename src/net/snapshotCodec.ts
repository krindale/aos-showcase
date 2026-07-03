/**
 * 게임 스냅샷 직렬화/압축 (Phase 1)
 *
 * 호스트가 확정한 게임 상태를 게스트에게 전파할 때 쓰는 포맷.
 * - persist 포맷(상태 필드 JSON)을 재사용하되 **로컬 전용 필드는 제외**:
 *   ui(각자 자기 선택 상태 유지)·aiExecution(호스트 전용)·undoCount(게스트 undo 금지)
 * - logs는 크기 병목 → 최근 RECENT_LOGS개만 포함 (게스트 로그 패널용)
 * - gzip(CompressionStream) + base64 — Realtime 메시지 256KB 한도/무료 egress 대비
 *
 * 게임 코드와의 결합을 피하기 위해 상태는 Record<string, unknown>으로 다룬다
 * (필드 열거가 아니라 "함수·제외 키 빼고 전부" — GameState 필드가 늘어도 자동 동기화).
 */

/**
 * 스냅샷에서 제외하는 로컬 전용 키.
 * undoCount는 동기화한다 — 게스트의 취소 버튼 표시용 (실제 되돌리기는 undoLastAction 인텐트로
 * 호스트가 실행. 스냅샷을 적용해도 호스트 쪽 undo 스택 길이가 그대로 전달되어야 버튼이 보인다)
 */
const LOCAL_ONLY_KEYS = new Set(['ui', 'aiExecution']);

/** 스냅샷에 포함할 최근 로그 수 */
const RECENT_LOGS = 30;

/**
 * 스토어 상태 → 동기화 대상 필드만 추린 순수 데이터 객체.
 * (함수 = zustand 액션 제외, 로컬 전용 키 제외, logs는 최근 N개)
 */
export function extractSyncedState(state: Record<string, unknown>): Record<string, unknown> {
  const synced: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    if (typeof value === 'function') continue;
    if (LOCAL_ONLY_KEYS.has(key)) continue;
    synced[key] = value;
  }
  const logs = synced.logs;
  if (Array.isArray(logs) && logs.length > RECENT_LOGS) {
    synced.logs = logs.slice(-RECENT_LOGS);
  }
  return synced;
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function streamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/** JSON → gzip → base64. 반환의 bytes는 압축 후 크기(전송량 계측용) */
export async function encodeSnapshot(
  state: Record<string, unknown>
): Promise<{ z: string; bytes: number }> {
  const json = JSON.stringify(extractSyncedState(state));
  const gzipped = await streamToBytes(
    new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))
  );
  return { z: toBase64(gzipped), bytes: gzipped.length };
}

/** base64 → gunzip → JSON */
export async function decodeSnapshot(z: string): Promise<Record<string, unknown>> {
  const bytes = fromBase64(z);
  const jsonBytes = await streamToBytes(
    new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  );
  return JSON.parse(new TextDecoder().decode(jsonBytes)) as Record<string, unknown>;
}
