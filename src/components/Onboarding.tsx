'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { ChevronRight } from 'lucide-react';

export default function OnboardingScreen() {
  const { setProfile } = useStore();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [bodyweight, setBodyweight] = useState('');
  const [unit, setUnit] = useState<'kg' | 'lbs'>('kg');

  const handleComplete = () => {
    const bw = parseFloat(bodyweight);
    if (!name.trim() || !bw || bw <= 0) return;

    const bodyweightKg = unit === 'lbs' ? bw * 0.453592 : bw;
    const bodyweightLbs = unit === 'kg' ? bw * 2.20462 : bw;

    setProfile({
      id: crypto.randomUUID(),
      name: name.trim(),
      gender,
      bodyweightKg: Math.round(bodyweightKg * 10) / 10,
      bodyweightLbs: Math.round(bodyweightLbs * 10) / 10,
      unit,
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">
            ASCEND
          </h1>
          <p className="text-text-muted text-sm mt-2 font-mono tracking-wide">
            TRACK YOUR LIFTS. KNOW YOUR LEVEL.
          </p>
        </div>

        {step === 0 && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <label className="section-title block mb-2">Your Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                className="w-full"
                autoFocus
                maxLength={24}
              />
            </div>
            <button
              onClick={() => name.trim() && setStep(1)}
              disabled={!name.trim()}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Continue
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <label className="section-title block mb-3">Gender</label>
              <p className="text-text-muted text-xs mb-4">
                Used to calculate accurate strength levels against established standards.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {(['male', 'female'] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setGender(g)}
                    className={`py-3 rounded-lg text-sm font-medium transition-all border ${
                      gender === g
                        ? 'bg-accent/10 border-accent/40 text-accent'
                        : 'bg-bg-elevated border-border text-text-secondary hover:border-border'
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

        {step === 2 && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <label className="section-title block mb-2">Bodyweight</label>
              <p className="text-text-muted text-xs mb-4">
                Your lift levels are calculated as a ratio of your bodyweight.
              </p>
              <div className="flex gap-3">
                <input
                  type="number"
                  value={bodyweight}
                  onChange={(e) => setBodyweight(e.target.value)}
                  placeholder={unit === 'kg' ? '80' : '175'}
                  className="flex-1"
                  autoFocus
                  min={20}
                  max={500}
                />
                <div className="flex bg-bg-elevated rounded-lg border border-border overflow-hidden">
                  {(['kg', 'lbs'] as const).map((u) => (
                    <button
                      key={u}
                      onClick={() => setUnit(u)}
                      className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                        unit === u
                          ? 'bg-accent/15 text-accent'
                          : 'text-text-muted hover:text-text-secondary'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={handleComplete}
              disabled={!bodyweight || parseFloat(bodyweight) <= 0}
              className="btn-primary w-full disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Start Tracking
            </button>
          </div>
        )}

        {/* Step indicators */}
        <div className="flex justify-center gap-2 mt-8">
          {[0, 1, 2].map((s) => (
            <div
              key={s}
              className={`h-1 rounded-full transition-all duration-300 ${
                s === step ? 'w-6 bg-accent' : s < step ? 'w-2 bg-accent/40' : 'w-2 bg-border'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
