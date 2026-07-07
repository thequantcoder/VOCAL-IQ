'use client';

import { TRANSLATION_LANGUAGES } from '@vocaliq/shared';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@vocaliq/ui';
import { Languages } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LoadingCard } from '../../../../components/states';
import { useOperatorLanguage, useSetOperatorLanguage } from '../../../../lib/api';

const SELECT_CLS =
  'rounded-vq border border-vq-border bg-transparent px-2 py-1.5 text-sm text-vq-text-hi';

/**
 * Real-time translation settings (Day 88). The operator/business working language — when enabled, live
 * captions + transcripts are translated into this language while callers are still served natively.
 */
export default function TranslationSettingsPage() {
  const current = useOperatorLanguage();
  const save = useSetOperatorLanguage();
  const [target, setTarget] = useState('en');
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (current.data) {
      setTarget(current.data.targetLanguage);
      setEnabled(current.data.enabled);
    }
  }, [current.data]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <Languages size={20} /> Translation
        </h1>
        <p className="text-sm text-vq-text-lo">
          Serve any language without multilingual staff — the caller is answered natively, while
          your operators see everything translated into their working language.
        </p>
      </div>

      {current.isLoading ? (
        <LoadingCard rows={2} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Operator working language</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <label className="flex items-center gap-2 text-sm text-vq-text-hi">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Enable real-time translation for operators
            </label>
            <label htmlFor="lang" className="flex flex-col gap-1 text-vq-text-lo text-xs">
              Translate into
              <select
                id="lang"
                className={SELECT_CLS}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                {TRANSLATION_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                disabled={save.isPending}
                onClick={() => save.mutate({ targetLanguage: target, enabled })}
              >
                {save.isPending ? 'Saving…' : 'Save'}
              </Button>
              {save.isSuccess && <span className="text-vq-success text-xs">Saved ✓</span>}
              {save.isError && (
                <span className="text-vq-danger text-xs">{(save.error as Error).message}</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
