'use client';

import React, { useState, useMemo, useRef } from 'react';
import { useModalA11y } from '@/lib/use-modal-a11y';
import { X, Search, Dumbbell, Plus, Check } from 'lucide-react';
import {
  EXERCISE_LIBRARY,
  ExerciseItem,
  MuscleGroup,
  MUSCLE_GROUPS,
  searchExercises,
  getExerciseMuscle,
} from '@/lib/exercise-library';
import { useStore } from '@/lib/store';
import { useTranslation } from '@/lib/i18n';

interface ExerciseSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectExercise: (exercise: { name: string; isBodyweight: boolean; defaultWeightKg?: number; defaultReps?: number }) => void;
  defaultMuscle?: MuscleGroup | 'All';
  title?: string;
}

export default function ExerciseSelectorModal({
  isOpen,
  onClose,
  onSelectExercise,
  defaultMuscle = 'All',
  title,
}: ExerciseSelectorModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const { dialogProps } = useModalA11y(modalRef, isOpen, onClose);
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | 'All'>(defaultMuscle);
  const [customMuscle, setCustomMuscle] = useState<MuscleGroup | null>(null);
  const setCustomExerciseMuscle = useStore((state) => state.setCustomExerciseMuscle);

  const filteredExercises = useMemo(() => {
    return searchExercises(searchQuery, selectedMuscle);
  }, [searchQuery, selectedMuscle]);

  if (!isOpen) return null;

  const handleSelect = (item: ExerciseItem) => {
    onSelectExercise({
      name: item.name,
      isBodyweight: !!item.isBodyweight,
      defaultWeightKg: item.defaultWeightKg,
      defaultReps: item.defaultReps,
    });
    setSearchQuery('');
    onClose();
  };

  // The muscle a custom exercise will be filed under: an explicit pick
  // wins, then the browsed category tab, then the name heuristic.
  const effectiveCustomMuscle = (name: string): MuscleGroup =>
    customMuscle ??
    (selectedMuscle !== 'All' ? selectedMuscle : getExerciseMuscle(name));

  const handleAddCustom = () => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    const isBW = /push[\s-]?up|pull[\s-]?up|chin[\s-]?up|dip|squat|plank|crunch/i.test(trimmed);
    // Persist the muscle choice — otherwise the exercise is classified
    // by name keywords forever, with no way to correct a wrong guess.
    setCustomExerciseMuscle(trimmed, effectiveCustomMuscle(trimmed));
    onSelectExercise({
      name: trimmed,
      isBodyweight: isBW,
      defaultWeightKg: isBW ? 0 : 50,
      defaultReps: 10,
    });
    setSearchQuery('');
    setCustomMuscle(null);
    onClose();
  };

  return (
    <div ref={modalRef} {...dialogProps} className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-md w-full max-h-[85vh] flex flex-col p-0 overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-border/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center text-accent">
              <Dumbbell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-text-primary">{title ?? t('exsel.addExercise')}</h3>
              <p className="text-2xs text-text-muted">{t('exsel.subtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
          aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="p-3 border-b border-border/50 bg-bg-card space-y-2 shrink-0">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={t('exsel.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              className="w-full bg-bg-secondary border border-border rounded-xl pl-9 pr-8 py-2 text-xs text-text-primary outline-none focus:border-accent transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Muscle Category Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-2xs">
            <button
              type="button"
              onClick={() => setSelectedMuscle('All')}
              className={`px-3 py-1 rounded-full font-semibold transition-all shrink-0 cursor-pointer ${
                selectedMuscle === 'All'
                  ? 'bg-accent text-accent-on shadow-xs'
                  : 'bg-bg-secondary text-text-secondary hover:text-text-primary border border-border/60'
              }`}
            >
              {t('exsel.allMuscles')}
            </button>
            {MUSCLE_GROUPS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSelectedMuscle(m)}
                className={`px-3 py-1 rounded-full font-semibold transition-all shrink-0 cursor-pointer ${
                  selectedMuscle === m
                    ? 'bg-accent text-accent-on shadow-xs'
                    : 'bg-bg-secondary text-text-secondary hover:text-text-primary border border-border/60'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Custom-exercise muscle: shown while typing a name that will
              be added as custom, so it is filed under the right muscle
              instead of a keyword guess. */}
          {searchQuery.trim() && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-2xs">
              <span className="text-text-muted shrink-0 font-semibold">{t('exsel.customMuscle')}</span>
              {MUSCLE_GROUPS.map((m) => {
                const active = effectiveCustomMuscle(searchQuery.trim()) === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setCustomMuscle(m)}
                    className={`px-2.5 py-1 rounded-full font-semibold transition-all shrink-0 cursor-pointer ${
                      active
                        ? 'bg-accent/85 text-accent-on'
                        : 'bg-bg-secondary/60 text-text-muted hover:text-text-primary border border-border/50'
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Exercise List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-border/20">
          {filteredExercises.length === 0 ? (
            <div className="py-8 px-4 text-center space-y-3">
              <p className="text-xs text-text-muted">
                {t('exsel.noMatch', { query: searchQuery })}
              </p>
              {searchQuery.trim() && (
                <button
                  type="button"
                  onClick={handleAddCustom}
                  className="btn-primary py-2 px-4 text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('exsel.addAsCustom', { name: searchQuery.trim() })}</span>
                </button>
              )}
            </div>
          ) : (
            filteredExercises.map((ex) => (
              <button
                key={ex.id}
                type="button"
                onClick={() => handleSelect(ex)}
                className="w-full p-2.5 rounded-xl hover:bg-bg-secondary/70 flex items-center justify-between text-left transition-colors group cursor-pointer"
              >
                <div className="space-y-0.5 pr-2">
                  <span className="text-xs font-semibold text-text-primary group-hover:text-accent transition-colors block">
                    {ex.name}
                  </span>
                  <div className="flex items-center gap-1.5 text-2xs font-mono text-text-muted">
                    <span className="px-1.5 py-0.5 rounded bg-bg-secondary border border-border">
                      {ex.muscle}
                    </span>
                    <span>•</span>
                    <span className="text-text-secondary">{ex.equipment}</span>
                    {ex.isBodyweight && (
                      <>
                        <span>•</span>
                        <span className="text-accent font-semibold">{t('exsel.bodyweight')}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="w-6 h-6 rounded-full bg-accent/10 text-accent group-hover:bg-accent group-hover:text-accent-on flex items-center justify-center transition-all shrink-0">
                  <Plus className="w-3.5 h-3.5" />
                </div>
              </button>
            ))
          )}

          {/* Quick custom add if searching something specific */}
          {searchQuery.trim() && filteredExercises.length > 0 && !filteredExercises.some(e => e.name.toLowerCase() === searchQuery.toLowerCase().trim()) && (
            <div className="pt-2 px-1">
              <button
                type="button"
                onClick={handleAddCustom}
                className="w-full p-2 rounded-lg border border-dashed border-accent/40 text-accent hover:bg-accent/10 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('exsel.addCustom', { name: searchQuery.trim() })}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
