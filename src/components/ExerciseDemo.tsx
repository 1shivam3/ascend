'use client';

import React, { useEffect, useRef } from 'react';
import { getDemoForExercise } from '@/lib/exercise-media';

/**
 * Animated exercise demos — original stick-figure SVG animations drawn
 * for ASCEND (see docs/exercise-media.md: third-party exercise imagery
 * could not be license-verified, so these are hand-built instead).
 *
 * Each demo is a set of joint keyframes; the renderer interpolates them
 * with SMIL. Every demo is a few hundred bytes — far under the 150 KB
 * budget — and renders only when a surface asks for it (the form-cues
 * sheet), so nothing is paid for exercises without a demo.
 */

type Pt = readonly [number, number];

interface Pose {
  head: Pt;
  neck: Pt;
  hip: Pt;
  elbowA: Pt;
  handA: Pt;
  elbowB?: Pt;
  handB?: Pt;
  kneeA: Pt;
  footA: Pt;
  kneeB?: Pt;
  footB?: Pt;
  /** Equipment weight center (barbell / plate / cable handle). */
  weight?: Pt;
}

type WeightKind = 'barbell' | 'dumbbells' | 'dumbbell-at-weight' | 'dumbbell-at-hand-b' | 'plate' | 'cable' | 'none';

interface DemoSpec {
  duration: number;
  weightKind: WeightKind;
  cableAnchor?: Pt;
  groundY?: number | null;
  equipment?: React.ReactNode;
  poses: Pose[];
}

const P = (x: number, y: number): Pt => [x, y];

/** Standing side-view figure, reused (with tweaks) by several demos. */
const STAND = {
  head: P(59, 25), neck: P(59, 35), hip: P(59, 63),
  kneeA: P(60, 82), footA: P(65, 100),
};

