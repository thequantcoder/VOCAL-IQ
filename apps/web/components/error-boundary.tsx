'use client';

import * as Sentry from '@sentry/nextjs';
import { Button } from '@vocaliq/ui';
import { Component, type ReactNode } from 'react';

/**
 * App-shell + route error boundary (DESIGN-SYSTEM §7 Resilience): a friendly, recoverable
 * fallback instead of a white screen, with the error reported to Sentry. Retry re-mounts
 * the subtree so a transient failure clears without a full reload.
 */
interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    Sentry.captureException(error);
  }

  private reset = () => this.setState({ error: null });

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="mx-auto my-16 flex max-w-md flex-col items-center gap-4 rounded-vq-card border border-vq-border bg-vq-bg-elevated px-6 py-12 text-center"
        >
          <p className="font-display text-lg text-vq-text-hi">Something went wrong</p>
          <p className="text-sm text-vq-text-lo">
            This view hit an unexpected error. It’s been reported — try again.
          </p>
          <Button variant="primary" size="sm" onClick={this.reset}>
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
