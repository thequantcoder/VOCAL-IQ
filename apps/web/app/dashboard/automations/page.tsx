'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { ArrowRight, Plus, Trash2, Workflow, Zap } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import {
  type ActionType,
  type Automation,
  type AutomationAction,
  type AutomationEventType,
  useAutomations,
  useCreateAutomation,
  useDeleteAutomation,
  useSetAutomationActive,
} from '../../../lib/api';
import { useI18n } from '../../../lib/i18n/provider';

const EVENTS: { value: AutomationEventType; label: string }[] = [
  { value: 'call_ended', label: 'Call ended' },
  { value: 'disposition_set', label: 'Disposition set' },
  { value: 'lead_status_changed', label: 'Lead status changed' },
];

const ACTION_LABELS: Record<ActionType, string> = {
  send_message: 'Send SMS/WhatsApp',
  crm_sync: 'Sync to CRM',
  webhook: 'POST webhook',
  task: 'Create task',
  notify: 'Notify',
};

function describeAction(a: AutomationAction): string {
  switch (a.type) {
    case 'send_message':
      return `Send ${a.channel}`;
    case 'webhook':
      return `POST ${a.url}`;
    case 'task':
      return `Task: ${a.title}`;
    case 'notify':
      return `Notify: ${a.message}`;
    default:
      return ACTION_LABELS[a.type];
  }
}

