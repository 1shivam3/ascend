'use client';

import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'outline';
  size?: 'xs' | 'sm' | 'md';
}

export function Badge({
  variant = 'neutral',
  size = 'sm',
  className = '',
  children,
  ...props
}: BadgeProps) {
  const baseStyles = 'inline-flex items-center font-mono font-bold uppercase rounded-md tracking-wider';

  const variants = {
    neutral: 'bg-bg-secondary text-text-secondary border border-border/70',
    brand: 'bg-accent/15 text-accent border border-accent/30',
    success: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
    warning: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
    danger: 'bg-danger/15 text-danger border border-danger/30',
    outline: 'bg-transparent text-text-muted border border-border',
  };

  const sizes = {
    xs: 'text-[9px] px-1.5 py-0.2',
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  };

  return (
    <span
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}

export default Badge;