const DEMOS: Record<string, DemoSpec> = {
  squat: {
    duration: 2.4, weightKind: 'barbell',
    poses: [
      { head: P(58, 24), neck: P(58, 34), hip: P(58, 62), elbowA: P(63, 47), handA: P(50, 37), elbowB: P(60, 47), handB: P(47, 37), kneeA: P(59, 81), footA: P(64, 100), kneeB: P(55, 81), footB: P(59, 100), weight: P(58, 36) },
      { head: P(65, 37), neck: P(64, 45), hip: P(50, 73), elbowA: P(69, 57), handA: P(57, 48), elbowB: P(66, 57), handB: P(54, 48), kneeA: P(71, 83), footA: P(65, 100), kneeB: P(66, 85), footB: P(60, 100), weight: P(64, 47) },
    ],
  },
  'goblet-squat': {
    duration: 2.4, weightKind: 'dumbbell-at-weight',
    poses: [
      { head: P(58, 24), neck: P(58, 34), hip: P(58, 62), elbowA: P(68, 50), handA: P(66, 44), kneeA: P(59, 81), footA: P(64, 100), weight: P(67, 47) },
      { head: P(64, 37), neck: P(63, 45), hip: P(51, 73), elbowA: P(73, 60), handA: P(70, 55), kneeA: P(70, 83), footA: P(65, 100), weight: P(71, 58) },
    ],
  },
  'split-squat': {
    duration: 2.4, weightKind: 'dumbbells',
    poses: [
      { head: P(57, 24), neck: P(57, 34), hip: P(57, 60), elbowA: P(63, 48), handA: P(64, 64), elbowB: P(51, 48), handB: P(50, 64), kneeA: P(72, 76), footA: P(80, 100), kneeB: P(44, 78), footB: P(34, 98) },
      { head: P(57, 38), neck: P(57, 48), hip: P(57, 74), elbowA: P(63, 62), handA: P(64, 78), elbowB: P(51, 62), handB: P(50, 78), kneeA: P(78, 86), footA: P(82, 100), kneeB: P(38, 90), footB: P(30, 98) },
    ],
  },
  deadlift: {
    duration: 2.6, weightKind: 'barbell',
    poses: [
      { head: P(77, 42), neck: P(71, 48), hip: P(44, 57), elbowA: P(79, 64), handA: P(81, 80), kneeA: P(48, 77), footA: P(43, 100), weight: P(81, 86) },
      { head: P(58, 24), neck: P(58, 34), hip: P(57, 62), elbowA: P(63, 49), handA: P(64, 70), kneeA: P(58, 81), footA: P(55, 100), weight: P(64, 76) },
    ],
  },
  'romanian-deadlift': {
    duration: 2.6, weightKind: 'barbell',
    poses: [
      { head: P(58, 24), neck: P(58, 34), hip: P(57, 62), elbowA: P(63, 49), handA: P(64, 70), kneeA: P(58, 81), footA: P(55, 100), weight: P(64, 76) },
      { head: P(73, 36), neck: P(69, 42), hip: P(47, 57), elbowA: P(74, 58), handA: P(75, 74), kneeA: P(51, 78), footA: P(46, 100), weight: P(75, 80) },
    ],
  },
  'bench-press': {
    duration: 2.2, weightKind: 'barbell',
    equipment: (
      <g strokeWidth="3">
        <line x1="14" y1="76" x2="106" y2="76" />
        <line x1="94" y1="76" x2="94" y2="100" />
        <line x1="20" y1="76" x2="20" y2="100" />
      </g>
    ),
    poses: [
      { head: P(26, 66), neck: P(35, 69), hip: P(76, 69), elbowA: P(47, 57), handA: P(47, 40), kneeA: P(86, 82), footA: P(90, 100), weight: P(47, 36) },
      { head: P(26, 66), neck: P(35, 69), hip: P(76, 69), elbowA: P(55, 64), handA: P(47, 54), kneeA: P(86, 82), footA: P(90, 100), weight: P(47, 50) },
    ],
  },
  'db-bench-press': {
    duration: 2.2, weightKind: 'dumbbells',
    equipment: (
      <g strokeWidth="3">
        <line x1="14" y1="76" x2="106" y2="76" />
        <line x1="94" y1="76" x2="94" y2="100" />
        <line x1="20" y1="76" x2="20" y2="100" />
      </g>
    ),
    poses: [
      { head: P(26, 66), neck: P(35, 69), hip: P(76, 69), elbowA: P(40, 56), handA: P(44, 40), elbowB: P(56, 58), handB: P(52, 40), kneeA: P(86, 82), footA: P(90, 100) },
      { head: P(26, 66), neck: P(35, 69), hip: P(76, 69), elbowA: P(36, 64), handA: P(44, 54), elbowB: P(60, 64), handB: P(52, 54), kneeA: P(86, 82), footA: P(90, 100) },
    ],
  },
  'push-up': {
    duration: 2.2, weightKind: 'none',
    poses: [
      { head: P(28, 56), neck: P(37, 60), hip: P(79, 57), elbowA: P(33, 79), handA: P(33, 100), kneeA: P(97, 67), footA: P(111, 76) },
      { head: P(34, 66), neck: P(42, 70), hip: P(81, 66), elbowA: P(24, 84), handA: P(33, 100), kneeA: P(98, 74), footA: P(111, 80) },
    ],
  },
  dips: {
    duration: 2.2, weightKind: 'none',
    equipment: (
      <g strokeWidth="3">
        <line x1="38" y1="64" x2="80" y2="64" />
        <line x1="44" y1="64" x2="44" y2="100" />
        <line x1="74" y1="64" x2="74" y2="100" />
      </g>
    ),
    poses: [
      { head: P(59, 24), neck: P(59, 34), hip: P(59, 58), elbowA: P(50, 47), handA: P(59, 64), kneeA: P(63, 78), footA: P(67, 94) },
      { head: P(61, 34), neck: P(61, 44), hip: P(60, 68), elbowA: P(44, 56), handA: P(59, 64), kneeA: P(64, 86), footA: P(68, 100) },
    ],
  },
  'pull-up': {
    duration: 2.6, weightKind: 'none',
    equipment: (
      <g strokeWidth="3">
        <line x1="14" y1="14" x2="106" y2="14" />
        <line x1="18" y1="14" x2="18" y2="100" opacity="0.5" />
        <line x1="102" y1="14" x2="102" y2="100" opacity="0.5" />
      </g>
    ),
    poses: [
      { head: P(57, 38), neck: P(57, 46), hip: P(57, 72), elbowA: P(55, 30), handA: P(57, 14), kneeA: P(58, 87), footA: P(59, 101) },
      { head: P(53, 18), neck: P(54, 27), hip: P(55, 54), elbowA: P(41, 32), handA: P(57, 14), kneeA: P(56, 71), footA: P(57, 87) },
    ],
  },
  'barbell-row': {
    duration: 2.2, weightKind: 'barbell',
    poses: [
      { head: P(75, 40), neck: P(69, 46), hip: P(42, 55), elbowA: P(73, 62), handA: P(75, 82), kneeA: P(46, 75), footA: P(41, 100), weight: P(75, 88) },
      { head: P(75, 40), neck: P(69, 46), hip: P(42, 55), elbowA: P(57, 54), handA: P(65, 62), kneeA: P(46, 75), footA: P(41, 100), weight: P(65, 68) },
    ],
  },
  'db-row': {
    duration: 2.2, weightKind: 'dumbbell-at-hand-b',
    equipment: (
      <g strokeWidth="3">
        <line x1="24" y1="74" x2="86" y2="74" />
        <line x1="30" y1="74" x2="30" y2="100" />
      </g>
    ),
    poses: [
      { head: P(82, 44), neck: P(74, 50), hip: P(54, 54), elbowA: P(72, 61), handA: P(70, 74), elbowB: P(84, 60), handB: P(88, 78), kneeA: P(48, 74), footA: P(40, 80), kneeB: P(56, 80), footB: P(50, 100) },
      { head: P(82, 44), neck: P(74, 50), hip: P(54, 54), elbowA: P(72, 61), handA: P(70, 74), elbowB: P(76, 48), handB: P(82, 58), kneeA: P(48, 74), footA: P(40, 80), kneeB: P(56, 80), footB: P(50, 100) },
    ],
  },
  'lat-pulldown': {
    duration: 2.4, weightKind: 'barbell', cableAnchor: P(104, 12),
    equipment: (
      <g strokeWidth="3">
        <line x1="104" y1="10" x2="104" y2="100" />
        <line x1="64" y1="12" x2="104" y2="12" />
        <line x1="28" y1="80" x2="74" y2="80" />
        <line x1="34" y1="80" x2="34" y2="100" />
      </g>
    ),
    poses: [
      { head: P(56, 34), neck: P(56, 42), hip: P(56, 70), elbowA: P(50, 28), handA: P(64, 16), kneeA: P(70, 78), footA: P(74, 100), weight: P(64, 12) },
      { head: P(56, 36), neck: P(56, 44), hip: P(56, 70), elbowA: P(46, 46), handA: P(62, 40), kneeA: P(70, 78), footA: P(74, 100), weight: P(62, 36) },
    ],
  },
  'seated-row': {
    duration: 2.4, weightKind: 'cable', cableAnchor: P(106, 40),
    equipment: (
      <g strokeWidth="3">
        <line x1="106" y1="18" x2="106" y2="100" />
        <line x1="88" y1="80" x2="88" y2="98" />
        <line x1="28" y1="76" x2="72" y2="76" />
        <line x1="34" y1="76" x2="34" y2="100" />
      </g>
    ),
    poses: [
      { head: P(48, 32), neck: P(49, 40), hip: P(50, 68), elbowA: P(74, 50), handA: P(90, 54), kneeA: P(66, 76), footA: P(86, 84), weight: P(90, 54) },
      { head: P(46, 32), neck: P(47, 40), hip: P(48, 68), elbowA: P(52, 58), handA: P(66, 60), kneeA: P(66, 76), footA: P(86, 84), weight: P(66, 60) },
    ],
  },
  'overhead-press': {
    duration: 2.4, weightKind: 'barbell',
    poses: [
      { head: P(59, 25), neck: P(59, 35), hip: P(59, 63), elbowA: P(47, 46), handA: P(51, 38), elbowB: P(71, 46), handB: P(67, 38), kneeA: P(60, 82), footA: P(64, 100), kneeB: P(57, 82), footB: P(53, 100), weight: P(59, 36) },
      { head: P(59, 27), neck: P(59, 37), hip: P(59, 63), elbowA: P(50, 20), handA: P(53, 8), elbowB: P(68, 20), handB: P(65, 8), kneeA: P(60, 82), footA: P(64, 100), kneeB: P(57, 82), footB: P(53, 100), weight: P(59, 6) },
    ],
  },
  'lateral-raise': {
    duration: 2.4, weightKind: 'dumbbells',
    poses: [
      { head: P(60, 24), neck: P(60, 34), hip: P(60, 62), elbowA: P(45, 47), handA: P(41, 63), elbowB: P(75, 47), handB: P(79, 63), kneeA: P(55, 81), footA: P(51, 100), kneeB: P(65, 81), footB: P(69, 100) },
      { head: P(60, 24), neck: P(60, 34), hip: P(60, 62), elbowA: P(37, 37), handA: P(26, 35), elbowB: P(83, 37), handB: P(94, 35), kneeA: P(55, 81), footA: P(51, 100), kneeB: P(65, 81), footB: P(69, 100) },
    ],
  },
  'face-pull': {
    duration: 2.2, weightKind: 'cable', cableAnchor: P(106, 26),
    equipment: (
      <g strokeWidth="3">
        <line x1="106" y1="10" x2="106" y2="100" />
      </g>
    ),
    poses: [
      { head: P(56, 26), neck: P(56, 36), hip: P(57, 63), elbowA: P(72, 42), handA: P(88, 32), kneeA: P(58, 82), footA: P(62, 100), weight: P(88, 32) },
      { head: P(54, 26), neck: P(54, 36), hip: P(57, 63), elbowA: P(46, 40), handA: P(60, 28), kneeA: P(58, 82), footA: P(62, 100), weight: P(60, 28) },
    ],
  },
  curl: {
    duration: 2.0, weightKind: 'dumbbell-at-weight',
    poses: [
      { ...STAND, elbowA: P(63, 50), handA: P(68, 70), weight: P(68, 74) },
      { ...STAND, elbowA: P(63, 50), handA: P(71, 40), weight: P(71, 44) },
    ],
  },
  pushdown: {
    duration: 2.0, weightKind: 'cable', cableAnchor: P(102, 12),
    equipment: (
      <g strokeWidth="3">
        <line x1="102" y1="12" x2="102" y2="100" opacity="0.6" />
      </g>
    ),
    poses: [
      { head: P(54, 26), neck: P(54, 36), hip: P(55, 63), elbowA: P(60, 48), handA: P(74, 40), kneeA: P(56, 82), footA: P(60, 100), weight: P(74, 44) },
      { head: P(54, 26), neck: P(54, 36), hip: P(55, 63), elbowA: P(60, 48), handA: P(76, 68), kneeA: P(56, 82), footA: P(60, 100), weight: P(76, 72) },
    ],
  },
  'leg-press': {
    duration: 2.4, weightKind: 'plate',
    equipment: (
      <g strokeWidth="3">
        <line x1="60" y1="22" x2="104" y2="60" />
        <line x1="20" y1="78" x2="54" y2="78" />
        <line x1="26" y1="78" x2="26" y2="100" />
        <line x1="24" y1="78" x2="17" y2="52" />
      </g>
    ),
    poses: [
      { head: P(24, 50), neck: P(31, 56), hip: P(42, 70), elbowA: P(38, 66), handA: P(46, 74), kneeA: P(56, 54), footA: P(72, 40), kneeB: P(58, 60), footB: P(74, 46), weight: P(72, 40) },
      { head: P(24, 50), neck: P(31, 56), hip: P(42, 70), elbowA: P(38, 66), handA: P(46, 74), kneeA: P(64, 48), footA: P(84, 34), kneeB: P(66, 54), footB: P(86, 40), weight: P(84, 34) },
    ],
  },
  'leg-extension': {
    duration: 2.2, weightKind: 'plate',
    equipment: (
      <g strokeWidth="3">
        <line x1="24" y1="72" x2="64" y2="72" />
        <line x1="30" y1="72" x2="30" y2="100" />
        <line x1="64" y1="72" x2="70" y2="100" />
      </g>
    ),
    poses: [
      { head: P(42, 28), neck: P(43, 36), hip: P(44, 64), elbowA: P(50, 50), handA: P(54, 62), kneeA: P(60, 66), footA: P(62, 88), weight: P(62, 91) },
      { head: P(42, 28), neck: P(43, 36), hip: P(44, 64), elbowA: P(50, 50), handA: P(54, 62), kneeA: P(60, 66), footA: P(82, 62), weight: P(82, 65) },
    ],
  },
  'leg-curl': {
    duration: 2.2, weightKind: 'plate',
    equipment: (
      <g strokeWidth="3">
        <line x1="12" y1="72" x2="108" y2="72" />
        <line x1="20" y1="72" x2="20" y2="100" />
        <line x1="100" y1="72" x2="100" y2="100" />
      </g>
    ),
    poses: [
      { head: P(22, 60), neck: P(31, 64), hip: P(60, 64), elbowA: P(36, 68), handA: P(44, 71), kneeA: P(78, 66), footA: P(98, 68), weight: P(100, 71) },
      { head: P(22, 60), neck: P(31, 64), hip: P(60, 64), elbowA: P(36, 68), handA: P(44, 71), kneeA: P(78, 66), footA: P(82, 44), weight: P(84, 42) },
    ],
  },
  'hip-thrust': {
    duration: 2.4, weightKind: 'barbell',
    equipment: (
      <g strokeWidth="3">
        <line x1="10" y1="52" x2="46" y2="52" />
        <line x1="15" y1="52" x2="15" y2="100" />
      </g>
    ),
    poses: [
      { head: P(26, 44), neck: P(33, 48), hip: P(56, 72), elbowA: P(42, 60), handA: P(50, 68), kneeA: P(74, 66), footA: P(82, 100), weight: P(56, 68) },
      { head: P(25, 40), neck: P(32, 44), hip: P(56, 54), elbowA: P(41, 52), handA: P(49, 52), kneeA: P(73, 62), footA: P(82, 100), weight: P(56, 50) },
    ],
  },
  plank: {
    duration: 3.2, weightKind: 'none',
    poses: [
      { head: P(26, 60), neck: P(35, 64), hip: P(76, 62), elbowA: P(34, 84), handA: P(46, 98), kneeA: P(94, 72), footA: P(108, 80) },
      { head: P(26, 61), neck: P(35, 65), hip: P(76, 66), elbowA: P(34, 84), handA: P(46, 98), kneeA: P(94, 74), footA: P(108, 81) },
    ],
  },
};