/** Cross-channel automations (Day 47): trigger → multi-step actions (call → text → CRM → task). */
export default function AutomationsPage() {
  const { t } = useI18n();
  const automations = useAutomations();
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
            <Workflow size={20} /> {t('Automations')}
          </h1>
          <p className="text-sm text-vq-text-lo">
            {t(
              'Treat a call as one step in a bigger flow: a trigger fires an ordered set of actions.',
            )}
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus size={16} /> {t('New automation')}
        </Button>
      </div>

      {creating && <CreateAutomation onDone={() => setCreating(false)} />}

      {automations.isLoading ? (
        <LoadingCard rows={2} />
      ) : automations.isError ? (
        <ErrorState
          message={(automations.error as Error).message}
          onRetry={() => automations.refetch()}
        />
      ) : !automations.data || automations.data.length === 0 ? (
        <EmptyState
          title={t('No automations yet')}
          hint={t('Create a trigger → action flow, e.g. missed call → SMS → task.')}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {automations.data.map((a) => (
            <AutomationRow key={a.id} automation={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function AutomationRow({ automation }: { automation: Automation }) {
  const { t } = useI18n();
  const toggle = useSetAutomationActive();
  const del = useDeleteAutomation();
  const eventLabel = EVENTS.find((e) => e.value === automation.event)?.label ?? automation.event;
  const filterBits = Object.entries(automation.filters)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`);

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-4">
        <div className="flex items-center justify-between">
          <span className="font-medium text-vq-text-hi">{automation.name}</span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-vq-text-lo text-xs">
              <input
                type="checkbox"
                checked={automation.active}
                onChange={(e) => toggle.mutate({ id: automation.id, active: e.target.checked })}
              />
              {t('Active')}
            </label>
            <Button
              size="sm"
              variant="ghost"
              disabled={del.isPending}
              onClick={() => del.mutate(automation.id)}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1 rounded-vq-pill bg-vq-violet/10 px-2 py-0.5 text-vq-text-hi">
            <Zap size={11} /> {t(eventLabel)}
            {filterBits.length > 0 ? ` · ${filterBits.join(', ')}` : ''}
          </span>
          {automation.actions.map((a, i) => (
            <span key={`${a.type}-${i}`} className="flex items-center gap-1 text-vq-text-lo">
              <ArrowRight size={12} />
              <span className="rounded-vq-pill border border-vq-border px-2 py-0.5">
                {describeAction(a)}
              </span>
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

type ActionDraft = AutomationAction & { _id: string };
let seq = 0;

function CreateAutomation({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const create = useCreateAutomation();
  const [name, setName] = useState('');
  const [event, setEvent] = useState<AutomationEventType>('call_ended');
  const [disposition, setDisposition] = useState('');
  const [actions, setActions] = useState<ActionDraft[]>([
    { _id: `a${seq++}`, type: 'send_message', channel: 'SMS', body: '' },
  ]);

  function addAction(type: ActionType) {
    const base: Record<ActionType, AutomationAction> = {
      send_message: { type: 'send_message', channel: 'SMS', body: '' },
      crm_sync: { type: 'crm_sync' },
      webhook: { type: 'webhook', url: '' },
      task: { type: 'task', title: '' },
      notify: { type: 'notify', message: '' },
    };
    setActions((as) => [...as, { _id: `a${seq++}`, ...base[type] }]);
  }
  function patch(id: string, next: AutomationAction) {
    setActions((as) => as.map((a) => (a._id === id ? { _id: id, ...next } : a)));
  }

  const valid = name.trim().length > 0 && actions.length > 0;

  async function submit() {
    if (!valid) return;
    await create.mutateAsync({
      name: name.trim(),
      trigger: { event, filters: disposition.trim() ? { disposition: disposition.trim() } : {} },
      actions: actions.map(({ _id, ...a }) => a),
      active: true,
    });
    onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('New automation')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input
          placeholder={t('Automation name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex flex-wrap gap-3">
          <label htmlFor="auto-event" className="flex flex-col gap-1 text-vq-text-lo text-xs">
            {t('When')}
            <select
              id="auto-event"
              value={event}
              onChange={(e) => setEvent(e.target.value as AutomationEventType)}
              className="rounded-vq border border-vq-border bg-transparent px-2 py-1.5 text-sm text-vq-text-hi"
            >
              {EVENTS.map((e) => (
                <option key={e.value} value={e.value}>
                  {t(e.label)}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="auto-disp" className="flex flex-col gap-1 text-vq-text-lo text-xs">
            {t('Disposition filter (optional)')}
            <Input
              id="auto-disp"
              placeholder={t('e.g. NO_ANSWER')}
              value={disposition}
              onChange={(e) => setDisposition(e.target.value)}
              className="w-40"
            />
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-vq-text-lo text-xs">{t('Then, in order:')}</span>
          {actions.map((a) => (
            <ActionEditor
              key={a._id}
              action={a}
              onChange={(next) => patch(a._id, next)}
              onRemove={() => setActions((as) => as.filter((x) => x._id !== a._id))}
            />
          ))}
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(ACTION_LABELS) as ActionType[]).map((act) => (
              <Button key={act} size="sm" variant="secondary" onClick={() => addAction(act)}>
                <Plus size={12} /> {t(ACTION_LABELS[act])}
              </Button>
            ))}
          </div>
        </div>

        {create.isError && (
          <p className="text-vq-danger text-xs">{(create.error as Error).message}</p>
        )}
        <div className="flex gap-2">
          <Button size="sm" disabled={!valid || create.isPending} onClick={submit}>
            {create.isPending ? t('Creating…') : t('Create automation')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            {t('Cancel')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ActionEditor({
  action,
  onChange,
  onRemove,
}: {
  action: AutomationAction;
  onChange: (a: AutomationAction) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-vq-text-lo text-xs">{t(ACTION_LABELS[action.type])}</span>
      {action.type === 'send_message' && (
        <>
          <select
            aria-label={t('Message channel')}
            value={action.channel}
            onChange={(e) => onChange({ ...action, channel: e.target.value as 'SMS' | 'WHATSAPP' })}
            className="rounded-vq border border-vq-border bg-transparent px-2 py-1.5 text-sm text-vq-text-hi"
          >
            <option value="SMS">SMS</option>
            <option value="WHATSAPP">WhatsApp</option>
          </select>
          <Input
            placeholder={t('Message body')}
            value={action.body ?? ''}
            onChange={(e) => onChange({ ...action, body: e.target.value })}
          />
        </>
      )}
      {action.type === 'webhook' && (
        <Input
          placeholder="https://hooks.example.com/…"
          value={action.url}
          onChange={(e) => onChange({ ...action, url: e.target.value })}
        />
      )}
      {action.type === 'task' && (
        <Input
          placeholder={t('Task title')}
          value={action.title}
          onChange={(e) => onChange({ ...action, title: e.target.value })}
        />
      )}
      {action.type === 'notify' && (
        <Input
          placeholder={t('Notification message')}
          value={action.message}
          onChange={(e) => onChange({ ...action, message: e.target.value })}
        />
      )}
      {action.type === 'crm_sync' && (
        <span className="flex-1 text-vq-text-lo text-xs">
          {t('Syncs the call to connected CRMs')}
        </span>
      )}
      <Button size="sm" variant="ghost" onClick={onRemove}>
        <Trash2 size={13} />
      </Button>
    </div>
  );
}
