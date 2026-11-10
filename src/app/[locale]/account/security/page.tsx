import { ProtectedScreen } from '@/components/protected-screen';
import { AccountPanel } from '@/components/account-panel';
import { getUiMessages } from '@/components/ui-messages';
export default async function SecurityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <ProtectedScreen locale={locale} path="/account/security">
      <AccountPanel locale={locale} security messages={getUiMessages(locale)} />
    </ProtectedScreen>
  );
}
