'use client';

import { Button, Card, CardContent, Input, cn } from '@vocaliq/ui';
import { use, useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface PublicField {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
}
interface PublicForm {
  id: string;
  name: string;
  fields: PublicField[];
}

const inputCls =
  'w-full rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 text-sm text-vq-text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring';

/**
 * Public, embeddable lead-capture form (Day 37) — no auth. Renders the tenant's form and
 * posts to `/public/forms/:id/submit`; the API validates + sanitises, creates a contact/lead,
 * and routes the submission. Field errors from the API are shown inline.
 */
export default function PublicFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [form, setForm] = useState<PublicForm | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/public/forms/${id}`)
      .then(async (r) => {
        const body: unknown = await r.json().catch(() => null);
        if (!r.ok) throw new Error('This form is not available.');
        if (alive) setForm(body as PublicForm);
      })
      .catch((e: Error) => alive && setLoadError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  async function submit() {
    setSubmitting(true);
    setErrors({});
    try {
      const res = await fetch(`${API_URL}/public/forms/${id}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        errors?: { key: string; message: string }[];
      } | null;
      if (res.ok && body?.ok) {
        setDone(true);
      } else if (body?.errors) {
        setErrors(Object.fromEntries(body.errors.map((e) => [e.key, e.message])));
      } else {
        setErrors({ _: 'Something went wrong. Please try again.' });
      }
    } catch {
      setErrors({ _: 'Network error. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-vq-bg-base px-4 py-10">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col gap-4 py-6">
          {loadError ? (
            <p className="text-center text-sm text-vq-text-lo">{loadError}</p>
          ) : done ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <span className="inline-block h-8 w-2 rounded-vq-pill bg-vq-success" aria-hidden />
              <p className="font-medium text-vq-text-hi">Thanks — we got your details.</p>
              <p className="text-sm text-vq-text-lo">We'll be in touch shortly.</p>
            </div>
          ) : !form ? (
            <p className="text-center text-sm text-vq-text-lo">Loading…</p>
          ) : (
            <>
              <h1 className="font-display font-semibold text-lg text-vq-text-hi">{form.name}</h1>
              {form.fields.map((f) => (
                <label
                  key={f.key}
                  htmlFor={`f-${f.key}`}
                  className="flex flex-col gap-1 text-vq-text-lo text-xs"
                >
                  {f.label}
                  {f.required && <span className="text-vq-danger"> *</span>}
                  {f.type === 'textarea' ? (
                    <textarea
                      id={`f-${f.key}`}
                      value={values[f.key] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      className={cn(inputCls, 'min-h-[5rem]')}
                    />
                  ) : f.type === 'select' ? (
                    <select
                      id={`f-${f.key}`}
                      value={values[f.key] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      className={inputCls}
                    >
                      <option value="">Select…</option>
                      {(f.options ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={`f-${f.key}`}
                      type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                      value={values[f.key] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    />
                  )}
                  {errors[f.key] && <span className="text-vq-danger">{errors[f.key]}</span>}
                </label>
              ))}
              {errors._ && <p className="text-vq-danger text-xs">{errors._}</p>}
              <Button disabled={submitting} onClick={submit}>
                {submitting ? 'Submitting…' : 'Submit'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
