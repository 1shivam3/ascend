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
  const platesConfig = unit === 'kg' ? METRIC_PLATES : IMPERIAL_PLATES;

  if (targetWeight <= barWeight) {
    return {
      targetWeight,
      barWeight,
      weightPerSide: 0,
      totalLoadedWeight: barWeight,
      plates: [],
      remainder: 0,
      unit,
    };
  }

  let sideWeightRemaining = (targetWeight - barWeight) / 2;
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
  const totalLoaded = Number((barWeight + loadedPerSide * 2).toFixed(2));
  const remainder = Number((targetWeight - totalLoaded).toFixed(2));

  return {
    targetWeight,
    barWeight,
    weightPerSide: loadedPerSide,
    totalLoadedWeight: totalLoaded,
    plates: resultPlates,
    remainder,
    unit,
  };
}
