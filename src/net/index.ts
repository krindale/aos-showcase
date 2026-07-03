/**
 * 전송 계층 진입점 — 환경변수에서 Supabase transport 싱글턴 생성.
 * 게임 코드는 여기의 getTransport()와 types.ts 인터페이스만 사용한다.
 */
import { SupabaseTransport } from './supabaseTransport';
import type { NetTransport } from './types';

export * from './types';
export { getClientId } from './supabaseTransport';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** 온라인 기능 사용 가능 여부 — 미설정 배포(포크 등)에서 UI를 숨기는 용도 */
export function isNetConfigured(): boolean {
  return Boolean(url && anonKey);
}

let transport: NetTransport | null = null;

export function getTransport(): NetTransport {
  if (!url || !anonKey) {
    throw new Error(
      'Supabase 환경변수 미설정 — .env.local의 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 확인'
    );
  }
  if (!transport) transport = new SupabaseTransport(url, anonKey);
  return transport;
}
