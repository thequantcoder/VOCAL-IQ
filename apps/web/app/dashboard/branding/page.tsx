'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { Globe, Palette, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ErrorState, LoadingCard } from '../../../components/states';
import {
  type DomainConfig,
  useBranding,
  useDomain,
  useProvisionDomain,
  useRefreshDomain,
  useRemoveDomain,
  useSetBranding,
} from '../../../lib/api';

/** White-label settings (Day 52): brand the whole UI + serve on your own domain with SSL. */
export default function BrandingPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <Palette size={20} /> White-label
        </h1>
        <p className="text-sm text-vq-text-lo">
          Re-brand the entire app for your customers and serve it on your own domain.
        </p>
      </div>
      <BrandingForm />
      <DomainSection />
    </div>
  );
}

function BrandingForm() {
  const branding = useBranding();
  const save = useSetBranding();
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#7c5cff');
  const [accentColor, setAccentColor] = useState('#22d3ee');
  const [hide, setHide] = useState(false);

  useEffect(() => {
    if (!branding.data) return;
    setName(branding.data.name ?? '');
    setLogoUrl(branding.data.logoUrl ?? '');
    setPrimaryColor(branding.data.primaryColor ?? '#7c5cff');
    setAccentColor(branding.data.accentColor ?? '#22d3ee');
    setHide(branding.data.hidePlatformName);
  }, [branding.data]);

  async function submit() {
    await save.mutateAsync({
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(logoUrl.trim() ? { logoUrl: logoUrl.trim() } : {}),
      primaryColor,
      accentColor,
      hidePlatformName: hide,
    });
  }

  if (branding.isLoading) return <LoadingCard rows={3} />;
  if (branding.isError)
    return (
      <ErrorState message={(branding.error as Error).message} onRetry={() => branding.refetch()} />
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Branding</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input placeholder="Brand name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          placeholder="Logo URL (https://…)"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
        />
        <div className="flex flex-wrap gap-4">
          <ColorField label="Primary" value={primaryColor} onChange={setPrimaryColor} />
          <ColorField label="Accent" value={accentColor} onChange={setAccentColor} />
        </div>
        <label className="flex items-center gap-2 text-vq-text-lo text-sm">
          <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
          Hide the “VocalIQ” platform name (full white-label for your customers)
        </label>
        {save.isError && <p className="text-vq-danger text-xs">{(save.error as Error).message}</p>}
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={save.isPending} onClick={submit}>
            {save.isPending ? 'Saving…' : 'Save branding'}
          </Button>
          {save.isSuccess && (
            <span className="text-vq-success text-xs">Saved — the app re-themes live.</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-vq-text-lo text-xs">
      {label}
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} colour`}
          className="h-8 w-10 cursor-pointer rounded-vq border border-vq-border bg-transparent"
        />
        <code className="font-mono text-vq-text-hi text-xs">{value}</code>
      </span>
    </label>
  );
}

const STATUS_LABEL: Record<DomainConfig['status'], string> = {
  pending: 'Pending — add the DNS record below',
  pending_validation: 'Validating + issuing SSL…',
  active: 'Active · SSL live',
  failed: 'Failed — check the DNS record',
};

function DomainSection() {
  const domain = useDomain();
  const provision = useProvisionDomain();
  const refresh = useRefreshDomain();
  const remove = useRemoveDomain();
  const [hostname, setHostname] = useState('');

  const current = domain.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe size={16} /> Custom domain
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {current ? (
          <>
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="font-medium text-vq-text-hi">{current.hostname}</span>
                <span
                  className={`text-xs ${current.status === 'active' ? 'text-vq-success' : current.status === 'failed' ? 'text-vq-danger' : 'text-vq-text-lo'}`}
                >
                  {STATUS_LABEL[current.status]}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={refresh.isPending}
                  onClick={() => refresh.mutate()}
                >
                  <RefreshCw
                    size={14}
                    className={refresh.isPending ? 'animate-spin motion-reduce:animate-none' : ''}
                  />{' '}
                  Check
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
            <div className="rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 text-xs">
              <p className="text-vq-text-lo">Point your domain here with a CNAME record:</p>
              <code className="font-mono text-vq-text-hi">
                {current.hostname} CNAME {current.cnameTarget}
              </code>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-vq-text-lo">
              Serve VocalIQ on your own hostname (e.g. <code>calls.your-brand.com</code>) with
              automatic SSL.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="calls.your-brand.com"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
              />
              <Button
                size="sm"
                disabled={!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(hostname) || provision.isPending}
                onClick={() => provision.mutate(hostname.trim())}
              >
                {provision.isPending ? 'Adding…' : 'Add domain'}
              </Button>
            </div>
            {provision.isError && (
              <p className="text-vq-danger text-xs">{(provision.error as Error).message}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
