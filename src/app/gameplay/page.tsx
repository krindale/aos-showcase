'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEnterMotion } from '@/hooks/useEnterMotion';

/* ── 단계별 애니메이션 다이어그램 (SMIL SVG, claude-design 포트) ── */

const SUB = '#8a857c';
const FAINT = '#a39d91';
const LINE = '#c9c1b1';
const TIE = '#d9d1c1';
const RED = '#c04a2b';
const GREEN = '#2f6b4f';

/** 날아가는 동전($) 3개 — 주식발행/소득징수 공용 */
function Coins({ path, color, dur = 2.4 }: { path: string; color: string; dur?: number }) {
  return (
    <>
      {[0, 0.8, 1.6].map((begin) => (
        <g key={begin}>
          <circle r="13" fill={color} />
          <circle r="13" fill="none" stroke="#fff" strokeOpacity=".4" strokeWidth="1.5" />
          <text y="4.5" textAnchor="middle" fontFamily="Space Grotesk" fontSize="13" fontWeight="700" fill="#fff">
            $
          </text>
          <animateMotion path={path} dur={`${dur}s`} begin={`${begin}s`} repeatCount="indefinite" />
          <animate
            attributeName="opacity"
            values="0;1;1;0"
            keyTimes="0;0.12;0.82;1"
            dur={`${dur}s`}
            begin={`${begin}s`}
            repeatCount="indefinite"
          />
        </g>
      ))}
    </>
  );
}

/** 지갑(내 자금) 아이콘 */
function Wallet({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <>
      <rect x={x} y={y} width="104" height="64" rx="13" fill="#fff" stroke={LINE} strokeWidth="2" />
      <rect x={x} y={y + 18} width="104" height="28" fill="#f7f5f0" />
      <circle cx={x + 92} cy={y + 32} r="6" fill="none" stroke={LINE} strokeWidth="2" />
      <text x={x + 44} y={y + 82} textAnchor="middle" fill={SUB} fontFamily="IBM Plex Sans KR" fontSize="12">
        {label}
      </text>
    </>
  );
}

