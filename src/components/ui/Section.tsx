'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * UX redesign — titled content block (design-system §6). Header + optional
 * action + body; collapse uses the animation-spec §3.6 grid-rows
 * technique (content stays in the DOM, no JS height measuring).
 * Supporting context only: nothing required for a screen's primary action
 * may live inside a collapsed Section.
 */
export interface SectionProps {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  collapsible?: boolean;
  id?: string;
}

export default function Section({
  title,
  action,
  children,
  defaultExpanded = true,
  collapsible = false,
  id,
}: SectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isOpen = !collapsible || expanded;
  return (
    <section aria-labelledby={id ? `${id}-title` : undefined} className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        {collapsible ? (
          <button
            type="button"
            aria-expanded={isOpen}
            onClick={() => setExpanded((v) => !v)}
            className="pressable flex flex-1 items-center gap-1 rounded-lg text-left"
          >
            <h2 id={id ? `${id}-title` : undefined} className="section-heading">
              {title}
            </h2>
            <ChevronDown
              size={18}
              aria-hidden
              className={`shrink-0 text-text-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            />
          </button>
        ) : (
          <h2 id={id ? `${id}-title` : undefined} className="section-heading">
            {title}
          </h2>
        )}
        {action}
      </div>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          isOpen ? '[grid-template-rows:1fr]' : '[grid-template-rows:0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className={isOpen ? undefined : 'invisible'}>{children}</div>
        </div>
      </div>
    </section>
  );
}
