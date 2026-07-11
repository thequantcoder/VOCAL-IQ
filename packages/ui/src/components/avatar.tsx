'use client';

import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn } from '../lib/cn';

/**
 * Avatar (UX-03) — image with initials fallback + an optional presence ring. `live` uses cyan (the
 * real-time cue, §0). Agent-specific animated avatars land in UX-05.
 */

export type AvatarStatus = 'online' | 'busy' | 'offline' | 'live';

const statusColors: Record<AvatarStatus, string> = {
  online: 'bg-success',
  busy: 'bg-warn',
  offline: 'bg-neutral-400',
  live: 'bg-accent-500',
};

export function Avatar({
  src,
  name,
  size = 36,
  status,
  className,
}: {
  src?: string;
  name?: string;
  size?: number;
  status?: AvatarStatus;
  className?: string;
}) {
  const initials =
    name
      ?.trim()
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';
  return (
    <span className={cn('relative inline-block', className)} style={{ width: size, height: size }}>
      <AvatarPrimitive.Root className="block size-full overflow-hidden rounded-full bg-primary-500/15">
        {src && (
          <AvatarPrimitive.Image src={src} alt={name ?? ''} className="size-full object-cover" />
        )}
        <AvatarPrimitive.Fallback
          className="grid size-full place-items-center font-medium text-primary-500"
          style={{ fontSize: size * 0.36 }}
        >
          {initials}
        </AvatarPrimitive.Fallback>
      </AvatarPrimitive.Root>
      {status && (
        <span
          className={cn(
            'absolute right-0 bottom-0 block size-[28%] min-h-2 min-w-2 rounded-full ring-2 ring-vq-bg-base',
            statusColors[status],
            status === 'live' && 'animate-pulse motion-reduce:animate-none',
          )}
          aria-label={status}
        />
      )}
    </span>
  );
}
