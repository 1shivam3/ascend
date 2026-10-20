'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleDetailsProps {
  /** Row label shown next to the chevron (e.g. "Details", "Why?"). */
  label?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * CollapsibleDetails — long prose stays hidden until the user wants it.
 * A subtle label row with a chevron; content is hidden by default and
 * expands on tap. Use for explanation paragraphs that shouldn't fight
 * the primary actions for attention.
 */
export function CollapsibleDetails({ label = 'Details', children, className = '' }: CollapsibleDetailsProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1 py-1 text-3xs font-semibold text-text-muted hover:text-text-primary transition-colors cursor-pointer"
      >
        {label}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && <div className="text-xs text-text-muted leading-relaxed pt-0.5">{children}</div>}
    </div>
  );
}