// ── SMIL helpers ─────────────────────────────────────────────────────────────

function loopTimes(count: number): string {
  return Array.from({ length: count }, (_, i) => (i / (count - 1)).toFixed(3)).join(';');
}

function Anim({ attr, values, dur }: { attr: string; values: number[]; dur: number }) {
  const seq = [...values, values[0]];
  return (
    <animate
      attributeName={attr}
      values={seq.join(';')}
      keyTimes={loopTimes(seq.length)}
      dur={`${dur}s`}
      repeatCount="indefinite"
      calcMode="spline"
      keySplines={Array(seq.length - 1).fill('0.42 0 0.58 1').join(';')}
    />
  );
}

function Seg({
  poses, from, to, dur, faint = false,
}: {
  poses: Pose[];
  from: (p: Pose) => Pt | undefined;
  to: (p: Pose) => Pt | undefined;
  dur: number;
  faint?: boolean;
}) {
  if (!from(poses[0]) || !to(poses[0])) return null;
  return (
    <line
      x1={from(poses[0])![0]} y1={from(poses[0])![1]}
      x2={to(poses[0])![0]} y2={to(poses[0])![1]}
      strokeWidth="3.5" strokeLinecap="round" opacity={faint ? 0.4 : 1}
    >
      <Anim attr="x1" values={poses.map((p) => from(p)![0])} dur={dur} />
      <Anim attr="y1" values={poses.map((p) => from(p)![1])} dur={dur} />
      <Anim attr="x2" values={poses.map((p) => to(p)![0])} dur={dur} />
      <Anim attr="y2" values={poses.map((p) => to(p)![1])} dur={dur} />
    </line>
  );
}

