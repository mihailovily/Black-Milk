'use client';
import { useId, useState } from 'react';
import type { CoffeeInput, CoffeeItem, CoffeeSet } from '@/contracts/coffee';
import type { UiMessages } from './ui-messages';
import { Field } from './field';

export function SelectField({
  label,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const id = useId();
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} {...props}>
        {children}
      </select>
    </div>
  );
}
export function NoteField({
  label,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const id = useId();
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} maxLength={5000} rows={3} {...props} />
    </div>
  );
}
export function readCoffee(data: FormData, prefix = ''): CoffeeInput {
  const get = (key: string) => String(data.get(prefix + key) || '');
  const format = get('format') as CoffeeInput['format'];
  return {
    name: get('name'),
    format,
    initialQuantity: Math.round(
      Number(get('initialQuantity')) * (format === 'drip' ? 1 : 10),
    ),
    ...Object.fromEntries(
      [
        'roaster',
        'country',
        'region',
        'processing',
        'tastingNotes',
        'note',
      ].map((k) => [k, get(k)]),
    ),
    roastDate: get('roastDate') || null,
    openedDate: get('openedDate') || null,
    bestBefore: get('bestBefore') || null,
    dripWeight:
      format === 'drip' && get('dripWeight')
        ? Math.round(Number(get('dripWeight')) * 10)
        : null,
    repeat: data.has(prefix + 'repeat'),
    setId: get('setId') || null,
  };
}
export function CoffeeFields({
  messages: m,
  item,
  prefix = '',
  sets = [],
  fixedSetId,
  lockedFormat = false,
}: {
  messages: UiMessages;
  item?: CoffeeItem;
  prefix?: string;
  sets?: CoffeeSet[];
  fixedSetId?: string;
  lockedFormat?: boolean;
}) {
  const c = m.Coffee;
  const [format, setFormat] = useState(item?.format || 'beans');
  const unit = format === 'drip' ? c.pieces : c.grams;
  return (
    <>
      <Field
        label={c.name}
        name={prefix + 'name'}
        defaultValue={item?.name}
        required
        maxLength={200}
      />
      <div className="coffee-form-grid">
        <SelectField
          label={c.format}
          name={prefix + 'format'}
          value={format}
          onChange={(e) => setFormat(e.target.value as typeof format)}
          disabled={lockedFormat}
        >
          {(['beans', 'ground', 'drip'] as const).map((f) => (
            <option key={f} value={f}>
              {c[f]}
            </option>
          ))}
        </SelectField>
        {lockedFormat ? (
          <input type="hidden" name={prefix + 'format'} value={format} />
        ) : null}
        <Field
          key={format}
          label={`${c.quantity}, ${unit}`}
          name={prefix + 'initialQuantity'}
          type="number"
          min={format === 'drip' ? 1 : 0.1}
          step={format === 'drip' ? 1 : 0.1}
          max={format === 'drip' ? 100000000 : 10000000}
          defaultValue={
            item && item.format === format
              ? item.initialQuantity / (format === 'drip' ? 1 : 10)
              : undefined
          }
          required
        />
      </div>
      {fixedSetId !== undefined ? (
        <input type="hidden" name={prefix + 'setId'} value={fixedSetId} />
      ) : (
        <SelectField
          label={c.set}
          name={prefix + 'setId'}
          defaultValue={item?.setId || ''}
        >
          <option value="">{c.noSet}</option>
          {sets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
      )}
      <details className="coffee-details">
        <summary>{c.details}</summary>
        <div className="stack-form">
          <div className="coffee-form-grid">
            {(
              [
                'roaster',
                'country',
                'region',
                'processing',
                'tastingNotes',
              ] as const
            ).map((key) => (
              <Field
                key={key}
                label={c[key]}
                name={prefix + key}
                maxLength={key === 'tastingNotes' ? 5000 : 200}
                defaultValue={item?.[key]}
              />
            ))}
            {(['roastDate', 'openedDate', 'bestBefore'] as const).map((key) => (
              <Field
                key={key}
                label={c[key]}
                name={prefix + key}
                type="date"
                defaultValue={item?.[key] || ''}
              />
            ))}
            {format === 'drip' ? (
              <Field
                label={c.dripWeight}
                name={prefix + 'dripWeight'}
                type="number"
                min="0.1"
                step="0.1"
                defaultValue={
                  item?.dripWeight ? item.dripWeight / 10 : undefined
                }
              />
            ) : null}
          </div>
          <NoteField
            label={c.note}
            name={prefix + 'note'}
            defaultValue={item?.note}
          />
          <label className="coffee-check">
            <input
              name={prefix + 'repeat'}
              type="checkbox"
              defaultChecked={item?.repeat}
            />
            {c.repeat}
          </label>
        </div>
      </details>
    </>
  );
}
export function quantityText(
  value: number,
  format: string,
  locale: string,
  m: UiMessages,
) {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / (format === 'drip' ? 1 : 10))} ${format === 'drip' ? m.Coffee.pieces : m.Coffee.grams}`;
}
