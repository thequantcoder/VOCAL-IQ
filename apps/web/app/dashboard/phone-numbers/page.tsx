'use client';

import type { AvailableNumberDto } from '@vocaliq/shared';
import { Badge, Button, Card, CardContent, Input } from '@vocaliq/ui';
import { Crossfade, Stagger, StaggerItem } from '@vocaliq/ui/motion';
import { Hash, PhoneOutgoing, Search, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { EmptyState, ErrorState, LoadingCard } from '../../../components/states';
import {
  useBuyNumber,
  useOwnedNumbers,
  useReleaseNumber,
  useSearchNumbers,
} from '../../../lib/api';

export default function PhoneNumbersPage() {
  const owned = useOwnedNumbers();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display font-semibold text-vq-text-hi text-xl">
            <Hash size={20} /> Phone numbers
          </h1>
          <p className="text-sm text-vq-text-lo">
            Search a carrier, buy a number, and manage the numbers your agents call from.
          </p>
        </div>
        {owned.data && (
          <Badge variant={owned.data.live ? 'success' : 'warn'}>
            {owned.data.live ? 'Live carrier' : 'Demo catalogue'}
          </Badge>
        )}
      </header>

      <BuyNumber />

      <section className="flex flex-col gap-3">
        <h2 className="font-display font-semibold text-lg text-vq-text-hi">Your numbers</h2>
        <Crossfade
          swapKey={
            owned.isLoading
              ? 'loading'
              : owned.isError
                ? 'error'
                : !owned.data || owned.data.items.length === 0
                  ? 'empty'
                  : 'data'
          }
        >
          {owned.isLoading ? (
            <LoadingCard rows={2} />
          ) : owned.isError ? (
            <ErrorState message={(owned.error as Error).message} onRetry={() => owned.refetch()} />
          ) : !owned.data || owned.data.items.length === 0 ? (
            <EmptyState
              illustration="no-calls"
              title="No numbers yet"
              hint="Search + buy a number above to start making calls."
            />
          ) : (
            <Stagger className="flex flex-col gap-3">
              {owned.data.items.map((n) => (
                <StaggerItem key={n.id}>
                  <OwnedRow number={n} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </Crossfade>
      </section>
    </div>
  );
}

function OwnedRow({
  number,
}: {
  number: {
    id: string;
    e164: string;
    provider: string;
    source: string;
    capabilities: string[];
    monthlyCostUsd: number;
  };
}) {
  const release = useReleaseNumber();
  return (
    <Card className="vq-lift">
      <CardContent className="flex items-center justify-between gap-3 py-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-vq bg-primary-500/12 text-primary-500">
            <PhoneOutgoing size={16} />
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="font-medium font-mono text-vq-text-hi">{number.e164}</span>
            <span className="flex items-center gap-2 text-vq-text-lo text-xs">
              {number.provider.toLowerCase()} · {number.source.toLowerCase()} · $
              {number.monthlyCostUsd.toFixed(2)}/mo
            </span>
          </div>
          <div className="flex gap-1">
            {number.capabilities.map((c) => (
              <Badge key={c} variant="neutral">
                {c}
              </Badge>
            ))}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          loading={release.isPending}
          onClick={() => {
            if (confirm(`Release ${number.e164}? This returns it to the carrier.`)) {
              release.mutate(number.id);
            }
          }}
          aria-label={`Release ${number.e164}`}
        >
          <Trash2 size={15} /> Release
        </Button>
      </CardContent>
    </Card>
  );
}

function BuyNumber() {
  const search = useSearchNumbers();
  const buy = useBuyNumber();
  const [areaCode, setAreaCode] = useState('');
  const [country, setCountry] = useState('US');
  const results = search.data?.items ?? [];

  function onSearch(e: FormEvent) {
    e.preventDefault();
    search.mutate({ country, areaCode: areaCode.trim() || undefined, limit: 8 });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <form onSubmit={onSearch} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label htmlFor="number-country" className="flex flex-col gap-1.5 sm:w-24">
            <span className="font-medium text-sm text-vq-text-hi">Country</span>
            <Input
              id="number-country"
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
              maxLength={2}
            />
          </label>
          <label htmlFor="number-area-code" className="flex flex-1 flex-col gap-1.5">
            <span className="font-medium text-sm text-vq-text-hi">Area code (optional)</span>
            <Input
              id="number-area-code"
              value={areaCode}
              onChange={(e) => setAreaCode(e.target.value)}
              placeholder="e.g. 415"
              inputMode="numeric"
            />
          </label>
          <Button type="submit" variant="primary" size="md" loading={search.isPending}>
            <Search size={16} /> Search numbers
          </Button>
        </form>

        {search.isError && (
          <p className="text-sm text-vq-danger">{(search.error as Error).message}</p>
        )}

        {results.length > 0 && (
          <div className="flex flex-col divide-y divide-vq-border rounded-vq border border-vq-border">
            {results.map((r: AvailableNumberDto) => (
              <div key={r.e164} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium font-mono text-sm text-vq-text-hi">{r.e164}</span>
                  <span className="text-vq-text-lo text-xs">
                    {[r.locality, r.region].filter(Boolean).join(', ')} · $
                    {r.monthlyCostUsd.toFixed(2)}/mo · {r.capabilities.join(' · ')}
                    {r.mock ? ' · demo' : ''}
                  </span>
                </div>
                <Button
                  size="sm"
                  loading={buy.isPending && buy.variables?.e164 === r.e164}
                  onClick={() => buy.mutate({ e164: r.e164 })}
                >
                  Buy
                </Button>
              </div>
            ))}
          </div>
        )}
        {buy.isError && <p className="text-sm text-vq-danger">{(buy.error as Error).message}</p>}
      </CardContent>
    </Card>
  );
}
