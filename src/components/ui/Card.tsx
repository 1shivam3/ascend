'use client';

import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'muted' | 'interactive';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({
  variant = 'default',
  padding = 'md',
  className = '',
  children,
  ...props
}: CardProps) {
  const baseStyles = 'rounded-2xl transition-all duration-150';

  const variants = {
    default: 'bg-bg-card border border-border/80 shadow-xs',
    elevated: 'bg-bg-elevated border border-border shadow-md',
    muted: 'bg-bg-secondary/70 border border-border/50',
    interactive:
      'bg-bg-card border border-border/80 hover:border-accent/40 hover:bg-bg-card/90 active:scale-[0.99] cursor-pointer shadow-xs',
  };

  const paddings = {
    none: 'p-0',
    sm: 'p-3',
    md: 'p-4 sm:p-5',
    lg: 'p-5 sm:p-6',
  };

  return (
    <div
      className={`${baseStyles} ${variants[variant]} ${paddings[padding]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function Section({
  title,
  subtitle,
  action,
  className = '',
  children,
  ...props
}: SectionProps) {
  return (
    <section className={`space-y-2.5 ${className}`} {...props}>
      {(title || action) && (
        <div className="flex items-center justify-between px-0.5">
          <div>
            {title && (
              <h2 className="text-[13px] font-bold font-mono tracking-wider uppercase text-text-muted">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-2xs text-text-secondary mt-0.5">{subtitle}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export default Card;
