'use client';

import { DEFAULT_SARVAM_VOICE, isIndianLanguage } from '@vocaliq/shared';
import { Button, Card, CardContent, Input, cn } from '@vocaliq/ui';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { LanguagePicker } from '../../../../components/language-picker';
import { SarvamVoicePicker } from '../../../../components/sarvam-voice-picker';
import { ErrorState } from '../../../../components/states';
import { type AgentInput, useCreateAgent } from '../../../../lib/api';
import { useI18n } from '../../../../lib/i18n/provider';

const fieldClass =
  'flex w-full rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 text-sm text-vq-text-hi ' +
  'placeholder:text-vq-text-lo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring ' +
  'focus-visible:border-vq-violet/60 disabled:opacity-50';

export default function NewAgentPage() {
  const { t } = useI18n();
  const router = useRouter();
  const create = useCreateAgent();

  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(
    'You are a friendly, concise voice assistant. Keep replies short and natural.',
  );
  const [type, setType] = useState('INBOUND');
  const [languages, setLanguages] = useState<string[]>(['en']);
  const [sarvamVoice, setSarvamVoice] = useState(DEFAULT_SARVAM_VOICE);
  const [turnTimeoutMs, setTurnTimeoutMs] = useState(1500);

  // The Sarvam voice only applies to a Sarvam (Indic-primary) agent — the picker + the value are
  // scoped to that case so a stale voice never rides along on a non-Indic agent.
  const isIndicPrimary = isIndianLanguage(languages[0]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body: AgentInput = {
      name: name.trim(),
      systemPrompt: systemPrompt.trim(),
      type,
      status: 'DRAFT',
      languages,
      turnTimeoutMs,
      ...(isIndicPrimary ? { sarvamVoice } : {}),
    };
    const agent = await create.mutateAsync(body);
    router.push(`/dashboard/agents?created=${agent.id}`);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="font-display font-semibold text-xl text-vq-text-hi">{t('New agent')}</h1>
        <p className="text-sm text-vq-text-lo">
          {t('Give it a name, a voice persona, and a language.')}
        </p>
      </header>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            <Field label={t('Name')} htmlFor="name">
              <Input
                id="name"
                required
                minLength={1}
                maxLength={120}
                placeholder="Front Desk"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            <Field
              label={t('System prompt')}
              htmlFor="prompt"
              hint={t('How the agent should behave.')}
            >
              <textarea
                id="prompt"
                rows={5}
                maxLength={8000}
                className={cn(fieldClass, 'resize-y font-mono text-xs')}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t('Type')} htmlFor="type">
                <select
                  id="type"
                  className={fieldClass}
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  <option value="INBOUND">{t('Inbound')}</option>
                  <option value="OUTBOUND">{t('Outbound')}</option>
                  <option value="MIXED">{t('Mixed')}</option>
                </select>
              </Field>
              <Field label={t('Turn timeout (ms)')} htmlFor="tt">
                <Input
                  id="tt"
                  type="number"
                  min={200}
                  max={10000}
                  mono
                  value={turnTimeoutMs}
                  onChange={(e) => setTurnTimeoutMs(Number(e.target.value))}
                />
              </Field>
            </div>

            <Field
              label={t('Languages')}
              htmlFor="langs"
              hint={t('First (Primary) drives the voice — an Indian language runs on Sarvam.')}
            >
              <LanguagePicker value={languages} onChange={setLanguages} />
            </Field>

            {isIndicPrimary ? (
              <Field
                label={t('Voice')}
                htmlFor="voice"
                hint={t('The Sarvam Bulbul speaker for this Indian-language agent.')}
              >
                <SarvamVoicePicker value={sarvamVoice} onChange={setSarvamVoice} />
              </Field>
            ) : null}

            {create.isError ? <ErrorState message={(create.error as Error).message} /> : null}

            <div className="flex items-center gap-3">
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={create.isPending || !name.trim() || languages.length === 0}
              >
                {create.isPending ? t('Creating…') : t('Create agent')}
              </Button>
              <Button type="button" variant="ghost" size="md" onClick={() => router.back()}>
                {t('Cancel')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1.5">
      <span className="font-medium text-sm text-vq-text-hi">{label}</span>
      {hint ? <span className="text-vq-text-lo text-xs">{hint}</span> : null}
      {children}
    </label>
  );
}
