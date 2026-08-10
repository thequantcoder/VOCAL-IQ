'use client';

import { type ReactNode, useId } from 'react';
import { cn } from '../lib/cn';
import { Label } from './label';

/**
 * FormField (UX-03) — the labelled-control wrapper: `label` + control + optional `hint`/`error`. Wires
 * `htmlFor`/`aria-describedby`/`aria-invalid` via a generated id (passed to the child through a render
 * prop) so every field is announced correctly. Error text slides in (killed under reduced-motion).
 */
export function FormField({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: (props: {
    id: string;
    'aria-describedby'?: string;
    'aria-invalid'?: true;
  }) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  const childProps: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: true } = { id };
  if (describedBy) childProps['aria-describedby'] = describedBy;
  if (error) childProps['aria-invalid'] = true;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <Label htmlFor={id} required={required ?? false}>
          {label}
        </Label>
      )}
      {children(childProps)}
      {error ? (
        <p
          id={errorId}
          className="text-danger text-xs motion-safe:animate-[vq-slide-in-down_180ms_var(--ease-out-soft)]"
          role="alert"
        >
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="text-vq-text-lo text-xs">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
