'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Kbd,
} from '@vocaliq/ui';
import { useEffect, useState } from 'react';

/**
 * Keyboard-shortcuts overlay (UX-15b) — press `?` anywhere (outside an input) to open a focus-trapped
 * cheatsheet of the app's shortcuts. Built on the accessible Dialog. Complements the roving-focus lists
 * + focus rings that ship across the component kit.
 */
const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['⌘', 'K'], label: 'Open the command palette (search + actions)' },
  { keys: ['?'], label: 'Show this shortcuts overlay' },
  { keys: ['Esc'], label: 'Close any dialog, palette, or tour' },
  { keys: ['↑', '↓'], label: 'Move through palette / menu results' },
  { keys: ['↵'], label: 'Run the highlighted command' },
];

function isTypingTarget(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
}

export function ShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Move faster — these work across the app.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col divide-y divide-vq-border">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-4 py-2.5">
              <span className="text-sm text-vq-text-hi">{s.label}</span>
              <span className="flex shrink-0 items-center gap-1">
                {s.keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
