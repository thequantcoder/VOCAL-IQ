'use client';

import { Button } from '@vocaliq/ui';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

/** Light/dark toggle. Both themes are first-class (DESIGN-SYSTEM §1). */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === 'dark';
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {/* Render a stable icon until mounted to avoid hydration mismatch. */}
      {mounted && !isDark ? <Sun size={16} /> : <Moon size={16} />}
      <span>{mounted ? (isDark ? 'Dark' : 'Light') : 'Theme'}</span>
    </Button>
  );
}
