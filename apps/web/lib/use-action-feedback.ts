'use client';

import { toast } from '@vocaliq/ui';
import { useCallback, useRef, useState } from 'react';
import { celebrateMilestone } from './celebrate';

export interface ActionFeedbackOptions {
  /** Toast on success (omit to stay silent). */
  success?: string;
  successDescription?: string;
  /** Toast on failure (defaults to the thrown error message). */
  error?: string;
  /** How long the `success` checkmark state stays on (ms). */
  successMs?: number;
  /** Fire a one-time confetti celebration on success. */
  milestone?: { key: string; message: string; description?: string };
}

/**
 * useActionFeedback (UX-08) — standardises the pending → success/failure feedback for a mutation: it
 * runs your async action, drives `pending` + `success` (wire straight into `<Button loading success>`),
 * toasts the outcome, and optionally fires a milestone celebration. Keeps optimistic UI + inline
 * success/failure motion consistent across every CTA.
 */
export function useActionFeedback() {
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(
    async <T>(
      action: () => Promise<T>,
      opts: ActionFeedbackOptions = {},
    ): Promise<T | undefined> => {
      setSuccess(false);
      setPending(true);
      try {
        const result = await action();
        if (opts.success)
          toast.success(
            opts.success,
            opts.successDescription ? { description: opts.successDescription } : undefined,
          );
        if (opts.milestone) {
          celebrateMilestone(
            opts.milestone.key,
            opts.milestone.message,
            opts.milestone.description,
          );
        }
        setSuccess(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setSuccess(false), opts.successMs ?? 2000);
        return result;
      } catch (err) {
        toast.error(opts.error ?? (err as Error).message);
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [],
  );

  return { run, pending, success };
}
