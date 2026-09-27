export type Gender = 'male' | 'female';
export type Unit = 'kg' | 'lbs';

export interface UserProfile {
  id: string;
  name: string;
  gender: Gender;
  bodyweightKg: number;
  bodyweightLbs: number;
  unit: Unit;
  createdAt: string;
}

export interface PersonalRecord {
  id: string;
  exercise: string;
  weightKg: number;
  weightLbs: number;
  reps: number;
  oneRepMax: number;
  date: string;
  notes?: string;
}

export interface WorkoutSet {
  reps: number;
  weight: number;
  unit: Unit;
}

export interface WorkoutExercise {
  name: string;
  sets: WorkoutSet[];
}

export interface WorkoutEntry {
  id: string;
  date: string;
  exercises: WorkoutExercise[];
}

export interface FoodItem {
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  quantity?: number;
  unit?: string;
}

export interface MealEntry {
  id: string;
  date: string;
  name: string;
  foods: FoodItem[];
}

export interface MacroTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface LiftLevel {
  exercise: string;
  level: number;
  title: string;
  ratio: number;
  category: string;
}

export interface OverallLevel {
  level: number;
  title: string;
  averageRatio: number;
}
