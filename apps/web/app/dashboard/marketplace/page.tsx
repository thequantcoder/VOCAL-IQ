'use client';

import { formatAmount } from '@vocaliq/shared';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@vocaliq/ui';
import { Store } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import {
  type MarketplaceListing,
  useAgents,
  useMarketplaceBrowse,
  useMyListings,
  useMyPurchases,
  usePayouts,
  usePublishListing,
  usePurchaseListing,
  useSubmitListing,
} from '../../../lib/api';
import { useI18n } from '../../../lib/i18n/provider';

const SELECT_CLS =
  'rounded-vq border border-vq-border bg-transparent px-2 py-2 text-sm text-vq-text-hi';
const STATUS_COLOR: Record<string, string> = {
  draft: 'text-vq-text-lo border-vq-border',
  pending: 'text-vq-warn border-vq-warn/40',
  approved: 'text-vq-success border-vq-success/40',
  rejected: 'text-vq-danger border-vq-danger/40',
  delisted: 'text-vq-text-lo border-vq-border',
};
const stars = (sum: number, count: number) =>
  count === 0 ? 'unrated' : `★ ${(sum / count).toFixed(1)} (${count})`;

/**
 * Agent-template marketplace (Day 83). Browse + buy agent templates from other creators (cloned into
 * your tenant), or publish your own agents for revenue share. Approved listings are public; your
 * drafts, purchases and payouts stay private.
 */
export default function MarketplacePage() {
  const { t } = useI18n();
  const browse = useMarketplaceBrowse();
  const purchase = usePurchaseListing();
  const payouts = usePayouts();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
            <Store size={20} /> {t('Marketplace')}
          </h1>
          <p className="text-sm text-vq-text-lo">
            {t(
              'Buy proven agent templates (cloned into your workspace) or publish your own for revenue share.',
            )}
          </p>
        </div>
        {payouts.data && payouts.data.sales > 0 && (
          <div className="text-right text-xs text-vq-text-lo">
            <div className="font-semibold text-vq-success text-sm">
              {formatAmount(payouts.data.earnedCents, 'USD')}
            </div>
            {t('earned · {n} sales', { n: payouts.data.sales })}
          </div>
        )}
      </div>

      <PublishListing />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('Browse listings')}</CardTitle>
        </CardHeader>
        <CardContent>
          {browse.isLoading ? (
            <LoadingCard rows={3} />
          ) : browse.isError ? (
            <ErrorState
              message={(browse.error as Error).message}
              onRetry={() => browse.refetch()}
            />
          ) : !browse.data || browse.data.length === 0 ? (
            <EmptyState
              title={t('No listings yet')}
              hint={t('Be the first to publish a template.')}
            />
          ) : (
            <div className="flex flex-col gap-2">
              {browse.data.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-vq-text-hi">{l.title}</span>
                    <span className="truncate text-vq-text-lo text-xs">
                      {formatAmount(l.priceCents, 'USD')} · {stars(l.ratingSum, l.ratingCount)} ·{' '}
                      {t('{n} sold', { n: l.purchaseCount })}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    disabled={purchase.isPending}
                    onClick={() => purchase.mutate(l.id)}
                  >
                    {t('Buy & clone')}
                  </Button>
                </div>
              ))}
            </div>
          )}
          {purchase.isError && (
            <p className="mt-2 text-vq-danger text-xs">{(purchase.error as Error).message}</p>
          )}
        </CardContent>
      </Card>

      <MyListings />
      <MyPurchases />
    </div>
  );
}

function PublishListing() {
  const { t } = useI18n();
  const agents = useAgents();
  const publish = usePublishListing();
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState('');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');

  async function submit() {
    if (!agentId || title.length < 3) return;
    await publish.mutateAsync({
      sourceAgentId: agentId,
      title,
      description,
      priceCents: Math.round(Number(price) * 100),
    });
    setTitle('');
    setPrice('');
    setDescription('');
    setOpen(false);
  }

  if (!open) {
    return (
      <Button size="sm" className="self-start" onClick={() => setOpen(true)}>
        {t('Publish a template')}
      </Button>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('Publish a template')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <select className={SELECT_CLS} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
          <option value="">{t('Select an agent to publish…')}</option>
          {(agents.data ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <Input
          placeholder={t('Listing title')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Input
          placeholder={t('Description')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <label htmlFor="mkt-price" className="flex flex-col gap-1 text-vq-text-lo text-xs">
          {t('Price ($) — you keep 70%')}
          <Input
            id="mkt-price"
            type="number"
            min={0}
            step="0.01"
            className="w-32"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        {publish.isError && (
          <p className="text-vq-danger text-xs">{(publish.error as Error).message}</p>
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={!agentId || title.length < 3 || publish.isPending}
            onClick={submit}
          >
            {publish.isPending ? t('Publishing…') : t('Publish (draft)')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            {t('Cancel')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MyListings() {
  const { t } = useI18n();
  const mine = useMyListings();
  const submit = useSubmitListing();
  if (!mine.data || mine.data.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('My listings')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {mine.data.map((l: MarketplaceListing) => (
          <div key={l.id} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-vq-text-hi">
              {l.title}
              <span
                className={`rounded-vq-pill border px-2 py-0.5 text-xs ${STATUS_COLOR[l.status] ?? ''}`}
              >
                {l.status}
              </span>
            </span>
            <div className="flex items-center gap-2 text-vq-text-lo text-xs">
              {formatAmount(l.priceCents, 'USD')} · {t('{n} sold', { n: l.purchaseCount })}
              {l.status === 'draft' && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={submit.isPending}
                  onClick={() => submit.mutate(l.id)}
                >
                  {t('Submit for review')}
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function MyPurchases() {
  const { t } = useI18n();
  const purchases = useMyPurchases();
  if (!purchases.data || purchases.data.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('My purchases')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-sm">
        {purchases.data.map((p) => (
          <div key={p.id} className="flex justify-between text-vq-text-lo text-xs">
            <span>{t('Cloned agent {id}', { id: p.clonedAgentId?.slice(0, 8) ?? '—' })}</span>
            <span className="text-vq-text-hi">{formatAmount(p.pricePaidCents, 'USD')}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
