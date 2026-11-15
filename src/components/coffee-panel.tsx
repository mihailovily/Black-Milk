'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  Brew,
  CoffeeDetail,
  CoffeeItem,
  CoffeeSet,
  InventoryEntry,
  PageResult,
} from '@/contracts/coffee';
import type { UiMessages } from './ui-messages';
import { api, errorCode } from './api-client';
import { useRemote } from './use-remote';
import { dateText, Feedback, Pagination, RemoteState } from './workspace-ui';
import { ConfirmDialog } from './confirm-dialog';
import { Field } from './field';
import { CoffeeEditor, BrewEditor, AdjustmentForm } from './coffee-forms';
import { SelectField, quantityText } from './coffee-fields';

export function CoffeeNav({
  locale,
  messages: m,
}: {
  locale: string;
  messages: UiMessages;
}) {
  return (
    <nav className="coffee-nav" aria-label={m.Coffee.title}>
      <a href={`/${locale}/coffee`}>{m.Coffee.title}</a>
      <a href={`/${locale}/brews`}>{m.Coffee.brews}</a>
      <a href={`/${locale}/account`}>{m.Account.title}</a>
    </nav>
  );
}
function CoffeeSummary({
  item,
  locale,
  messages: m,
}: {
  item: CoffeeItem;
  locale: string;
  messages: UiMessages;
}) {
  const c = m.Coffee;
  const today = new Date().toLocaleDateString('en-CA');
  return (
    <>
      <p className="muted">
        {c[item.format]}
        {item.roaster ? ` · ${item.roaster}` : ''}
        {item.archived
          ? ` · ${c.archived}`
          : item.remaining === 0
            ? ` · ${c.finished}`
            : ''}
      </p>
      <p className="coffee-remaining">
        {c.remaining}:{' '}
        <strong>{quantityText(item.remaining, item.format, locale, m)}</strong>
      </p>
      {item.repeat ? <p>{c.repeat}</p> : null}
      {item.bestBefore ? (
        <p className={item.bestBefore < today ? 'coffee-expired' : 'muted'}>
          {c.bestBefore}: {item.bestBefore}
          {item.bestBefore < today ? ` · ${c.expired}` : ''}
        </p>
      ) : null}
    </>
  );
}
function StockCard({
  item,
  locale,
  messages: m,
  level = 2,
}: {
  item: CoffeeItem;
  locale: string;
  messages: UiMessages;
  level?: 2 | 3;
}) {
  const Heading = level === 3 ? 'h3' : 'h2';
  return (
    <article className="coffee-card">
      <Heading>
        <a href={`/${locale}/coffee/items/${item.id}`}>{item.name}</a>
      </Heading>
      <CoffeeSummary item={item} locale={locale} messages={m} />
    </article>
  );
}
export function BrewHistory({
  locale,
  messages: m,
  itemId,
  setId,
  refresh = 0,
}: {
  locale: string;
  messages: UiMessages;
  itemId?: string;
  setId?: string;
  refresh?: number;
}) {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState('');
  const params = new URLSearchParams({ page: String(page), q: search });
  if (itemId) params.set('itemId', itemId);
  if (setId) params.set('setId', setId);
  // Refresh is deliberately part of the fetch identity after a stock mutation.
  params.set('refresh', String(refresh));
  const remote = useRemote<PageResult<Brew>>('/api/v1/brews?' + params);
  return (
    <section className="panel">
      <h2>{m.Coffee.brews}</h2>
      <Field
        label={m.Coffee.search}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />
      <RemoteState {...remote} onRetry={remote.reload} messages={m} />
      {remote.data?.items.length === 0 ? (
        <p>{search ? m.Coffee.noResults : m.Coffee.emptyBrews}</p>
      ) : null}
      {remote.data?.items.map((b) => (
        <article className="coffee-history-row" key={b.id}>
          <div>
            <h3>
              <a href={`/${locale}/coffee/items/${b.itemId}`}>{b.itemName}</a>
            </h3>
            <p>
              {dateText(b.occurredAt, locale)} · {m.BrewMethods[b.method]} ·{' '}
              {quantityText(
                b.quantity,
                b.unit === 'piece' ? 'drip' : 'beans',
                locale,
                m,
              )}
            </p>
            <p>
              {b.rating ? `${m.Coffee.rating}: ${b.rating}` : m.Coffee.unrated}
            </p>
            {b.note ? <p className="preserve-lines">{b.note}</p> : null}
          </div>
          <a
            className="button button-secondary"
            href={`/${locale}/brews/${b.id}/edit`}
          >
            {m.Coffee.edit}
          </a>
        </article>
      ))}
      {remote.data && remote.data.total > 20 ? (
        <Pagination
          page={page}
          total={remote.data.total}
          setPage={setPage}
          messages={m}
        />
      ) : null}
    </section>
  );
}
export function CoffeePanel({
  locale,
  messages: m,
  path = [],
}: {
  locale: string;
  messages: UiMessages;
  path?: string[];
}) {
  const router = useRouter();
  const c = m.Coffee;
  const kind = path[0] === 'sets' ? 'set' : 'item';
  const id =
    (path[0] === 'items' || path[0] === 'sets') && path[1] !== 'new'
      ? path[1]
      : undefined;
  const mode =
    path[2] || (path[0] === 'new' || path[1] === 'new' ? 'new' : 'detail');
  const list = path.length === 0;
  const valid =
    list ||
    (path[0] === 'new' && path.length === 1) ||
    (path[0] === 'sets' && path[1] === 'new' && path.length === 2) ||
    Boolean(
      id &&
      (path.length === 2 ||
        (path.length === 3 &&
          ['edit', 'copy', 'brew', 'adjust', 'add'].includes(mode))),
    );
  const remote = useRemote<CoffeeDetail | CoffeeSet>(
    id
      ? `/api/v1/${kind === 'set' ? 'coffee-sets' : 'coffee-items'}/${id}`
      : null,
    true,
  );
  const [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    warning: string;
    run: () => Promise<void>;
  } | null>(null);
  const [quick, setQuick] = useState<Brew | null>(null);
  const quickOperation = useRef<{
    id: string;
    itemId: string;
    occurredAt: string;
  } | null>(null);
  const [page, setPage] = useState(1),
    [q, setQ] = useState(''),
    [format, setFormat] = useState(''),
    [status, setStatus] = useState('available'),
    [repeat, setRepeat] = useState(false),
    [sort, setSort] = useState('newest');
  const params = new URLSearchParams({
    page: String(page),
    q,
    format,
    status,
    repeat: repeat ? 'true' : '',
    sort,
  });
  const inventory = useRemote<PageResult<InventoryEntry>>(
    list ? '/api/v1/coffee-items?' + params : null,
  );
  const stock =
    kind === 'item' ? (remote.data as CoffeeDetail | undefined) : undefined;
  const group =
    kind === 'set' ? (remote.data as CoffeeSet | undefined) : undefined;
  function reload() {
    remote.reload();
    inventory.reload();
    setRefresh((v) => v + 1);
  }
  async function action(task: () => Promise<void>) {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await task();
      reload();
      setSuccess(c.saved);
      return true;
    } catch (e) {
      setError(errorCode(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  function confirm(
    title: string,
    warning: string,
    task: () => Promise<unknown>,
    back = false,
  ) {
    setConfirmation({
      title,
      warning,
      run: async () => {
        await action(async () => {
          await task();
          if (back) router.push(`/${locale}/coffee`);
        });
        setConfirmation(null);
      },
    });
  }
  async function quickBrew(item: CoffeeItem) {
    await action(async () => {
      if (!quickOperation.current || quickOperation.current.itemId !== item.id)
        quickOperation.current = {
          id: crypto.randomUUID(),
          itemId: item.id,
          occurredAt: new Date().toISOString(),
        };
      const op = quickOperation.current;
      const brew = await api<Brew>('/api/v1/brews', 'POST', {
        itemId: item.id,
        quantity: 1,
        unit: 'piece',
        method: 'drip',
        occurredAt: op.occurredAt,
        operationId: op.id,
      });
      setQuick(brew);
      quickOperation.current = null;
    });
  }
  const base = `/${locale}/coffee/${kind === 'set' ? 'sets' : 'items'}/${id}`;
  return (
    <>
      <div className="workspace-title">
        <h1>
          <strong>{list ? c.title : remote.data?.name || c.title}</strong>
        </h1>
      </div>
      <CoffeeNav locale={locale} messages={m} />
      <Feedback code={error} success={success} messages={m} />
      {error === 'CONFLICT' ? (
        <p>
          {c.conflictHint}{' '}
          <button className="inline-link" onClick={reload}>
            {c.refresh}
          </button>
        </p>
      ) : null}
      {!valid ? <p role="alert">{m.Errors.NOT_FOUND}</p> : null}
      {list ? (
        <>
          <div className="form-actions">
            <a className="button" href={`/${locale}/coffee/new`}>
              {c.add}
            </a>
            <a
              className="button button-secondary"
              href={`/${locale}/coffee/sets/new`}
            >
              {c.addSet}
            </a>
          </div>
          <section className="panel coffee-filters">
            <Field
              label={c.search}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
            <SelectField
              label={c.format}
              value={format}
              onChange={(e) => {
                setFormat(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{c.allFormats}</option>
              {(['beans', 'ground', 'drip'] as const).map((f) => (
                <option value={f} key={f}>
                  {c[f]}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={c.status}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              {(['available', 'finished', 'archived', 'all'] as const).map(
                (s) => (
                  <option value={s} key={s}>
                    {c[s]}
                  </option>
                ),
              )}
            </SelectField>
            <SelectField
              label={c.sort}
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              <option value="newest">{c.newest}</option>
              <option value="expiry">{c.expiry}</option>
            </SelectField>
            <label className="coffee-check">
              <input
                type="checkbox"
                checked={repeat}
                onChange={(e) => {
                  setRepeat(e.target.checked);
                  setPage(1);
                }}
              />
              {c.repeat}
            </label>
          </section>
          <RemoteState {...inventory} onRetry={inventory.reload} messages={m} />
          {inventory.data?.items.length === 0 ? (
            <section className="panel">
              <p>{q || format || repeat ? c.noResults : c.empty}</p>
            </section>
          ) : null}
          <div className="coffee-grid">
            {inventory.data?.items.map((entry) =>
              entry.kind === 'item' ? (
                <StockCard
                  key={entry.item.id}
                  item={entry.item}
                  locale={locale}
                  messages={m}
                />
              ) : (
                <article className="coffee-card" key={entry.set.id}>
                  <h2>
                    <a href={`/${locale}/coffee/sets/${entry.set.id}`}>
                      {entry.set.name}
                    </a>
                  </h2>
                  <p className="muted">
                    {c.set}
                    {entry.set.roaster ? ` · ${entry.set.roaster}` : ''}
                    {entry.set.archived ? ` · ${c.archived}` : ''}
                  </p>
                  <SetTotals group={entry.set} locale={locale} messages={m} />
                  <details>
                    <summary>
                      {c.composition} ({entry.set.items.length})
                    </summary>
                    {entry.set.items.map((i) => (
                      <StockCard
                        level={3}
                        key={i.id}
                        item={i}
                        locale={locale}
                        messages={m}
                      />
                    ))}
                  </details>
                </article>
              ),
            )}
          </div>
          {inventory.data && inventory.data.total > 20 ? (
            <Pagination
              page={page}
              total={inventory.data.total}
              setPage={setPage}
              messages={m}
            />
          ) : null}
        </>
      ) : null}
      {id ? (
        <RemoteState {...remote} onRetry={remote.reload} messages={m} />
      ) : null}
      {valid &&
      !list &&
      (mode === 'new' ||
        ((mode === 'edit' || mode === 'copy') && remote.data)) ? (
        <CoffeeEditor
          key={mode + id}
          messages={m}
          locale={locale}
          item={stock}
          group={group}
          kind={kind}
          copy={mode === 'copy'}
          onRefresh={reload}
        />
      ) : null}
      {valid && group && mode === 'add' ? (
        <CoffeeEditor
          messages={m}
          locale={locale}
          kind="item"
          setId={group.id}
          onRefresh={reload}
        />
      ) : null}
      {valid && stock && mode === 'brew' ? (
        <BrewEditor messages={m} locale={locale} initialItem={stock} />
      ) : null}
      {valid && stock && mode === 'adjust' ? (
        <AdjustmentForm
          item={stock}
          messages={m}
          onSaved={() => {
            reload();
            setSuccess(c.saved);
          }}
        />
      ) : null}
      {valid && remote.data && mode === 'detail' ? (
        <>
          <section className="panel">
            <div className="form-actions">
              <a className="button button-secondary" href={base + '/edit'}>
                {c.edit}
              </a>
              <a className="button button-secondary" href={base + '/copy'}>
                {c.duplicate}
              </a>
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => {
                  const data = remote.data!;
                  confirm(
                    data.archived ? c.restore : c.archive,
                    kind === 'set' && !data.archived
                      ? c.archiveSetWarning
                      : c.deleteHistoryHint,
                    () =>
                      api(
                        `/api/v1/${kind === 'set' ? 'coffee-sets' : 'coffee-items'}/${id}`,
                        'PATCH',
                        { version: data.version, archived: !data.archived },
                      ),
                  );
                }}
              >
                {remote.data.archived ? c.restore : c.archive}
              </button>
              <button
                className="button button-danger"
                disabled={busy}
                onClick={() =>
                  confirm(
                    c.delete,
                    kind === 'set' ? c.deleteSetWarning : c.deleteItemWarning,
                    () =>
                      api(
                        `/api/v1/${kind === 'set' ? 'coffee-sets' : 'coffee-items'}/${id}`,
                        'DELETE',
                        { version: remote.data!.version },
                      ),
                    true,
                  )
                }
              >
                {c.delete}
              </button>
            </div>
            {stock ? (
              <>
                <CoffeeSummary item={stock} locale={locale} messages={m} />
                <div className="form-actions">
                  {!stock.archived && stock.remaining > 0 ? (
                    stock.format === 'drip' ? (
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() => void quickBrew(stock)}
                      >
                        {c.drank}
                      </button>
                    ) : (
                      <a className="button" href={base + '/brew'}>
                        {c.brew}
                      </a>
                    )
                  ) : null}
                  <a
                    className="button button-secondary"
                    href={base + '/adjust'}
                  >
                    {c.adjust}
                  </a>
                </div>
                <dl className="coffee-metadata">
                  {(
                    [
                      'country',
                      'region',
                      'processing',
                      'tastingNotes',
                      'roastDate',
                      'openedDate',
                    ] as const
                  ).map((k) =>
                    stock[k] ? (
                      <div key={k}>
                        <dt>{c[k]}</dt>
                        <dd>{stock[k]}</dd>
                      </div>
                    ) : null,
                  )}
                  {stock.dripWeight ? (
                    <div>
                      <dt>{c.dripWeight}</dt>
                      <dd>
                        {quantityText(stock.dripWeight, 'beans', locale, m)}
                      </dd>
                    </div>
                  ) : null}
                  {stock.setId ? (
                    <div>
                      <dt>{c.set}</dt>
                      <dd>
                        <a href={`/${locale}/coffee/sets/${stock.setId}`}>
                          {c.set}
                        </a>
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <p className="preserve-lines">{stock.note}</p>
              </>
            ) : null}
            {group ? (
              <>
                <SetTotals group={group} locale={locale} messages={m} />
                <p className="preserve-lines">{group.note}</p>
                {!group.archived ? (
                  <a className="button button-secondary" href={base + '/add'}>
                    {c.addPosition}
                  </a>
                ) : null}
                <h2>{c.composition}</h2>
                <div className="coffee-grid">
                  {group.items.map((i) => (
                    <StockCard
                      level={3}
                      key={i.id}
                      item={i}
                      locale={locale}
                      messages={m}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </section>
          {quick ? (
            <section className="panel" role="status">
              <p>{c.brewSaved}</p>
              <div className="form-actions">
                <a
                  className="button button-secondary"
                  href={`/${locale}/brews/${quick.id}/edit`}
                >
                  {c.addImpression}
                </a>
                <button
                  disabled={busy}
                  className="inline-link"
                  onClick={() =>
                    void action(async () => {
                      await api('/api/v1/brews/' + quick.id, 'DELETE', {
                        version: quick.version,
                      });
                      setQuick(null);
                    })
                  }
                >
                  {c.undo}
                </button>
              </div>
            </section>
          ) : null}
          <BrewHistory
            locale={locale}
            messages={m}
            itemId={stock?.id}
            setId={group?.id}
            refresh={refresh}
          />
          {stock ? (
            <section className="panel">
              <h2>{c.adjustments}</h2>
              {!stock.adjustments.length ? <p>{c.noAdjustments}</p> : null}
              {stock.adjustments.map((a) => (
                <p key={a.id}>
                  {dateText(a.createdAt, locale)} · {a.delta > 0 ? '+' : ''}
                  {quantityText(a.delta, stock.format, locale, m)} ·{' '}
                  {a.kind === 'initial' ? c.initialChange : a.reason}
                </p>
              ))}
            </section>
          ) : null}
        </>
      ) : null}
      {confirmation ? (
        <ConfirmDialog
          title={confirmation.title}
          warning={confirmation.warning}
          messages={m}
          onCancel={() => setConfirmation(null)}
          onConfirm={confirmation.run}
        />
      ) : null}
    </>
  );
}
function SetTotals({
  group,
  locale,
  messages: m,
}: {
  group: CoffeeSet;
  locale: string;
  messages: UiMessages;
}) {
  return (
    <p>
      {m.Coffee.remaining}:{' '}
      {quantityText(group.totals.pieces, 'drip', locale, m)} ·{' '}
      {quantityText(group.totals.tenthGrams, 'beans', locale, m)}
      <br />
      {m.Coffee.finishedPositions}: {group.totals.finished} /{' '}
      {group.items.length}
    </p>
  );
}
export function BrewsPanel({
  locale,
  messages: m,
  path = [],
}: {
  locale: string;
  messages: UiMessages;
  path?: string[];
}) {
  const router = useRouter();
  const id = path[0] && path[0] !== 'new' ? path[0] : undefined;
  const remote = useRemote<Brew>(id ? '/api/v1/brews/' + id : null, true);
  const [confirm, setConfirm] = useState(false),
    [error, setError] = useState('');
  return (
    <>
      <div className="workspace-title">
        <h1>
          <strong>{m.Coffee.brews}</strong>
        </h1>
      </div>
      <CoffeeNav locale={locale} messages={m} />
      <Feedback code={error} messages={m} />
      {!path.length ? (
        <>
          <a className="button fit-content" href={`/${locale}/brews/new`}>
            {m.Coffee.brew}
          </a>
          <BrewHistory locale={locale} messages={m} />
        </>
      ) : id ? (
        <>
          <RemoteState {...remote} onRetry={remote.reload} messages={m} />
          {remote.data ? (
            <>
              <BrewEditor
                key={id}
                locale={locale}
                messages={m}
                existing={remote.data}
              />
              <button
                className="button button-danger fit-content"
                onClick={() => setConfirm(true)}
              >
                {m.Coffee.delete}
              </button>
            </>
          ) : null}
        </>
      ) : (
        <BrewEditor locale={locale} messages={m} />
      )}
      {confirm && remote.data ? (
        <ConfirmDialog
          title={m.Coffee.delete}
          warning={m.Coffee.deleteBrewWarning}
          messages={m}
          onCancel={() => setConfirm(false)}
          onConfirm={async () => {
            try {
              await api('/api/v1/brews/' + id, 'DELETE', {
                version: remote.data!.version,
              });
              router.push(`/${locale}/brews`);
            } catch (e) {
              setError(errorCode(e));
              setConfirm(false);
              remote.reload();
            }
          }}
        />
      ) : null}
    </>
  );
}
