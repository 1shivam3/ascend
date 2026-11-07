import { useTranslation } from '@/lib/i18n';
import type { StringKey } from '@/lib/i18n/en';
import type { TargetInput } from '@/lib/effective-goals';

const INPUT_KEYS: Record<TargetInput, StringKey> = {
  weight: 'targets.inputWeight',
  height: 'targets.inputHeight',
  age: 'targets.inputAge',
  gender: 'targets.inputGender',
  activity: 'targets.inputActivity',
};

/**
 * QA-hardening R5 — the labelled estimate. When a displayed calorie /
 * macro target was derived while engine inputs were missing (the
 * engine substitutes defaults silently), the number is an estimate:
 * this note says so and names what is missing. Where the surface
 * may route to Profile (Meals), it also offers the fix-it jump;
 * on Today it renders label-only — Today never navigates to the
 * Profile tab (owner's rule, pinned by tests/ux-discoverability:
 * Profile/Settings live in the You tab). Rendered only on the
 * derived-target path — stored targets are the user's own numbers.
 */
export default function TargetEstimateNote({
  missing,
  onFix,
}: {
  missing: TargetInput[];
  onFix?: () => void;
}) {
  const { t } = useTranslation();
  if (missing.length === 0) return null;
  const list = missing.map((m) => t(INPUT_KEYS[m])).join(', ');
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-bg-secondary/50 px-3 py-2">
      <p className="text-2xs text-text-muted leading-relaxed">
        {t('targets.estimateNote', { missing: list })}
      </p>
      {onFix && (
        <button
          type="button"
          onClick={onFix}
          className="shrink-0 min-h-[44px] px-2 text-2xs font-bold text-accent-text hover:underline cursor-pointer"
        >
          {t('targets.addDetails')}
        </button>
      )}
    </div>
  );
}
