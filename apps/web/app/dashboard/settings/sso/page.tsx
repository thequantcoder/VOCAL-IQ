'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LoadingCard } from '../../../../components/states';
import { type SsoConfigureBody, useConfigureSso, useSsoConnection } from '../../../../lib/api';

const inputCls =
  'w-full rounded-vq border border-vq-border bg-vq-bg-base px-3 py-2 text-sm text-vq-text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring';

/**
 * Enterprise SSO/SAML config (Day 59): a tenant owner/admin points their IdP at VocalIQ, maps
 * IdP groups → roles, and enables directory sync (SCIM). The live IdP handshake is gated until
 * WorkOS keys are set; config + SP metadata + the SCIM token work today.
 */
export default function SsoSettingsPage() {
  const conn = useSsoConnection();
  const configure = useConfigureSso();
  const [form, setForm] = useState<SsoConfigureBody>({
    config: { provider: 'SAML', entryPoint: '', issuer: '' },
    roleMappings: {},
    scimEnabled: false,
    enabled: false,
  });
  const [scimToken, setScimToken] = useState<string | null>(null);

  useEffect(() => {
    if (conn.data) {
      setForm({
        config: {
          provider: conn.data.provider as 'SAML',
          entryPoint: conn.data.entryPoint,
          issuer: conn.data.issuer,
        },
        roleMappings: conn.data.roleMappings,
        defaultRole: conn.data.defaultRole,
        scimEnabled: conn.data.scimEnabled,
        enabled: conn.data.enabled,
      });
    }
  }, [conn.data]);

  async function save() {
    const res = await configure.mutateAsync(form);
    if (res.scimToken) setScimToken(res.scimToken);
  }

  if (conn.isLoading) return <LoadingCard rows={4} />;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
          <ShieldCheck size={20} /> Enterprise SSO
        </h1>
        <p className="text-sm text-vq-text-lo">
          Log your team in through your identity provider (SAML/OIDC) with directory sync.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identity provider</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-vq-text-lo text-xs">
            Provider
            <select
              value={form.config.provider}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  config: { ...f.config, provider: e.target.value as 'SAML' },
                }))
              }
              className={inputCls}
            >
              <option value="SAML">SAML</option>
              <option value="OIDC">OIDC</option>
              <option value="WORKOS">WorkOS</option>
            </select>
          </label>
          <Input
            placeholder="IdP SSO URL (entryPoint)"
            value={form.config.entryPoint}
            onChange={(e) =>
              setForm((f) => ({ ...f, config: { ...f.config, entryPoint: e.target.value } }))
            }
          />
          <Input
            placeholder="IdP issuer / entity id"
            value={form.config.issuer}
            onChange={(e) =>
              setForm((f) => ({ ...f, config: { ...f.config, issuer: e.target.value } }))
            }
          />
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-vq-text-lo">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              />
              Enable SSO login
            </label>
            <label className="flex items-center gap-2 text-sm text-vq-text-lo">
              <input
                type="checkbox"
                checked={form.scimEnabled}
                onChange={(e) => setForm((f) => ({ ...f, scimEnabled: e.target.checked }))}
              />
              Enable SCIM directory sync
            </label>
          </div>
          {configure.isError && (
            <p className="text-vq-danger text-xs">{(configure.error as Error).message}</p>
          )}
          <Button
            size="sm"
            disabled={configure.isPending || !form.config.entryPoint || !form.config.issuer}
            onClick={save}
          >
            {configure.isPending ? 'Saving…' : 'Save SSO config'}
          </Button>
        </CardContent>
      </Card>

      {scimToken && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound size={16} /> SCIM bearer token
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-vq-text-lo text-xs">
              Copy this now — it is shown only once and stored hashed. Use it as the bearer token in
              your IdP&apos;s SCIM configuration.
            </p>
            <code className="break-all rounded-vq bg-vq-surface-2 px-3 py-2 font-mono text-vq-text-hi text-xs">
              {scimToken}
            </code>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Service-provider metadata</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-vq-text-lo text-sm">
            Register VocalIQ with your IdP using the SP metadata at{' '}
            <code className="font-mono text-vq-text-hi text-xs">
              /auth/sso/&lt;tenantId&gt;/metadata
            </code>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
