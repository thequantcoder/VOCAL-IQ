'use client';

import { languageLabel } from '@vocaliq/shared';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { Languages } from 'lucide-react';
import { useState } from 'react';
import { useOperatorLanguage, useTranslateCaption } from '../lib/api';

interface Caption {
  id: number;
  original: string;
  translated: string;
  cached: boolean;
}

/**
 * Live translated captions (Day 88). During a call the operator sees each caller utterance translated
 * into their working language in real time. The utterance feed is wired to the live loop at deploy;
 * here an operator can also paste/type what the caller said. Repeat lines are served from cache
 * (instant + free). Only shown when translation is enabled for the tenant.
 */
export function LiveCaptions() {
  const lang = useOperatorLanguage();
  const translate = useTranslateCaption();
  const [draft, setDraft] = useState('');
  const [captions, setCaptions] = useState<Caption[]>([]);

  if (!lang.data?.enabled) return null;
  const target = lang.data.targetLanguage;

  async function add() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    const res = await translate.mutateAsync({ text, targetLanguage: target });
    setCaptions((c) => [
      { id: Date.now(), original: text, translated: res.text, cached: res.cached },
      ...c.slice(0, 20),
    ]);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Languages size={16} className="text-vq-cyan" /> Live captions
          </span>
          <span className="text-vq-text-lo text-xs">→ {languageLabel(target)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Input
            placeholder="What did the caller just say?"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <Button
            size="sm"
            disabled={translate.isPending || draft.trim().length === 0}
            onClick={add}
          >
            {translate.isPending ? 'Translating…' : 'Translate'}
          </Button>
        </div>
        {captions.length === 0 ? (
          <p className="text-vq-text-lo text-xs">
            Translated captions appear here — the caller is answered natively while you read along
            in {languageLabel(target)}.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {captions.map((c) => (
              <div
                key={c.id}
                className="flex flex-col gap-0.5 rounded-vq bg-vq-bg-base px-2 py-1.5"
              >
                <span className="text-sm text-vq-text-hi">{c.translated}</span>
                <span className="flex items-center gap-2 text-vq-text-lo text-xs">
                  <span className="truncate">{c.original}</span>
                  {c.cached && <span className="text-vq-cyan">· cached</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
