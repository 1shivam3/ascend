'use client';

import React, { forwardRef, useEffect, useRef, useState } from 'react';

/**
 * B1 (bug program Phase 1) — composition-safe text input.
 *
 * Why this exists: on Android, Gboard / Samsung Keyboard enter text
 * through IME composition. If anything rewrites the field's DOM
 * value mid-composition — a parent re-render pushing a value back
 * down, or the field being driven by state that lives far from the
 * input — the composition restarts at position 0 and every new
 * character lands at the START of the field ("Salt" → "tlaS",
 * suggestions following the reversed string). The scan review
 * inputs showed exactly that on the owner's phone (2026-11-19
 * recordings); desktop key events never reproduced it, because
 * they don't compose.
 *
 * This wrapper keeps the text in state LOCAL to the input while it
 * is being edited, reports every change upward as a plain string,
 * and never adopts an external value change mid-composition.
 * External changes (clear-on-send, programmatic set, prefill) are
 * adopted whenever the user is not composing. The component is
 * module-level with a stable identity, so it can never remount
 * per keystroke.
 */
export interface TextInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
}

const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { value, onChange, type = 'text', ...rest },
  ref
) {
  const [text, setText] = useState(value);
  const composingRef = useRef(false);

  // Adopt external changes except mid-composition (see header).
  useEffect(() => {
    if (!composingRef.current) {
      setText((prev) => (prev === value ? prev : value));
    }
  }, [value]);

  return (
    <input
      {...rest}
      ref={ref}
      type={type}
      value={text}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={(e) => {
        composingRef.current = false;
        // The committed composition is authoritative.
        setText(e.currentTarget.value);
        onChange(e.currentTarget.value);
      }}
      onChange={(e) => {
        setText(e.target.value);
        onChange(e.target.value);
      }}
    />
  );
});

export default TextInput;