function Mover({
  poses, pick, dur, children,
}: {
  poses: Pose[];
  pick: (p: Pose) => Pt | undefined;
  dur: number;
  children: React.ReactNode;
}) {
  if (!pick(poses[0])) return null;
  const xs = poses.map((p) => pick(p)![0]);
  const ys = poses.map((p) => pick(p)![1]);
  return (
    <g transform={`translate(${xs[0]} ${ys[0]})`}>
      <animateTransform
        attributeName="transform"
        type="translate"
        values={[...xs.map((x, i) => `${x} ${ys[i]}`), `${xs[0]} ${ys[0]}`].join(';')}
        keyTimes={loopTimes(xs.length + 1)}
        dur={`${dur}s`}
        repeatCount="indefinite"
        calcMode="spline"
        keySplines={Array(xs.length).fill('0.42 0 0.58 1').join(';')}
      />
      {children}
    </g>
  );
}

function DumbbellShape() {
  return (
    <g fill="currentColor">
      <rect x="-8" y="-2" width="16" height="4" rx="2" />
      <rect x="-10" y="-5" width="4" height="10" rx="1.5" />
      <rect x="6" y="-5" width="4" height="10" rx="1.5" />
    </g>
  );
}

function Figure({ spec }: { spec: DemoSpec }) {
  const { poses, duration: dur } = spec;
  const neck = (p: Pose) => p.neck;
  const hip = (p: Pose) => p.hip;
  return (
    <g stroke="currentColor" fill="none">
      {/* Far-side limbs (faint) */}
      <Seg poses={poses} from={neck} to={(p) => p.elbowB} dur={dur} faint />
      <Seg poses={poses} from={(p) => p.elbowB} to={(p) => p.handB} dur={dur} faint />
      <Seg poses={poses} from={hip} to={(p) => p.kneeB} dur={dur} faint />
      <Seg poses={poses} from={(p) => p.kneeB} to={(p) => p.footB} dur={dur} faint />
      {/* Torso */}
      <Seg poses={poses} from={neck} to={hip} dur={dur} />
      {/* Near limbs */}
      <Seg poses={poses} from={neck} to={(p) => p.elbowA} dur={dur} />
      <Seg poses={poses} from={(p) => p.elbowA} to={(p) => p.handA} dur={dur} />
      <Seg poses={poses} from={hip} to={(p) => p.kneeA} dur={dur} />
      <Seg poses={poses} from={(p) => p.kneeA} to={(p) => p.footA} dur={dur} />
      {/* Head */}
      <circle cx={poses[0].head[0]} cy={poses[0].head[1]} r="5.5" strokeWidth="3.5">
        <Anim attr="cx" values={poses.map((p) => p.head[0])} dur={dur} />
        <Anim attr="cy" values={poses.map((p) => p.head[1])} dur={dur} />
      </circle>
    </g>
  );
}

