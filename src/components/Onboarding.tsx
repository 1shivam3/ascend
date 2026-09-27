'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { ChevronRight, Dumbbell, ArrowRight } from 'lucide-react';
import { calculateOneRepMax } from '@/lib/strength-standards';
import { PersonalRecord } from '@/lib/types';

export default function OnboardingScreen() {
  const { setProfile, addMultiplePRs } = useStore();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [bodyweight, setBodyweight] = useState('');
  const [unit, setUnit] = useState<'kg' | 'lbs'>('kg');

  // Baseline major lifts
  const [benchWeight, setBenchWeight] = useState('');
  const [benchReps, setBenchReps] = useState('1');
  const [squatWeight, setSquatWeight] = useState('');
  const [squatReps, setSquatReps] = useState('1');
  const [deadliftWeight, setDeadliftWeight] = useState('');
  const [deadliftReps, setDeadliftReps] = useState('1');
  const [ohpWeight, setOhpWeight] = useState('');
  const [ohpReps, setOhpReps] = useState('1');

  const handleFinish = (skipLifts = false) => {
    const bw = parseFloat(bodyweight);
    if (!name.trim() || !bw || bw <= 0) return;

    const bodyweightKg = unit === 'lbs' ? bw * 0.453592 : bw;
    const bodyweightLbs = unit === 'kg' ? bw * 2.20462 : bw;

    const profileData = {
      id: crypto.randomUUID(),
      name: name.trim(),
      gender,
      bodyweightKg: Math.round(bodyweightKg * 10) / 10,
      bodyweightLbs: Math.round(bodyweightLbs * 10) / 10,
      unit,
      createdAt: new Date().toISOString(),
    };

    setProfile(profileData);

    if (!skipLifts) {
      const initialPRs: PersonalRecord[] = [];
      const today = new Date().toISOString().split('T')[0];

      const checkAndAdd = (exercise: string, wStr: string, rStr: string) => {
        const w = parseFloat(wStr);
        const r = parseInt(rStr, 10) || 1;
        if (!isNaN(w) && w > 0) {
          const wKg = unit === 'lbs' ? w * 0.453592 : w;
          const wLbs = unit === 'kg' ? w * 2.20462 : w;
          const oneRepMaxKg = calculateOneRepMax(wKg, r);

          initialPRs.push({
            id: crypto.randomUUID(),
            exercise,
            weightKg: Math.round(wKg * 10) / 10,
            weightLbs: Math.round(wLbs * 10) / 10,
            reps: r,
            oneRepMax: Math.round(oneRepMaxKg * 10) / 10,
            date: today,
            notes: 'Baseline calibration'
          });
        }
      };

      checkAndAdd('Bench Press', benchWeight, benchReps);
      checkAndAdd('Squat', squatWeight, squatReps);
      checkAndAdd('Deadlift', deadliftWeight, deadliftReps);
      checkAndAdd('Overhead Press', ohpWeight, ohpReps);

      if (initialPRs.length > 0) {
        addMultiplePRs(initialPRs);
      }
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Logo Header */}
        <div className="text-center mb-8">
          <div className="inline-flex p-3 rounded-2xl bg-bg-secondary border border-border mb-3 text-accent shadow-sm">
            <Dumbbell className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-text-primary">
            ASCEND
          </h1>
          <p className="text-text-muted text-xs mt-1 font-mono tracking-widest uppercase">
            CALIBRATE YOUR STRENGTH LEVEL
          </p>
        </div>

        {/* Step 0: Name */}
        {step === 0 && (
          <div className="space-y-5 animate-fade-in card">
            <div>
              <label className="section-title block mb-2">YOUR ATHLETE NAME</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                className="w-full text-base"
                autoFocus
                maxLength={24}
              />
            </div>
            <button
              onClick={() => name.trim() && setStep(1)}
              disabled={!name.trim()}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40"
            >
              Continue
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Step 1: Gender */}
        {step === 1 && (
          <div className="space-y-5 animate-fade-in card">
            <div>
              <label className="section-title block mb-2">BIOLOGICAL GENDER</label>
              <p className="text-text-muted text-xs mb-3">
                Used to evaluate your lift ratio against calibrated strength standards.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {(['male', 'female'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    className={`py-3.5 rounded-lg text-sm font-semibold transition-all border ${
                      gender === g
                        ? 'bg-accent/15 border-accent text-accent shadow-sm'
                        : 'bg-bg-elevated border-border text-text-secondary hover:border-border-hover'
                    }`}
                  >
                    {g === 'male' ? 'Male' : 'Female'}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => setStep(2)}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              Continue
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Step 2: Bodyweight */}
        {step === 2 && (
          <div className="space-y-5 animate-fade-in card">
            <div>
              <label className="section-title block mb-2">BODYWEIGHT</label>
              <p className="text-text-muted text-xs mb-3">
                Your lift levels are scored as a ratio of your bodyweight.
              </p>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.5"
                  value={bodyweight}
                  onChange={(e) => setBodyweight(e.target.value)}
                  placeholder={unit === 'kg' ? '80' : '175'}
                  className="flex-1 text-base"
                  autoFocus
                  min={20}
                  max={500}
                />
                <div className="flex bg-bg-secondary rounded-lg border border-border overflow-hidden">
                  {(['kg', 'lbs'] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUnit(u)}
                      className={`px-3 py-2 text-xs font-mono font-bold transition-colors ${
                        unit === u
                          ? 'bg-accent text-bg-primary'
                          : 'text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                if (bodyweight && parseFloat(bodyweight) > 0) {
                  setStep(3);
                }
              }}
              disabled={!bodyweight || parseFloat(bodyweight) <= 0}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40"
            >
              Continue to Lift Calibration
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Step 3: Major Lifts Calibration */}
        {step === 3 && (
          <div className="space-y-4 animate-fade-in card max-h-[75vh] overflow-y-auto">
            <div>
              <label className="section-title block mb-1">MAJOR LIFTS CALIBRATION</label>
              <p className="text-text-muted text-xs">
                Enter your best set or 1RM. Leave empty if unsure — you can update anytime.
              </p>
            </div>

            {/* Bench Press */}
            <div className="p-3 rounded-lg bg-bg-secondary/70 border border-border/70 space-y-2">
              <span className="text-xs font-bold text-text-primary font-mono block">BENCH PRESS</span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="0.5"
                  placeholder={`Weight (${unit})`}
                  value={benchWeight}
                  onChange={(e) => setBenchWeight(e.target.value)}
                  className="text-xs py-2"
                />
                <input
                  type="number"
                  min="1"
                  placeholder="Reps (e.g. 1, 5)"
                  value={benchReps}
                  onChange={(e) => setBenchReps(e.target.value)}
                  className="text-xs py-2"
                />
              </div>
            </div>

            {/* Squat */}
            <div className="p-3 rounded-lg bg-bg-secondary/70 border border-border/70 space-y-2">
              <span className="text-xs font-bold text-text-primary font-mono block">SQUAT</span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="0.5"
                  placeholder={`Weight (${unit})`}
                  value={squatWeight}
                  onChange={(e) => setSquatWeight(e.target.value)}
                  className="text-xs py-2"
                />
                <input
                  type="number"
                  min="1"
                  placeholder="Reps (e.g. 1, 5)"
                  value={squatReps}
                  onChange={(e) => setSquatReps(e.target.value)}
                  className="text-xs py-2"
                />
              </div>
            </div>

            {/* Deadlift */}
            <div className="p-3 rounded-lg bg-bg-secondary/70 border border-border/70 space-y-2">
              <span className="text-xs font-bold text-text-primary font-mono block">DEADLIFT</span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="0.5"
                  placeholder={`Weight (${unit})`}
                  value={deadliftWeight}
                  onChange={(e) => setDeadliftWeight(e.target.value)}
                  className="text-xs py-2"
                />
                <input
                  type="number"
                  min="1"
                  placeholder="Reps (e.g. 1, 5)"
                  value={deadliftReps}
                  onChange={(e) => setDeadliftReps(e.target.value)}
                  className="text-xs py-2"
                />
              </div>
            </div>

            {/* Overhead Press */}
            <div className="p-3 rounded-lg bg-bg-secondary/70 border border-border/70 space-y-2">
              <span className="text-xs font-bold text-text-primary font-mono block">OVERHEAD PRESS</span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="0.5"
                  placeholder={`Weight (${unit})`}
                  value={ohpWeight}
                  onChange={(e) => setOhpWeight(e.target.value)}
                  className="text-xs py-2"
                />
                <input
                  type="number"
                  min="1"
                  placeholder="Reps (e.g. 1, 5)"
                  value={ohpReps}
                  onChange={(e) => setOhpReps(e.target.value)}
                  className="text-xs py-2"
                />
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={() => handleFinish(false)}
                className="btn-primary w-full flex items-center justify-center gap-2 font-mono text-xs uppercase"
              >
                Set Level & Enter ASCEND
                <ArrowRight size={14} />
              </button>
              <button
                onClick={() => handleFinish(true)}
                className="btn-ghost w-full text-xs text-text-muted hover:text-text-secondary"
              >
                Skip lift input for now
              </button>
            </div>
          </div>
        )}

        {/* Step indicators */}
        <div className="flex justify-center gap-1.5 mt-6">
          {[0, 1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                s === step
                  ? 'w-6 bg-accent'
                  : s < step
                  ? 'w-2 bg-accent/40'
                  : 'w-2 bg-border'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
