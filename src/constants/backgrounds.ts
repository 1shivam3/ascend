export type BackgroundThemeId =
  | 'AWAKENING'
  | 'ASCENSION'
  | 'IRON_FORGE'
  | 'VOID'
  | 'SUMMIT'
  | 'NEON_DISTRICT'
  | 'STORM'
  | 'ECLIPSE';

export interface BackgroundThemeConfig {
  id: BackgroundThemeId;
  name: string;
  usage: string;
  primaryColor: string;
  secondaryColor: string;
  ambientGlow: string;
  defaultIntensity: number; // 0.05 - 1.0
  gradientStops: [string, string, string];
  hasParticles?: boolean;
}

export const BACKGROUND_THEMES: Record<BackgroundThemeId, BackgroundThemeConfig> = {
  AWAKENING: {
    id: 'AWAKENING',
    name: 'Awakening',
    usage: 'Onboarding & initialization moments',
    primaryColor: '#00E5FF',
    secondaryColor: '#0070F3',
    ambientGlow: 'rgba(0, 229, 255, 0.08)',
    defaultIntensity: 0.15,
    gradientStops: ['#040507', '#08090C', '#0c0e14'],
    hasParticles: true,
  },
  ASCENSION: {
    id: 'ASCENSION',
    name: 'Ascension',
    usage: 'Home Command Center',
    primaryColor: '#00E5FF',
    secondaryColor: '#0070F3',
    ambientGlow: 'rgba(0, 229, 255, 0.06)',
    defaultIntensity: 0.18,
    gradientStops: ['#06080B', '#08090C', '#0E131C'],
  },
  IRON_FORGE: {
    id: 'IRON_FORGE',
    name: 'Iron Forge',
    usage: 'Strength workouts & active logging',
    primaryColor: '#F59E0B',
    secondaryColor: '#B45309',
    ambientGlow: 'rgba(245, 158, 11, 0.06)',
    defaultIntensity: 0.12,
    gradientStops: ['#0A0908', '#100D0B', '#161310'],
    hasParticles: true,
  },
  VOID: {
    id: 'VOID',
    name: 'Void',
    usage: 'Heavy strength & advanced mastery',
    primaryColor: '#00E5FF',
    secondaryColor: '#002B49',
    ambientGlow: 'rgba(0, 229, 255, 0.04)',
    defaultIntensity: 0.15,
    gradientStops: ['#020305', '#050608', '#090B10'],
  },
  SUMMIT: {
    id: 'SUMMIT',
    name: 'Summit',
    usage: 'Progress & milestone journey',
    primaryColor: '#38BDF8',
    secondaryColor: '#0284C7',
    ambientGlow: 'rgba(56, 189, 248, 0.07)',
    defaultIntensity: 0.2,
    gradientStops: ['#070A10', '#090F18', '#0F1A2A'],
  },
  NEON_DISTRICT: {
    id: 'NEON_DISTRICT',
    name: 'Neon District',
    usage: 'Social, squads & community',
    primaryColor: '#00E5FF',
    secondaryColor: '#6366F1',
    ambientGlow: 'rgba(99, 102, 241, 0.06)',
    defaultIntensity: 0.15,
    gradientStops: ['#08080E', '#0D0E17', '#131522'],
  },
  STORM: {
    id: 'STORM',
    name: 'Storm',
    usage: 'Challenges, difficult sessions, missed quest restart',
    primaryColor: '#94A3B8',
    secondaryColor: '#475569',
    ambientGlow: 'rgba(148, 163, 184, 0.05)',
    defaultIntensity: 0.18,
    gradientStops: ['#07080B', '#0B0D12', '#10131B'],
  },
  ECLIPSE: {
    id: 'ECLIPSE',
    name: 'Eclipse',
    usage: 'Rank-up, major level-up, breakthrough achievements',
    primaryColor: '#00E5FF',
    secondaryColor: '#F59E0B',
    ambientGlow: 'rgba(0, 229, 255, 0.15)',
    defaultIntensity: 0.8,
    gradientStops: ['#020203', '#06070A', '#0D1017'],
  },
};
