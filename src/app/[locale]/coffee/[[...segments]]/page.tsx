import { notFound } from 'next/navigation';
import { ProtectedScreen } from '@/components/protected-screen';
import { CoffeePanel } from '@/components/coffee-panel';
import { getUiMessages } from '@/components/ui-messages';
export default async function CoffeePage({
  params,
}: {
  params: Promise<{ locale: string; segments?: string[] }>;
}) {
  const { locale, segments = [] } = await params;
  const [kind, id, action] = segments;
  const valid =
    !segments.length ||
    (kind === 'new' && segments.length === 1) ||
    (kind === 'sets' && id === 'new' && segments.length === 2) ||
    (['items', 'sets'].includes(kind) &&
      /^[\da-f-]{36}$/.test(id || '') &&
      (segments.length === 2 ||
        (segments.length === 3 &&
          (kind === 'sets'
            ? ['edit', 'copy', 'add']
            : ['edit', 'copy', 'brew', 'adjust']
          ).includes(action))));
  if (!valid) notFound();
  const m = getUiMessages(locale);
  return (
    <ProtectedScreen
      locale={locale}
      path={'/coffee' + (segments.length ? '/' + segments.join('/') : '')}
      title={m.Coffee.title}
    >
      <CoffeePanel locale={locale} messages={m} path={segments} />
    </ProtectedScreen>
  );
}
