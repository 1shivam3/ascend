'use client';

import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  fullWidth?: boolean;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      isLoading = false,
      leftIcon,
      rightIcon,
      children,
      className = '',
      disabled,
      type = 'button',
      ...props
    },
    ref
  ) => {
    // Audit phase 4 (2026-11-06), Task 4.2 (P1-7): ONE disabled style
    // across the app — neutral sunken surface + muted text + hairline
    // border at full opacity (5.21:1 light / ~6.6:1 dark, accent-
    // independent), replacing. The same tokens are
    // applied to the .btn-* classes in globals.css and to ad-hoc CTAs
    // via the identical disabled: variant set.
    const baseStyles =
      'inline-flex items-center justify-center font-sans font-bold select-none transition-all duration-150 active:scale-[0.98] disabled:bg-bg-secondary disabled:text-text-muted disabled:border-border disabled:shadow-none disabled:opacity-100 disabled:pointer-events-none disabled:active:scale-100 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary';

    const variants = {
      primary:
        'bg-accent text-accent-on font-bold shadow-sm shadow-accent/25 hover:brightness-105 active:bg-accent-dim border border-transparent',
      secondary:
        'bg-bg-card hover:bg-bg-secondary text-text-primary border border-border/80 hover:border-border active:bg-bg-tertiary',
      ghost:
        'text-text-secondary hover:text-text-primary hover:bg-bg-secondary/70 active:bg-bg-secondary border border-transparent',
      danger:
        'bg-danger/10 hover:bg-danger/20 text-danger border border-danger/25 active:bg-danger/30',
      outline:
        'bg-transparent border border-accent text-accent hover:bg-accent/10 active:bg-accent/20',
    };

    const sizes = {
      sm: 'text-xs px-3 py-1.5 min-h-[44px] gap-1.5',
      md: 'text-sm px-4 py-2.5 min-h-[44px] gap-2',
      lg: 'text-base px-5 py-3.5 min-h-[52px] gap-2.5 rounded-2xl',
      icon: 'w-11 h-11 p-0 shrink-0 min-h-[44px]',
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${
          fullWidth ? 'w-full' : ''
        } ${className}`}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        ) : (
          leftIcon && <span className="shrink-0">{leftIcon}</span>
        )}
        {children && <span>{children}</span>}
        {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;
