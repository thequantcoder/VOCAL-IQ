'use client';

import { Button, Card, CardContent, Input, cn } from '@vocaliq/ui';
import { ClipboardList, Eye, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import {
  type FormConfigInput,
  type FormDto,
  type FormFieldDto,
  type FormFieldType,
  useCreateForm,
  useDeleteForm,
  useFormSubmissions,
  useForms,
  useSetFormActive,
  useUpdateForm,
} from '../../../lib/api';

const FIELD_TYPES: FormFieldType[] = [
  'text',
  'textarea',
  'email',
  'phone',
  'number',
  'select',
  'date',
  'checkbox',
];

const inputCls =
  'w-full rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 text-sm text-vq-text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring';

/** Lead-capture form builder (Day 37): design public forms, route submissions, view leads. */
export default function FormsPage() {
  const forms = useForms();
  const [editing, setEditing] = useState<FormDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<FormDto | null>(null);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
            <ClipboardList size={20} /> Forms
          </h1>
          <p className="text-sm text-vq-text-lo">
            Public lead-capture forms. Submissions become contacts + leads and route to a webhook or
            Google Sheet.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setViewing(null);
            setCreating((v) => !v);
          }}
        >
          <Plus size={16} /> New form
        </Button>
      </div>

      {(creating || editing) && (
        <FormEditor
          initial={editing}
          onDone={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {viewing && <Submissions form={viewing} onClose={() => setViewing(null)} />}

      {forms.isLoading ? (
        <LoadingCard rows={3} />
      ) : forms.isError ? (
        <ErrorState message={(forms.error as Error).message} onRetry={() => forms.refetch()} />
      ) : !forms.data || forms.data.length === 0 ? (
        <EmptyState title="No forms yet" hint="Build one to start capturing leads." />
      ) : (
        <div className="flex flex-col gap-3">
          {forms.data.map((f) => (
            <FormRow
              key={f.id}
              form={f}
              onEdit={() => {
                setCreating(false);
                setViewing(null);
                setEditing(f);
              }}
              onView={() => {
                setEditing(null);
                setViewing(f);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FormRow({
  form,
  onEdit,
  onView,
}: {
  form: FormDto;
  onEdit: () => void;
  onView: () => void;
}) {
  const setActive = useSetFormActive();
  const del = useDeleteForm();
  const publicUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/f/${form.id}` : `/f/${form.id}`;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <p className="font-medium text-vq-text-hi">
              {form.name}{' '}
              <span
                className={cn(
                  'ml-1 rounded-vq-pill border px-2 py-0.5 text-[11px]',
                  form.active
                    ? 'border-vq-success/40 bg-vq-success/10 text-vq-success'
                    : 'border-vq-border text-vq-text-lo',
                )}
              >
                {form.active ? 'live' : 'off'}
              </span>
            </p>
            <p className="text-vq-text-lo text-xs">
              {form.fields.length} fields · {form.submissionCount} submissions
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={onView}>
              <Eye size={15} /> Leads
            </Button>
            <Button size="sm" variant="ghost" onClick={onEdit}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setActive.mutate({ id: form.id, active: !form.active })}
            >
              {form.active ? 'Disable' : 'Enable'}
            </Button>
            <button
              type="button"
              aria-label="Delete form"
              onClick={() => del.mutate(form.id)}
              className="rounded-vq p-1.5 text-vq-text-lo hover:text-vq-danger"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-vq bg-vq-bg-base px-3 py-1.5">
          <code className="min-w-0 flex-1 truncate text-vq-text-lo text-xs">{publicUrl}</code>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigator.clipboard?.writeText(publicUrl)}
          >
            Copy
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const blankField = (): FormFieldDto => ({ key: '', label: '', type: 'text', required: false });

function FormEditor({ initial, onDone }: { initial: FormDto | null; onDone: () => void }) {
  const create = useCreateForm();
  const update = useUpdateForm();
  const [name, setName] = useState(initial?.name ?? '');
  const [fields, setFields] = useState<FormFieldDto[]>(
    initial?.fields.length ? initial.fields : [blankField()],
  );
  const [webhookUrl, setWebhookUrl] = useState(initial?.routing.webhookUrl ?? '');
  const [sheetId, setSheetId] = useState(initial?.routing.sheetId ?? '');
  const [error, setError] = useState<string | null>(null);
  const pending = create.isPending || update.isPending;

  function patch(i: number, next: Partial<FormFieldDto>) {
    setFields((fs) => fs.map((f, idx) => (idx === i ? { ...f, ...next } : f)));
  }

  async function submit() {
    setError(null);
    const body: FormConfigInput = {
      name,
      fields: fields.map((f) => ({
        ...f,
        options:
          f.type === 'select' ? (f.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined,
      })),
      routing: {
        ...(webhookUrl.trim() ? { webhookUrl: webhookUrl.trim() } : {}),
        ...(sheetId.trim() ? { sheetId: sheetId.trim() } : {}),
      },
    };
    try {
      if (initial) await update.mutateAsync({ id: initial.id, body });
      else await create.mutateAsync(body);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-5">
        <p className="font-medium text-sm text-vq-text-hi">{initial ? 'Edit form' : 'New form'}</p>

        <label htmlFor="form-name" className="flex flex-col gap-1 text-vq-text-lo text-xs">
          Form name
          <Input
            id="form-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contact us"
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-vq-text-lo text-xs">Fields</span>
          {fields.map((f, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: field rows are positional, no stable id
            <div key={i} className="flex flex-col gap-2 rounded-vq border border-vq-border p-3">
              <div className="flex gap-2">
                <Input
                  value={f.label}
                  onChange={(e) => patch(i, { label: e.target.value })}
                  placeholder="Label (e.g. Full name)"
                />
                <Input
                  value={f.key}
                  onChange={(e) => patch(i, { key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
                  placeholder="key"
                  className="max-w-[9rem]"
                />
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={f.type}
                  onChange={(e) => patch(i, { type: e.target.value as FormFieldType })}
                  className={cn(inputCls, 'max-w-[10rem]')}
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-vq-text-lo text-xs">
                  <input
                    type="checkbox"
                    checked={f.required ?? false}
                    onChange={(e) => patch(i, { required: e.target.checked })}
                  />
                  Required
                </label>
                <button
                  type="button"
                  aria-label="Remove field"
                  onClick={() => setFields((fs) => fs.filter((_, idx) => idx !== i))}
                  className="ml-auto rounded-vq p-1.5 text-vq-text-lo hover:text-vq-danger"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {f.type === 'select' && (
                <Input
                  value={(f.options ?? []).join(', ')}
                  onChange={(e) => patch(i, { options: e.target.value.split(',') })}
                  placeholder="Options, comma-separated"
                />
              )}
            </div>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setFields((fs) => [...fs, blankField()])}
          >
            <Plus size={15} /> Add field
          </Button>
        </div>

        <div className="flex flex-col gap-2 border-vq-border border-t pt-3">
          <span className="text-vq-text-lo text-xs">Routing (optional)</span>
          <label htmlFor="routing-webhook" className="flex flex-col gap-1 text-vq-text-lo text-xs">
            Webhook URL
            <Input
              id="routing-webhook"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://…"
            />
          </label>
          <label htmlFor="routing-sheet" className="flex flex-col gap-1 text-vq-text-lo text-xs">
            Google Sheet ID
            <Input
              id="routing-sheet"
              value={sheetId}
              onChange={(e) => setSheetId(e.target.value)}
              placeholder="Sheets sync activates once GOOGLE_OAUTH_* is configured"
            />
          </label>
        </div>

        {error && <p className="text-vq-danger text-xs">{error}</p>}
        <div className="flex gap-2">
          <Button size="sm" disabled={!name.trim() || pending} onClick={submit}>
            {pending ? 'Saving…' : initial ? 'Save changes' : 'Create form'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Submissions({ form, onClose }: { form: FormDto; onClose: () => void }) {
  const subs = useFormSubmissions(form.id);
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex items-center justify-between">
          <p className="font-medium text-sm text-vq-text-hi">Submissions · {form.name}</p>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        {subs.isLoading ? (
          <LoadingCard rows={2} />
        ) : subs.isError ? (
          <ErrorState message={(subs.error as Error).message} onRetry={() => subs.refetch()} />
        ) : !subs.data || subs.data.length === 0 ? (
          <EmptyState title="No submissions yet" />
        ) : (
          <div className="flex flex-col gap-2">
            {subs.data.map((s) => (
              <div key={s.id} className="rounded-vq border border-vq-border p-3 text-sm">
                <div className="mb-1 flex items-center justify-between text-vq-text-lo text-xs">
                  <span>{new Date(s.createdAt).toLocaleString()}</span>
                  <span>{s.synced ? 'synced' : 'stored'}</span>
                </div>
                <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-0.5">
                  {Object.entries(s.values).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="truncate text-vq-text-lo">{k}</dt>
                      <dd className="min-w-0 truncate text-vq-text-hi">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
