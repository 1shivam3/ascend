export interface PlateInfo {
  weight: number;
  count: number; // Count PER SIDE
  color: string;
  textColor: string;
  heightRatio: number; // for visual height on barbell
}

export interface PlateCalculationResult {
  targetWeight: number;
  barWeight: number;
  weightPerSide: number;
  totalLoadedWeight: number;
  plates: PlateInfo[];
  remainder: number;
  unit: 'kg' | 'lbs';
}

export interface BarbellPreset {
  id: string;
  name: string;
  shortName: string;
  weightKg: number;
  weightLbs: number;
  description: string;
}

export const BARBELL_PRESETS: BarbellPreset[] = [
  {
    id: 'olympic_standard',
    name: "Olympic Standard Barbell",
    shortName: "Olympic",
    weightKg: 20,
    weightLbs: 45,
    description: "Standard Men's 20kg / 45lb barbell",
  },
  {
    id: 'olympic_womens',
    name: "Women's Olympic Barbell",
    shortName: "Women's",
    weightKg: 15,
    weightLbs: 35,
    description: "Standard Women's 15kg / 35lb bar",
  },
  {
    id: 'trap_bar',
    name: "Trap / Hex Bar",
    shortName: "Trap Bar",
    weightKg: 25,
    weightLbs: 55,
    description: "Hex deadlift bar (25kg / 55lb)",
  },
  {
    id: 'smith_machine',
    name: "Smith Machine Bar",
    shortName: "Smith Bar",
    weightKg: 11,
    weightLbs: 25,
    description: "Counterbalanced bar (11kg / 25lb)",
  },
  {
    id: 'ez_curl',
    name: "EZ-Curl Bar",
    shortName: "EZ-Curl",
    weightKg: 10,
    weightLbs: 22,
    description: "Cambered bar (10kg / 22lb)",
  },
];

// Standard IPF Olympic plate colors & specs
const METRIC_PLATES = [
  { weight: 25, color: '#ef4444', textColor: '#ffffff', heightRatio: 1.0 }, // Red
  { weight: 20, color: '#3b82f6', textColor: '#ffffff', heightRatio: 0.95 }, // Blue
  { weight: 15, color: '#eab308', textColor: '#000000', heightRatio: 0.88 }, // Yellow
  { weight: 10, color: '#10b981', textColor: '#ffffff', heightRatio: 0.78 }, // Green
  { weight: 5, color: '#f8fafc', textColor: '#000000', heightRatio: 0.65 }, // White
  { weight: 2.5, color: '#1e293b', textColor: '#ffffff', heightRatio: 0.55 }, // Black
  { weight: 1.25, color: '#94a3b8', textColor: '#000000', heightRatio: 0.45 }, // Silver
  { weight: 0.5, color: '#64748b', textColor: '#ffffff', heightRatio: 0.38 }, // Micro
];

const IMPERIAL_PLATES = [
  { weight: 45, color: '#3b82f6', textColor: '#ffffff', heightRatio: 1.0 },
  { weight: 35, color: '#eab308', textColor: '#000000', heightRatio: 0.9 },
  { weight: 25, color: '#10b981', textColor: '#ffffff', heightRatio: 0.8 },
  { weight: 10, color: '#f8fafc', textColor: '#000000', heightRatio: 0.65 },
  { weight: 5, color: '#1e293b', textColor: '#ffffff', heightRatio: 0.55 },
  { weight: 2.5, color: '#94a3b8', textColor: '#000000', heightRatio: 0.45 },
];

export function calculatePlates(
  targetWeight: number,
  barWeight: number = 20,
  unit: 'kg' | 'lbs' = 'kg'
): PlateCalculationResult {
  let effectiveBar = typeof barWeight === 'number' ? barWeight : (typeof unit === 'number' ? unit : 20);
  let effectiveUnit: 'kg' | 'lbs' = typeof unit === 'string' && (unit === 'kg' || unit === 'lbs') ? unit : (typeof barWeight === 'string' && (barWeight === 'kg' || barWeight === 'lbs') ? barWeight : 'kg');
  if (isNaN(effectiveBar) || effectiveBar <= 0) effectiveBar = 20;

  const platesConfig = effectiveUnit === 'kg' ? METRIC_PLATES : IMPERIAL_PLATES;

  if (targetWeight <= effectiveBar) {
    return {
      targetWeight,
      barWeight: effectiveBar,
      weightPerSide: 0,
      totalLoadedWeight: effectiveBar,
      plates: [],
      remainder: 0,
      unit: effectiveUnit,
    };
  }

  let sideWeightRemaining = (targetWeight - effectiveBar) / 2;
  const resultPlates: PlateInfo[] = [];

  for (const plate of platesConfig) {
    if (sideWeightRemaining >= plate.weight) {
      const count = Math.floor(sideWeightRemaining / plate.weight);
      if (count > 0) {
        resultPlates.push({
          weight: plate.weight,
          count,
          color: plate.color,
          textColor: plate.textColor,
          heightRatio: plate.heightRatio,
        });
        sideWeightRemaining = Number((sideWeightRemaining - count * plate.weight).toFixed(2));
      }
    }
  }

  const loadedPerSide = resultPlates.reduce((acc, p) => acc + p.weight * p.count, 0);
  const totalLoaded = Number((effectiveBar + loadedPerSide * 2).toFixed(2));
  const remainder = Number((targetWeight - totalLoaded).toFixed(2));

  return {
    targetWeight,
    barWeight: effectiveBar,
    weightPerSide: loadedPerSide,
    totalLoadedWeight: totalLoaded,
    plates: resultPlates,
    remainder,
    unit: effectiveUnit,
  };
}

export interface WarmupSet {
  label: string;
  weight: number;
  reps: string;
  pct: string;
}

export function generateWarmupRamp(
  targetWeight: number,
  unit: 'kg' | 'lbs' = 'kg',
  barWeight: number = 20
): WarmupSet[] {
  if (targetWeight <= barWeight) return [];
  const step = unit === 'kg' ? 2.5 : 5;
  const roundToStep = (wt: number) => Math.max(barWeight, Math.round(wt / step) * step);
  return [
    { label: 'Set 1 (Empty Bar)', weight: barWeight, reps: '10 reps', pct: 'Warmup' },
    { label: 'Set 2 (50%)', weight: roundToStep(targetWeight * 0.5), reps: '5 reps', pct: '50%' },
    { label: 'Set 3 (70%)', weight: roundToStep(targetWeight * 0.7), reps: '3 reps', pct: '70%' },
    { label: 'Set 4 (85%)', weight: roundToStep(targetWeight * 0.85), reps: '1-2 reps', pct: '85%' },
    { label: 'Work Set (100%)', weight: targetWeight, reps: 'Work reps', pct: '100%' },
  ];
}
