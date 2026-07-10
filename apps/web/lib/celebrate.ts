import { fireConfetti, toast } from '@vocaliq/ui';

const MILESTONE_KEY = 'vq-milestones';

/** Milestones already celebrated in this browser (so confetti fires once, not on every repeat). */
function seen(): Set<string> {
  try {
    const raw = localStorage.getItem(MILESTONE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function markSeen(key: string) {
  try {
    const set = seen();
    set.add(key);
    localStorage.setItem(MILESTONE_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

/**
 * Celebrate a true milestone (UX-08) — a success toast every time, plus a one-time confetti burst per
 * milestone `key` (rate-limited via localStorage). The confetti host self-suppresses under reduced/off
 * motion, so the toast always carries the moment. Fire only for real wins: first agent published, first
 * call placed, wallet top-up, plan upgrade.
 */
export function celebrateMilestone(key: string, message: string, description?: string) {
  toast.success(message, description ? { description } : undefined);
  if (!seen().has(key)) {
    markSeen(key);
    fireConfetti();
  }
}
