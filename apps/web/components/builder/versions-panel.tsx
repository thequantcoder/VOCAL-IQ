'use client';

import { Button } from '@vocaliq/ui';
import { RotateCcw } from 'lucide-react';
import { useFlowVersions, useRestoreVersion } from '../../lib/api';
import { useI18n } from '../../lib/i18n/provider';

/** Version history + one-click rollback (Day 23). Restoring copies a version into the draft. */
export function VersionsPanel({ agentId }: { agentId: string }) {
  const { t } = useI18n();
  const versions = useFlowVersions(agentId);
  const restore = useRestoreVersion(agentId);

  if (versions.isLoading)
    return <p className="text-vq-text-lo text-xs">{t('Loading versions…')}</p>;
  const items = versions.data ?? [];
  if (items.length === 0) return <p className="text-vq-text-lo text-xs">{t('No versions yet.')}</p>;

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        {items.map((v) => (
          <li
            key={v.version}
            className="flex items-center justify-between rounded-vq border border-vq-border px-2.5 py-1.5 text-xs"
          >
            <span className="text-vq-text-hi">
              v{v.version}{' '}
              {v.isDraft ? (
                <span className="text-vq-text-lo">{t('draft')}</span>
              ) : (
                <span className="text-vq-success">{t('published')}</span>
              )}
            </span>
            {!v.isDraft ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={restore.isPending}
                onClick={() => restore.mutate(v.version)}
              >
                <RotateCcw size={12} /> {t('Restore')}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {restore.isSuccess ? (
        <p className="text-vq-success text-xs">
          {t('Restored v{n} into the draft — reopen the builder to load it.', {
            n: restore.data?.restoredFrom ?? '',
          })}
        </p>
      ) : null}
      {restore.isError ? (
        <p className="text-vq-danger text-xs">{(restore.error as Error).message}</p>
      ) : null}
    </div>
  );
}
