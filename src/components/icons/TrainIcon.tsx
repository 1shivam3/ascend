/**
 * U3 (bug program Phase 5): the Train tab icon, redrawn.
 *
 * Lucide's Dumbbell glyph is drawn at a diagonal with thin plates;
 * at the tab bar's 20 px it collapses into a blob that doesn't read
 * as training. This redraw keeps the lucide contract (24 viewBox,
 * stroke = currentColor, round caps, size/strokeWidth/className
 * props) but draws a front-on barbell: two plate pairs on a straight
 * bar, with taller outer plates so the silhouette survives at
 * navigation size in both themes.
 */
export default function TrainIcon({
  size = 24,
  strokeWidth = 2,
  className,
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* outer plates */}
      <path d="M3.5 6.5v11" />
      <path d="M20.5 6.5v11" />
      {/* inner plates */}
      <path d="M7 9v6" />
      <path d="M17 9v6" />
      {/* bar */}
      <path d="M7 12h10" />
    </svg>
  );
}
