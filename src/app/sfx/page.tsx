'use client';

/**
 * 효과음 확인 페이지 (숨은 라우트 /sfx — 네비게이션 미노출, 검수용).
 * utils/sfx.ts의 SFX_CATALOG를 그대로 순회해 사운드마다 카드 1장(라벨 + 상황 설명 +
 * 재생 버튼)을 띄운다. 재생은 previewSfx — 게임 내 on/off 설정·터보 게이트와 무관하게
 * 항상 들리므로, 게임에서 나는 소리를 여기서 그대로 확인할 수 있다.
 */

import { useState } from 'react';
import { Play, Volume2 } from 'lucide-react';
import { SFX_CATALOG, previewSfx, SfxName } from '@/utils/sfx';
import { useGameSettingsStore } from '@/store/gameSettingsStore';

export default function SfxPreviewPage() {
  const sfxEnabled = useGameSettingsStore((s) => s.sfxEnabled);
  const [lastPlayed, setLastPlayed] = useState<SfxName | null>(null);

  const entries = Object.entries(SFX_CATALOG) as [SfxName, (typeof SFX_CATALOG)[SfxName]][];

  return (
    <main className="min-h-screen pt-28 pb-20 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <Volume2 className="text-accent" size={28} />
          <h1 className="text-3xl font-bold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
            효과음 미리듣기
          </h1>
        </div>
        <p className="text-foreground-secondary mb-1">
          게임 중 각 액션에서 재생되는 효과음을 확인합니다. 버튼을 눌러 들어보세요.
        </p>
        <p className="text-xs text-foreground-muted mb-8">
          이 페이지의 재생은 게임 내 효과음 설정과 무관하게 항상 들립니다 · 게임 내 효과음 설정(⚙): 현재{' '}
          <span className={sfxEnabled ? 'text-positive font-semibold' : 'text-accent font-semibold'}>
            {sfxEnabled ? '켜짐' : '꺼짐'}
          </span>
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {entries.map(([name, def]) => (
            <div key={name} className="glass-card p-5 flex flex-col gap-2 card-hover">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-bold text-foreground">{def.label}</h2>
                <code className="text-[10px] text-foreground-muted bg-background-tertiary px-1.5 py-0.5 rounded">
                  {name}
                </code>
              </div>
              <p className="text-xs text-foreground-secondary leading-snug flex-1">{def.situation}</p>
              <button
                onClick={() => {
                  previewSfx(name);
                  setLastPlayed(name);
                }}
                className="btn-primary mt-1 flex items-center justify-center gap-2 !py-2 text-sm"
              >
                <Play size={14} />
                재생
                {lastPlayed === name && <span className="text-xs opacity-80">✓</span>}
              </button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
