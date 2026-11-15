import { notFound } from 'next/navigation';
import { ProtectedScreen } from '@/components/protected-screen';
import { BrewsPanel } from '@/components/coffee-panel';
import { getUiMessages } from '@/components/ui-messages';
export default async function BrewsPage({
  params,
}: {
  params: Promise<{ locale: string; segments?: string[] }>;
}) {
  const { locale, segments = [] } = await params;
  if (
    segments.length &&
    !(segments.length === 1 && segments[0] === 'new') &&
    !(
      segments.length === 2 &&
      /^[\da-f-]{36}$/.test(segments[0]) &&
      segments[1] === 'edit'
    )
  )
    notFound();
  const m = getUiMessages(locale);
  return (
    <ProtectedScreen
      locale={locale}
      path={'/brews' + (segments.length ? '/' + segments.join('/') : '')}
      title={m.Coffee.brews}
    >
      <BrewsPanel locale={locale} messages={m} path={segments} />
    </ProtectedScreen>
  );
}