function Weight({ spec }: { spec: DemoSpec }) {
  const { poses, duration: dur, weightKind, cableAnchor } = spec;
  if (weightKind === 'none') return null;
  return (
    <g className="text-accent" stroke="currentColor" fill="none">
      {cableAnchor && (
        <line
          x1={cableAnchor[0]} y1={cableAnchor[1]}
          x2={poses[0].weight?.[0]} y2={poses[0].weight?.[1]}
          strokeWidth="1.8" opacity="0.75"
        >
          <Anim attr="x2" values={poses.map((p) => p.weight?.[0] ?? 0)} dur={dur} />
          <Anim attr="y2" values={poses.map((p) => p.weight?.[1] ?? 0)} dur={dur} />
        </line>
      )}
      {weightKind === 'barbell' && (
        <Mover poses={poses} pick={(p) => p.weight} dur={dur}>
          <line x1="-27" y1="0" x2="27" y2="0" strokeWidth="3.5" strokeLinecap="round" />
          <rect x="-31" y="-8" width="5" height="16" rx="1.5" fill="currentColor" stroke="none" />
          <rect x="26" y="-8" width="5" height="16" rx="1.5" fill="currentColor" stroke="none" />
          <rect x="-25" y="-5.5" width="3.5" height="11" rx="1" fill="currentColor" stroke="none" />
          <rect x="21.5" y="-5.5" width="3.5" height="11" rx="1" fill="currentColor" stroke="none" />
        </Mover>
      )}
      {weightKind === 'plate' && (
        <Mover poses={poses} pick={(p) => p.weight} dur={dur}>
          <rect x="-3.5" y="-11" width="7" height="22" rx="2.5" fill="currentColor" stroke="none" />
        </Mover>
      )}
      {weightKind === 'dumbbell-at-weight' && (
        <Mover poses={poses} pick={(p) => p.weight} dur={dur}>
          <DumbbellShape />
        </Mover>
      )}
      {(weightKind === 'dumbbells' || weightKind === 'dumbbell-at-hand-b') && (
        <>
          {weightKind === 'dumbbells' && (
            <Mover poses={poses} pick={(p) => p.handA} dur={dur}>
              <DumbbellShape />
            </Mover>
          )}
          <Mover poses={poses} pick={(p) => p.handB ?? p.handA} dur={dur}>
            <DumbbellShape />
          </Mover>
        </>
      )}
      {weightKind === 'cable' && (
        <Mover poses={poses} pick={(p) => p.weight} dur={dur}>
          <circle r="3.5" fill="currentColor" stroke="none" />
        </Mover>
      )}
    </g>
  );
}