const diagrams: { caption: string; svg: ReactNode }[] = [
  {
    caption: '주식을 발행하면 자금이 들어오지만, 매 턴 갚을 빚도 함께 늘어납니다',
    svg: (
      <svg viewBox="0 0 440 150" className="block h-auto w-full">
        <rect x="28" y="34" width="98" height="82" rx="10" fill="#fff" stroke={RED} strokeWidth="2" />
        <path d="M38 34 H116 a10 10 0 0 1 10 10 v6 H28 v-6 a10 10 0 0 1 10 -10 Z" fill={RED} />
        <text x="77" y="48" textAnchor="middle" fill="#fff" fontFamily="IBM Plex Sans KR" fontSize="12" fontWeight="700">
          주식 증서
        </text>
        <line x1="44" y1="70" x2="112" y2="70" stroke="#ece7dd" strokeWidth="4" strokeLinecap="round" />
        <line x1="44" y1="84" x2="112" y2="84" stroke="#ece7dd" strokeWidth="4" strokeLinecap="round" />
        <line x1="44" y1="98" x2="90" y2="98" stroke="#ece7dd" strokeWidth="4" strokeLinecap="round" />
        <Wallet x={312} y={42} label="내 자금" />
        <text x="366" y="32" textAnchor="middle" fill={GREEN} fontFamily="Space Grotesk" fontSize="13" fontWeight="700">
          + 자금
        </text>
        <Coins path="M160 76 H298" color={RED} />
      </svg>
    ),
  },
  {
    caption: '플레이어가 한 명씩 차례로 입찰 금액을 부릅니다 — 최고가가 먼저 행동합니다',
    svg: (
      <svg viewBox="0 0 440 150" className="block h-auto w-full">
        <path d="M63 12 L77 12 L70 24 Z" fill={RED}>
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 0;100 0;200 0;300 0;300 0"
            keyTimes="0;0.18;0.36;0.54;1"
            dur="5s"
            calcMode="discrete"
            repeatCount="indefinite"
          />
        </path>
        {[70, 170, 270, 370].map((cx, i) => (
          <g key={cx}>
            <circle cx={cx} cy="86" r="20" fill="#f7f5f0" stroke={LINE} strokeWidth="2" />
            <text x={cx} y="93" textAnchor="middle" fill={SUB} fontFamily="Space Grotesk" fontSize="17" fontWeight="700">
              {i + 1}
            </text>
          </g>
        ))}
        <g opacity="0">
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.97;1" dur="5s" repeatCount="indefinite" />
          <rect x="49" y="38" width="42" height="26" rx="8" fill="#fff" stroke={LINE} strokeWidth="2" />
          <text x="70" y="56" textAnchor="middle" fill={RED} fontFamily="Space Grotesk" fontSize="15" fontWeight="700">
            $3
          </text>
        </g>
        <g opacity="0">
          <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.26;0.3;0.97;1" dur="5s" repeatCount="indefinite" />
          <rect x="149" y="38" width="42" height="26" rx="8" fill="#fff" stroke={LINE} strokeWidth="2" />
          <text x="170" y="56" textAnchor="middle" fill={RED} fontFamily="Space Grotesk" fontSize="15" fontWeight="700">
            $7
          </text>
        </g>
        <g opacity="0">
          <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.44;0.48;0.97;1" dur="5s" repeatCount="indefinite" />
          <rect x="249" y="38" width="42" height="26" rx="8" fill={RED} />
          <text x="270" y="56" textAnchor="middle" fill="#fff" fontFamily="Space Grotesk" fontSize="15" fontWeight="700">
            $8
          </text>
        </g>
        <g opacity="0">
          <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.62;0.66;0.97;1" dur="5s" repeatCount="indefinite" />
          <rect x="349" y="38" width="42" height="26" rx="8" fill="#fff" stroke={LINE} strokeWidth="2" />
          <text x="370" y="56" textAnchor="middle" fill={RED} fontFamily="Space Grotesk" fontSize="15" fontWeight="700">
            $4
          </text>
        </g>
        <g opacity="0">
          <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.76;0.82;0.97;1" dur="5s" repeatCount="indefinite" />
          <circle cx="270" cy="86" r="22" fill="none" stroke={RED} strokeWidth="3" />
          <text x="270" y="128" textAnchor="middle" fill={RED} fontFamily="IBM Plex Sans KR" fontSize="13" fontWeight="700">
            선두 · 먼저 행동
          </text>
        </g>
      </svg>
    ),
  },
  {
    caption: '7장의 액션 카드 중 단 한 장만 가져갈 수 있습니다',
    svg: (
      <svg viewBox="0 0 440 150" className="block h-auto w-full">
        <g fill="#fff" stroke={TIE} strokeWidth="2">
          {[28, 84, 196, 252, 308, 364].map((x) => (
            <rect key={x} x={x} y="52" width="44" height="78" rx="7" />
          ))}
        </g>
        <g stroke="#e8e1d4" strokeWidth="3" strokeLinecap="round">
          {[38, 94, 206, 262, 318, 374].map((x) => (
            <line key={x} x1={x} y1="68" x2={x + 24} y2="68" />
          ))}
        </g>
        <g>
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 0;0 -18;0 -18;0 0"
            keyTimes="0;0.22;0.78;1"
            dur="2.8s"
            repeatCount="indefinite"
          />
          <rect x="140" y="52" width="44" height="78" rx="7" fill="rgba(192,74,43,.12)" stroke={RED} strokeWidth="2.5" />
          <circle cx="162" cy="91" r="12" fill={RED} />
          <path d="M156 91 L160 95 L168 86" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <text x="162" y="26" textAnchor="middle" fill={RED} fontFamily="IBM Plex Sans KR" fontSize="13" fontWeight="700" opacity="0">
          선택
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.22;0.78;1" dur="2.8s" repeatCount="indefinite" />
        </text>
      </svg>
    ),
  },
  {
    caption: '도시를 잇는 선로를 한 타일씩 놓습니다 — 지형에 따라 비용이 달라집니다',
    svg: (
      <svg viewBox="0 0 440 150" className="block h-auto w-full">
        <g stroke={TIE} strokeWidth="2.5" strokeLinecap="round">
          {[92, 116, 140, 164, 188, 244, 268, 292, 316, 340].map((x) => (
            <line key={x} x1={x} y1="72" x2={x} y2="90" />
          ))}
        </g>
        <path d="M70 81 H220" fill="none" stroke={RED} strokeWidth="6" strokeLinecap="round" strokeDasharray="150" strokeDashoffset="150">
          <animate attributeName="stroke-dashoffset" values="150;0;0;150" keyTimes="0;0.4;0.9;1" dur="3.4s" repeatCount="indefinite" />
        </path>
        <path d="M220 81 H370" fill="none" stroke={GREEN} strokeWidth="6" strokeLinecap="round" strokeDasharray="150" strokeDashoffset="150">
          <animate attributeName="stroke-dashoffset" values="150;150;0;150" keyTimes="0;0.45;0.88;1" dur="3.4s" repeatCount="indefinite" />
        </path>
        <circle cx="70" cy="81" r="17" fill="#fff" stroke={RED} strokeWidth="3" />
        <circle cx="220" cy="81" r="15" fill="#fff" stroke={LINE} strokeWidth="3" />
        <circle cx="370" cy="81" r="17" fill="#fff" stroke={GREEN} strokeWidth="3" />
        <g opacity="0">
          <animate attributeName="opacity" values="0;0;1;1" keyTimes="0;0.38;0.46;1" dur="3.4s" repeatCount="indefinite" />
          <rect x="128" y="42" width="34" height="20" rx="6" fill={RED} />
          <text x="145" y="56" textAnchor="middle" fill="#fff" fontFamily="Space Grotesk" fontSize="12" fontWeight="700">
            $2
          </text>
        </g>
        <g opacity="0">
          <animate attributeName="opacity" values="0;0;1;1" keyTimes="0;0.62;0.7;1" dur="3.4s" repeatCount="indefinite" />
          <rect x="278" y="42" width="34" height="20" rx="6" fill={GREEN} />
          <text x="295" y="56" textAnchor="middle" fill="#fff" fontFamily="Space Grotesk" fontSize="12" fontWeight="700">
            $3
          </text>
        </g>
        <text x="70" y="120" textAnchor="middle" fill={SUB} fontFamily="IBM Plex Sans KR" fontSize="12">
          도시 A
        </text>
        <text x="370" y="120" textAnchor="middle" fill={SUB} fontFamily="IBM Plex Sans KR" fontSize="12">
          도시 B
        </text>
      </svg>
    ),
  },
  {
    caption: '큐브를 같은 색 도시로 배송 — 지나온 링크 수만큼 소득이 오릅니다',
    svg: (
      <svg viewBox="0 0 440 150" className="block h-auto w-full">
        <g stroke={TIE} strokeWidth="2.5" strokeLinecap="round">
          {[84, 110, 136, 162, 188, 252, 278, 304, 330, 356].map((x) => (
            <line key={x} x1={x} y1="58" x2={x} y2="76" />
          ))}
        </g>
        <line x1="60" y1="67" x2="380" y2="67" stroke={LINE} strokeWidth="5" strokeLinecap="round" />
        <circle cx="60" cy="67" r="17" fill="rgba(192,74,43,.12)" stroke={RED} strokeWidth="3" />
        <circle cx="220" cy="67" r="14" fill="#fff" stroke={LINE} strokeWidth="3" />
        <circle cx="380" cy="67" r="17" fill="#fff" stroke={RED} strokeWidth="3" />
        <rect x="-11" y="-11" width="22" height="22" rx="4" fill={RED}>
          <animateMotion path="M60 67 H380" keyPoints="0;0.5;1" keyTimes="0;0.5;1" calcMode="linear" dur="3s" repeatCount="indefinite" />
        </rect>
        <text x="60" y="106" textAnchor="middle" fill={SUB} fontFamily="IBM Plex Sans KR" fontSize="12">
          출발
        </text>
        <text x="380" y="106" textAnchor="middle" fill={SUB} fontFamily="IBM Plex Sans KR" fontSize="12">
          목적
        </text>
        <text x="44" y="135" fill={SUB} fontFamily="IBM Plex Sans KR" fontSize="12">
          소득
        </text>
        <rect x="84" y="124" width="252" height="9" rx="4.5" fill="#ece7dd" />
        <rect x="84" y="124" width="0" height="9" rx="4.5" fill={GREEN}>
          <animate attributeName="width" values="0;0;252" keyTimes="0;0.06;1" dur="3s" repeatCount="indefinite" />
        </rect>
        <text x="380" y="38" textAnchor="middle" fill={GREEN} fontFamily="Space Grotesk" fontSize="15" fontWeight="700" opacity="0">
          +2 소득
          <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.82;0.9;0.97;1" dur="3s" repeatCount="indefinite" />
        </text>
      </svg>
    ),
  },
  {
    caption: '소득 트랙 위치만큼 매 턴 현금을 받습니다',
    svg: (
      <svg viewBox="0 0 440 150" className="block h-auto w-full">
        <rect x="22" y="40" width="132" height="70" rx="12" fill="rgba(47,107,79,.1)" stroke={GREEN} strokeWidth="2" />
        <text x="38" y="64" fill={GREEN} fontFamily="IBM Plex Sans KR" fontSize="12" fontWeight="600">
          소득 레벨
        </text>
        <text x="38" y="98" fill={GREEN} fontFamily="Space Grotesk" fontSize="30" fontWeight="700">
          8
        </text>
        <g fill={GREEN}>
          <rect x="96" y="84" width="9" height="14" rx="2" />
          <rect x="110" y="78" width="9" height="20" rx="2" />
          <rect x="124" y="70" width="9" height="28" rx="2" />
          <rect x="138" y="62" width="9" height="36" rx="2" />
        </g>
        <Wallet x={316} y={44} label="내 자금" />
        <text x="366" y="32" textAnchor="middle" fill={GREEN} fontFamily="Space Grotesk" fontSize="14" fontWeight="700">
          + $8
        </text>
        <Coins path="M188 76 H302" color={GREEN} />
      </svg>
    ),
  },
  {
    caption: '발행 주식 + 기관차 레벨의 합만큼 매 턴 비용을 냅니다',
    svg: (
      <svg viewBox="0 0 440 150" className="block h-auto w-full">
        <Wallet x={22} y={44} label="내 자금" />
        <rect x="266" y="40" width="156" height="70" rx="12" fill="rgba(192,74,43,.08)" stroke="#eccabd" strokeWidth="1.5" />
        <text x="344" y="64" textAnchor="middle" fill={SUB} fontFamily="IBM Plex Sans KR" fontSize="12.5">
          주식 4 + 기관차 3
        </text>
        <text x="344" y="94" textAnchor="middle" fill={RED} fontFamily="Space Grotesk" fontSize="22" fontWeight="700">
          − $7
        </text>
        {[0, 0.73, 1.46].map((begin) => (
          <g key={begin}>
            <circle r="13" fill={RED} />
            <circle r="13" fill="none" stroke="#fff" strokeOpacity=".4" strokeWidth="1.5" />
            <text y="4.5" textAnchor="middle" fontFamily="Space Grotesk" fontSize="13" fontWeight="700" fill="#fff">
              $
            </text>
            <animateMotion path="M150 78 q40 34 96 34" dur="2.2s" begin={`${begin}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.72;1" dur="2.2s" begin={`${begin}s`} repeatCount="indefinite" />
          </g>
        ))}
      </svg>
    ),
  },
  {
    caption: '소득이 높을수록 매 턴 트랙이 몇 칸씩 내려갑니다',
    svg: (
      <svg viewBox="0 0 440 150" className="block h-auto w-full">
        <line x1="44" y1="86" x2="400" y2="86" stroke={LINE} strokeWidth="3" strokeLinecap="round" />
        <g>
          {[
            [90, '4'],
            [170, '6'],
            [250, '8'],
            [330, '10'],
          ].map(([x, label]) => (
            <g key={x}>
              <line x1={x} y1="80" x2={x} y2="92" stroke={TIE} strokeWidth="2" />
              <text x={x} y="112" textAnchor="middle" fill={FAINT} fontFamily="Space Grotesk" fontSize="11">
                {label}
              </text>
            </g>
          ))}
        </g>
        <circle cx="330" cy="86" r="13" fill="none" stroke="#eccabd" strokeWidth="2" strokeDasharray="3 3" />
        <g>
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 0;0 0;-80 0;-80 0"
            keyTimes="0;0.28;0.62;1"
            dur="3.2s"
            repeatCount="indefinite"
          />
          <circle cx="330" cy="86" r="14" fill={RED} />
        </g>
        <text x="290" y="46" textAnchor="middle" fill={RED} fontFamily="Space Grotesk" fontSize="13" fontWeight="700" opacity="0">
          −2 칸
          <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.3;0.5;0.62;1" dur="3.2s" repeatCount="indefinite" />
        </text>
        <text x="56" y="46" fill={SUB} fontFamily="IBM Plex Sans KR" fontSize="12">
          낮음
        </text>
        <text x="372" y="46" fill={SUB} fontFamily="IBM Plex Sans KR" fontSize="12">
          높음
        </text>
      </svg>
    ),
  },
  {
    caption: '주사위를 굴려 도시에 새로운 상품 큐브를 보충합니다',
    svg: (
      <svg viewBox="0 0 440 150" className="block h-auto w-full">
        <g>
          <animateTransform
            attributeName="transform"
            type="rotate"
            values="0 78 74;-9 78 74;7 78 74;-4 78 74;0 78 74;0 78 74"
            keyTimes="0;0.08;0.16;0.24;0.34;1"
            dur="2.8s"
            repeatCount="indefinite"
          />
          <rect x="34" y="52" width="44" height="44" rx="9" fill="#fff" stroke={RED} strokeWidth="2.5" />
          <circle cx="46" cy="64" r="3.4" fill={RED} />
          <circle cx="66" cy="84" r="3.4" fill={RED} />
          <rect x="86" y="52" width="44" height="44" rx="9" fill="#fff" stroke={RED} strokeWidth="2.5" />
          <circle cx="98" cy="64" r="3.4" fill={RED} />
          <circle cx="118" cy="64" r="3.4" fill={RED} />
          <circle cx="108" cy="74" r="3.4" fill={RED} />
          <circle cx="98" cy="84" r="3.4" fill={RED} />
        </g>
        {[218, 298, 378].map((cx) => (
          <circle key={cx} cx={cx} cy="84" r="17" fill="#fff" stroke={LINE} strokeWidth="2.5" />
        ))}
        {[
          { x: 210, fill: GREEN, t1: '0;0.42;0.5;0.95;1', t2: '0;0.42;0.54;0.6;1' },
          { x: 290, fill: RED, t1: '0;0.55;0.63;0.95;1', t2: '0;0.55;0.67;0.73;1' },
          { x: 370, fill: GREEN, t1: '0;0.68;0.76;0.95;1', t2: '0;0.68;0.8;0.86;1' },
        ].map((cube) => (
          <rect key={cube.x} x={cube.x} width="16" height="16" rx="3" fill={cube.fill}>
            <animate attributeName="opacity" values="0;0;1;1;1" keyTimes={cube.t1} dur="2.8s" repeatCount="indefinite" />
            <animate attributeName="y" values="38;38;90;76;76" keyTimes={cube.t2} dur="2.8s" repeatCount="indefinite" />
          </rect>
        ))}
        <text x="298" y="126" textAnchor="middle" fill={SUB} fontFamily="IBM Plex Sans KR" fontSize="12.5">
          새 상품 큐브가 도시에 보충됩니다
        </text>
      </svg>
    ),
  },
  {
    caption: '턴 마커가 한 칸 전진합니다 — 마지막 턴이 끝나면 점수를 계산합니다',
    svg: (
      <svg viewBox="0 0 440 150" className="block h-auto w-full">
        <line x1="44" y1="76" x2="396" y2="76" stroke={LINE} strokeWidth="3" strokeLinecap="round" />
        {[1, 2, 3, 4, 5, 6, 7].map((n, i) => {
          const x = 60 + i * 53;
          return (
            <g key={n}>
              <circle cx={x} cy="76" r="15" fill="#fff" stroke={LINE} strokeWidth="2" />
              <text x={x} y="82" textAnchor="middle" fill={SUB} fontFamily="Space Grotesk" fontSize="13" fontWeight="700">
                {n}
              </text>
            </g>
          );
        })}
        <g>
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 0;0 0;53 0;53 0"
            keyTimes="0;0.3;0.55;1"
            dur="3s"
            repeatCount="indefinite"
          />
          <circle cx="219" cy="76" r="17" fill="none" stroke={RED} strokeWidth="3" />
          <circle cx="219" cy="47" r="7" fill={RED} />
        </g>
        <text x="378" y="34" textAnchor="middle" fill={SUB} fontFamily="IBM Plex Sans KR" fontSize="12">
          마지막 턴 → 점수 계산
        </text>
        <text x="219" y="126" textAnchor="middle" fill={SUB} fontFamily="IBM Plex Sans KR" fontSize="12.5">
          턴 트랙에서 마커가 다음 칸으로
        </text>
      </svg>
    ),
  },
];

const turnPhases = [
  { t: '주식 발행', en: 'Issue Shares', d: '필요한 만큼 주식을 발행해 자금을 확보합니다. 많이 발행할수록 매 턴 지출이 무거워집니다.' },
  { t: '턴 순서 경매', en: 'Determine Player Order', d: '이번 라운드의 행동 순서를 입찰로 정합니다. 순서가 곧 우위입니다.' },
  { t: '특수 액션 선택', en: 'Select Actions', d: '7개의 특수 액션 중 하나를 골라 이번 턴의 결정적 이점을 손에 넣습니다.' },
  { t: '선로 건설', en: 'Build Track', d: '도시를 잇는 선로 타일을 놓습니다. 지형에 따라 건설 비용이 달라집니다.' },
  { t: '상품 이동', en: 'Move Goods', d: '기관차 레벨까지의 거리만큼 상품을 배송하고 소득을 올립니다. 두 번 진행합니다.' },
  { t: '소득 징수', en: 'Collect Income', d: '소득 트랙의 현재 위치만큼 돈을 받습니다.' },
  { t: '비용 지불', en: 'Pay Expenses', d: '발행 주식과 기관차 레벨의 합만큼 비용을 냅니다. 못 내면 소득이 깎입니다.' },
  { t: '소득 감소', en: 'Income Reduction', d: '소득이 높을수록 트랙이 일정 칸 내려갑니다. 과열을 경계하세요.' },
  { t: '상품 생산', en: 'Goods Growth', d: '주사위를 굴려 도시에 새로운 상품 큐브를 보충합니다.' },
  { t: '턴 마커 전진', en: 'Advance Turn Marker', d: '턴 마커를 한 칸 전진합니다. 마지막 턴이었다면 최종 점수를 계산해 승자를 가립니다.' },
] as const;

const mechanics = [
  { n: 'A — 빚', t: '주식은 빌린 돈이다', d: '발행한 주식은 매 턴 비용으로 돌아오고, 게임 종료 시 점수를 깎습니다. 언제 멈출지가 핵심입니다.' },
  { n: 'B — 거리', t: '기관차가 사정거리다', d: '기관차 레벨이 한 번에 배송할 수 있는 링크 수를 정합니다. 레벨을 올릴 타이밍을 노리세요.' },
  { n: 'C — 봉쇄', t: '선로는 길을 막는다', d: '내가 깐 선로는 상대의 우회로를 비싸게 만듭니다. 노선 설계는 곧 견제입니다.' },
] as const;

export default function GameplayPage() {
  const [openPhase, setOpenPhase] = useState<number | null>(null);
  const { reduce } = useEnterMotion();

  /* 다이어그램은 SMIL(<animate>/<animateMotion>)이라 CSS로 끌 수 없다.
     모션 최소화 설정이면 패널이 열리는 순간 SVG 애니메이션을 정지시켜
     첫 프레임(정지 화면)만 보여준다. */
  const diagramRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !reduce) return;
      node.querySelectorAll('svg').forEach((svg) => svg.pauseAnimations());
    },
    [reduce]
  );

  return (
    <div>
      {/* 헤더 */}
      <section className="mx-auto max-w-[1200px] px-[clamp(18px,5vw,56px)] pb-[clamp(24px,4vw,40px)] pt-[clamp(48px,7vw,92px)]">
        <div className="mb-4 font-display text-xs font-medium tracking-[0.16em] text-accent">
          GAMEPLAY / 게임플레이
        </div>
        <h1 className="mb-[18px] text-[clamp(30px,6vw,60px)] font-bold leading-[1.04] tracking-[-0.04em]">
          한 라운드는 이렇게 흐릅니다
        </h1>
        <p className="max-w-[620px] text-base leading-[1.8] text-foreground-secondary">
          매 라운드 열 개의 단계를 순서대로 진행합니다. 주식 발행부터 턴 마커
          전진까지 — 각 단계의 선택이 다음 단계의 자원과 압박을 결정합니다.
        </p>
      </section>

      {/* 턴 타임라인 아코디언 */}
      <section className="mx-auto max-w-[1200px] px-[clamp(18px,5vw,56px)] pb-[clamp(40px,6vw,72px)]">
        <div className="flex flex-col">
          {turnPhases.map((phase, i) => {
            const isOpen = openPhase === i;
            return (
              <div key={phase.en} className="border-t border-glass-border">
                {/* WAI-ARIA 아코디언 패턴: heading > button.
                    button 안에는 phrasing content(span)만 — h3/p/div는 유효하지 않다. */}
                <h3>
                  <button
                    type="button"
                    onClick={() => setOpenPhase(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    aria-controls={`phase-panel-${i}`}
                    className="grid w-full cursor-pointer grid-cols-[58px_1fr_auto] items-start gap-[clamp(12px,3vw,28px)] rounded-xl px-3 py-[22px] text-left transition-colors hover:bg-background-tertiary"
                  >
                    <span className="block text-right font-display text-[clamp(30px,5vw,48px)] font-semibold leading-[0.9] tracking-[-0.02em] text-[#d9d1c1]">
                      {i + 1}
                    </span>
                    <span className="block">
                      <span className="flex flex-wrap items-baseline gap-[10px]">
                        <span className="text-[clamp(19px,2.6vw,25px)] font-bold tracking-[-0.02em] text-foreground">
                          {phase.t}
                        </span>
                        <span className="font-display text-[12.5px] text-[#a39d91]">{phase.en}</span>
                      </span>
                      <span className="mt-[9px] block max-w-[680px] text-[15px] font-normal leading-[1.7] text-foreground-secondary">
                        {phase.d}
                      </span>
                    </span>
                    <span className="block self-center whitespace-nowrap font-display text-xs font-semibold text-accent">
                      {isOpen ? '닫기 ▲' : '애니메이션 ▾'}
                    </span>
                  </button>
                </h3>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={`phase-panel-${i}`}
                      initial={reduce ? false : { opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: reduce ? 0 : 0.3, ease: 'easeOut' }}
                      className="overflow-hidden"
                    >
                      <div ref={diagramRef} className="px-3 pb-[26px] pl-[clamp(12px,5vw,70px)]">
                        <div className="max-w-[560px] rounded-[14px] border border-[#ece7dd] bg-background-secondary px-[22px] py-5 shadow-glass">
                          <div className="mb-[14px] font-display text-[11px] font-medium tracking-[0.07em] text-[#a39d91]">
                            {diagrams[i].caption}
                          </div>
                          {diagrams[i].svg}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
          <div className="border-t border-glass-border" />
        </div>
      </section>

      {/* CORE MECHANICS */}
      <section className="border-t border-glass-border bg-background-tertiary">
        <div className="mx-auto max-w-[1200px] px-[clamp(18px,5vw,56px)] py-[clamp(48px,7vw,90px)]">
          <h2 className="mb-[38px] text-[clamp(24px,4vw,40px)] font-bold tracking-[-0.035em]">
            기억해야 할 세 가지 톱니
          </h2>
          <div className="grid grid-cols-1 gap-[18px] md:grid-cols-3">
            {mechanics.map((m) => (
              <div key={m.n} className="glass-card p-7">
                <div className="mb-4 font-display text-xs font-medium tracking-[0.1em] text-accent">
                  {m.n}
                </div>
                <h3 className="mb-3 text-xl font-bold tracking-[-0.02em] text-foreground">{m.t}</h3>
                <p className="text-[14.5px] leading-[1.78] text-foreground-secondary">{m.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
