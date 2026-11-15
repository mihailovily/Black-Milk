'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  Brew,
  BrewInput,
  CoffeeDetail,
  CoffeeItem,
  CoffeeSet,
  InventoryEntry,
  PageResult,
} from '@/contracts/coffee';
import { brewMethods, coffeeUnit } from '@/contracts/coffee';
import type { UiMessages } from './ui-messages';
import { api, errorCode } from './api-client';
import { Field } from './field';
import { Feedback } from './workspace-ui';
import {
  CoffeeFields,
  NoteField,
  SelectField,
  readCoffee,
} from './coffee-fields';

export function useCoffeeChoices() {
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((v) => v + 1), []);
  const [state, setState] = useState<{
    items: CoffeeItem[];
    sets: CoffeeSet[];
    error?: string;
  }>({ items: [], sets: [] });
  useEffect(() => {
    const controller = new AbortController();
    async function pages(path: string) {
      const first = await api<PageResult<InventoryEntry>>(
        path,
        'GET',
        undefined,
        controller.signal,
      );
      const rest = await Promise.all(
        Array.from({ length: Math.ceil(first.total / 20) - 1 }, (_, i) =>
          api<PageResult<InventoryEntry>>(
            path + '&page=' + (i + 2),
            'GET',
            undefined,
            controller.signal,
          ),
        ),
      );
      return [first, ...rest].flatMap((p) => p.items);
    }
    Promise.all([
      pages('/api/v1/coffee-items?status=all&flat=true'),
      pages('/api/v1/coffee-sets?status=all'),
    ])
      .then(([stocks, groups]) =>
        setState({
          items: stocks.flatMap((e) => (e.kind === 'item' ? [e.item] : [])),
          sets: groups.flatMap((e) => (e.kind === 'set' ? [e.set] : [])),
        }),
      )
      .catch((e) => {
        if (!controller.signal.aborted)
          setState({ items: [], sets: [], error: errorCode(e) });
      });
    return () => controller.abort();
  }, [revision]);
  return { ...state, reload };
}
export function CoffeeEditor({
  messages: m,
  locale,
  item,
  group,
  kind,
  copy = false,
  setId,
  onRefresh,
}: {
  messages: UiMessages;
  locale: string;
  item?: CoffeeDetail;
  group?: CoffeeSet;
  kind: 'item' | 'set';
  copy?: boolean;
  setId?: string;
  onRefresh: () => void;
}) {
  const router = useRouter();
  const choices = useCoffeeChoices();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [positions, setPositions] = useState(() =>
    group?.items.length
      ? group.items.map((item, i) => ({ key: String(i), item }))
      : [{ key: 'first', item: undefined as CoffeeItem | undefined }],
  );
  const c = m.Coffee;
  const editing = Boolean((item || group) && !copy);
  function copied(stock: CoffeeItem): CoffeeItem {
    return {
      ...stock,
      roastDate: null,
      openedDate: null,
      bestBefore: null,
      setId: null,
      archived: false,
    };
  }
  return (
    <section className="panel">
      <h2>{editing ? c.edit : kind === 'set' ? c.newSet : c.newItem}</h2>
      <Feedback code={error || choices.error} messages={m} />
      {choices.error ? (
        <button type="button" className="inline-link" onClick={choices.reload}>
          {m.Common.retry}
        </button>
      ) : null}
      {error === 'CONFLICT' ? (
        <p role="status">
          {c.conflictHint}{' '}
          <button className="inline-link" type="button" onClick={onRefresh}>
            {c.refresh}
          </button>
        </p>
      ) : null}
      <form
        className="stack-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setBusy(true);
          setError('');
          try {
            if (kind === 'item') {
              const input = readCoffee(data);
              const result = await api<CoffeeItem>(
                '/api/v1/coffee-items' + (editing ? '/' + item!.id : ''),
                editing ? 'PATCH' : 'POST',
                editing ? { ...input, version: item!.version } : input,
              );
              onRefresh();
              router.push(`/${locale}/coffee/items/${result.id}`);
            } else {
              const input = {
                name: String(data.get('name')),
                roaster: String(data.get('roaster') || ''),
                note: String(data.get('note') || ''),
              };
              const result = await api<CoffeeSet>(
                '/api/v1/coffee-sets' + (editing ? '/' + group!.id : ''),
                editing ? 'PATCH' : 'POST',
                editing
                  ? { ...input, version: group!.version }
                  : {
                      ...input,
                      items: positions.map((p) => {
                        const { setId: _set, ...stock } = readCoffee(
                          data,
                          p.key + '.',
                        );
                        void _set;
                        return stock;
                      }),
                    },
              );
              onRefresh();
              router.push(`/${locale}/coffee/sets/${result.id}`);
            }
            router.refresh();
          } catch (e) {
            setError(errorCode(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="coffee-fieldset">
          {kind === 'item' ? (
            <CoffeeFields
              messages={m}
              item={item ? (copy ? copied(item) : item) : undefined}
              fixedSetId={copy ? '' : setId}
              sets={choices.sets.filter(
                (s) => !s.archived || s.id === item?.setId,
              )}
              lockedFormat={!copy && Boolean(item?.hasHistory)}
            />
          ) : (
            <>
              <Field
                label={c.name}
                name="name"
                defaultValue={group?.name}
                required
                maxLength={200}
              />
              <Field
                label={c.roaster}
                name="roaster"
                defaultValue={group?.roaster}
                maxLength={200}
              />
              <NoteField
                label={c.note}
                name="note"
                defaultValue={group?.note}
              />
              {!editing ? (
                <>
                  <h3>{c.composition}</h3>
                  <p className="muted">{c.setHint}</p>
                  {positions.map((p, index) => (
                    <fieldset className="coffee-position" key={p.key}>
                      <legend>
                        {c.item} {index + 1}
                      </legend>
                      <CoffeeFields
                        messages={m}
                        prefix={p.key + '.'}
                        fixedSetId=""
                        item={
                          p.item ? (copy ? copied(p.item) : p.item) : undefined
                        }
                      />
                      <button
                        type="button"
                        className="inline-link"
                        disabled={positions.length === 1}
                        onClick={() =>
                          setPositions(positions.filter((v) => v.key !== p.key))
                        }
                      >
                        {c.removePosition}
                      </button>
                    </fieldset>
                  ))}
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={positions.length >= 100}
                    onClick={() =>
                      setPositions([
                        ...positions,
                        { key: crypto.randomUUID(), item: undefined },
                      ])
                    }
                  >
                    {c.addPosition}
                  </button>
                </>
              ) : null}
            </>
          )}
          <div className="form-actions">
            <button className="button" disabled={busy}>
              {busy ? m.Common.sending : m.Common.save}
            </button>
            <a className="button button-secondary" href={`/${locale}/coffee`}>
              {m.Common.cancel}
            </a>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
function localTime(value?: string) {
  const date = value ? new Date(value) : new Date();
  return new Date(+date - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function BrewEditor({
  messages: m,
  locale,
  initialItem,
  existing,
  onSaved,
}: {
  messages: UiMessages;
  locale: string;
  initialItem?: CoffeeItem;
  existing?: Brew;
  onSaved?: (brew: Brew) => void;
}) {
  const router = useRouter();
  const choices = useCoffeeChoices();
  const [selected, setSelected] = useState(
    initialItem?.id || existing?.itemId || '',
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(existing?.version);
  const [initialTime] = useState(() => localTime(existing?.occurredAt));
  const operation = useRef<string | null>(null);
  const payload = useRef('');
  const stock = choices.items.find((i) => i.id === selected) || initialItem;
  const drip = stock?.format === 'drip';
  const c = m.Coffee;
  const options = choices.items.filter(
    (i) =>
      (!i.archived && i.remaining > 0) ||
      i.id === existing?.itemId ||
      i.id === initialItem?.id,
  );
  return (
    <section className="panel">
      <h2>{existing ? c.editBrew : c.brew}</h2>
      <Feedback code={error || choices.error} messages={m} />
      {choices.error ? (
        <button type="button" className="inline-link" onClick={choices.reload}>
          {m.Common.retry}
        </button>
      ) : null}
      {error === 'CONFLICT' && existing ? (
        <p>
          {c.conflictHint}{' '}
          <button
            type="button"
            className="inline-link"
            onClick={async () => {
              const latest = await api<Brew>('/api/v1/brews/' + existing.id);
              setVersion(latest.version);
              setError('');
            }}
          >
            {c.refresh}
          </button>
        </p>
      ) : null}
      <form
        className="stack-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!stock) return;
          const data = new FormData(e.currentTarget);
          setBusy(true);
          setError('');
          try {
            const input: BrewInput = {
              itemId: selected,
              quantity: Math.round(
                Number(data.get('quantity')) * (drip ? 1 : 10),
              ),
              unit: coffeeUnit(stock.format),
              method: drip
                ? 'drip'
                : (String(data.get('method')) as BrewInput['method']),
              occurredAt: new Date(
                String(data.get('occurredAt')),
              ).toISOString(),
              rating: data.get('rating') ? Number(data.get('rating')) : null,
              note: String(data.get('note') || ''),
            };
            const serialized = JSON.stringify(input);
            if (serialized !== payload.current) {
              operation.current = crypto.randomUUID();
              payload.current = serialized;
            }
            const result = await api<Brew>(
              '/api/v1/brews' + (existing ? '/' + existing.id : ''),
              existing ? 'PATCH' : 'POST',
              existing
                ? { ...input, version }
                : { ...input, operationId: operation.current },
            );
            if (onSaved) onSaved(result);
            else router.push(`/${locale}/coffee/items/${result.itemId}`);
            router.refresh();
          } catch (e) {
            setError(errorCode(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset className="coffee-fieldset" disabled={busy}>
          <SelectField
            label={c.chooseCoffee}
            value={selected}
            required
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">{c.choose}</option>
            {options.map((i) => (
              <option value={i.id} key={i.id}>
                {i.name} — {c[i.format]}
              </option>
            ))}
          </SelectField>
          {!choices.items.length && !choices.error ? (
            <p className="muted">{c.noStock}</p>
          ) : null}
          {stock ? (
            <>
              <Field
                key={selected}
                label={`${c.dose}, ${drip ? c.pieces : c.grams}`}
                name="quantity"
                type="number"
                min={drip ? 1 : 0.1}
                step={drip ? 1 : 0.1}
                required
                defaultValue={
                  existing && existing.itemId === selected
                    ? existing.quantity / (drip ? 1 : 10)
                    : drip
                      ? 1
                      : undefined
                }
              />
              {!drip ? (
                <SelectField
                  key={'method' + selected}
                  label={c.method}
                  name="method"
                  defaultValue={
                    existing?.method === 'drip'
                      ? 'pour-over'
                      : existing?.method || 'pour-over'
                  }
                >
                  {brewMethods
                    .filter((v) => v !== 'drip')
                    .map((method) => (
                      <option key={method} value={method}>
                        {m.BrewMethods[method]}
                      </option>
                    ))}
                </SelectField>
              ) : null}
            </>
          ) : null}
          <Field
            label={c.occurredAt}
            name="occurredAt"
            type="datetime-local"
            required
            defaultValue={initialTime}
            hint={c.timeHint}
          />
          <Field
            label={c.rating}
            name="rating"
            type="number"
            min="1"
            max="10"
            step="1"
            defaultValue={existing?.rating ?? ''}
          />
          <NoteField label={c.note} name="note" defaultValue={existing?.note} />
          <div className="form-actions">
            <button className="button" disabled={busy || !stock}>
              {busy ? m.Common.sending : c.saveBrew}
            </button>
            <a className="button button-secondary" href={`/${locale}/brews`}>
              {m.Common.cancel}
            </a>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
export function AdjustmentForm({
  item,
  messages: m,
  onSaved,
}: {
  item: CoffeeItem;
  messages: UiMessages;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState('actual'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const op = useRef({ id: '', payload: '' });
  const c = m.Coffee;
  return (
    <section className="panel">
      <h2>{c.adjust}</h2>
      <Feedback code={error} messages={m} />
      {error === 'CONFLICT' ? (
        <p>
          {c.conflictHint}{' '}
          <button className="inline-link" onClick={onSaved}>
            {c.refresh}
          </button>
        </p>
      ) : null}
      <form
        className="stack-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setBusy(true);
          setError('');
          try {
            const input = {
              version: item.version,
              mode,
              quantity: Math.round(
                Number(data.get('quantity')) *
                  (item.format === 'drip' ? 1 : 10),
              ),
              reason: String(data.get('reason')),
            };
            const serialized = JSON.stringify(input);
            if (serialized !== op.current.payload)
              op.current = { id: crypto.randomUUID(), payload: serialized };
            await api(
              '/api/v1/coffee-items/' + item.id + '/adjustments',
              'POST',
              { ...input, operationId: op.current.id },
            );
            onSaved();
          } catch (e) {
            setError(errorCode(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <SelectField
          label={c.mode}
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        >
          <option value="actual">{c.actual}</option>
          <option value="delta">{c.delta}</option>
        </SelectField>
        <Field
          label={`${mode === 'actual' ? c.actual : c.delta}, ${item.format === 'drip' ? c.pieces : c.grams}`}
          name="quantity"
          type="number"
          step={item.format === 'drip' ? 1 : 0.1}
          min={mode === 'actual' ? 0 : undefined}
          required
          defaultValue={item.remaining / (item.format === 'drip' ? 1 : 10)}
        />
        <Field label={c.reason} name="reason" required maxLength={5000} />
        <button className="button fit-content" disabled={busy}>
          {busy ? m.Common.sending : m.Common.save}
        </button>
      </form>
    </section>
  );
}