/**
 * The animated demo for an exercise, or nothing when no demo exists.
 * Surfaces must render this only when it returns non-null content —
 * check `getDemoForExercise(name)` before offering the affordance.
 */
export default function ExerciseDemo({ name }: { name: string }) {
  const entry = getDemoForExercise(name);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    // Respect reduced-motion: freeze the animation on its first frame.
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      (svgRef.current as unknown as { pauseAnimations?: () => void } | null)?.pauseAnimations?.();
    }
  }, []);

  if (!entry) return null;
  const spec = DEMOS[entry.demoId];
  if (!spec) return null;
  const groundY = spec.groundY === undefined ? 102 : spec.groundY;

  return (
    <div className="rounded-xl bg-bg-secondary border border-border/60 px-2 py-1">
      <svg
        ref={svgRef}
        viewBox="0 0 120 112"
        className="w-full h-36"
        role="img"
        aria-label={`Animated demonstration: ${name}`}
      >
        {groundY !== null && (
          <line x1="6" y1={groundY} x2="114" y2={groundY} className="text-border" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        )}
        <g className="text-text-muted" stroke="currentColor" fill="none" strokeLinecap="round">
          {spec.equipment}
        </g>
        <g className="text-text-secondary">
          <Figure spec={spec} />
        </g>
        <Weight spec={spec} />
      </svg>
    </div>
  );
}

/** Demo ids that actually have artwork — used by tests/manifest checks. */
export const DEMO_IDS_WITH_ARTWORK: string[] = Object.keys(DEMOS);
