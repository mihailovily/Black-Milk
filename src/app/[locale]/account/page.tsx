import { ProtectedScreen } from '@/components/protected-screen';
import { AccountPanel } from '@/components/account-panel';
import { getUiMessages } from '@/components/ui-messages';
export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <ProtectedScreen locale={locale} path="/account">
      <AccountPanel locale={locale} messages={getUiMessages(locale)} />
    </ProtectedScreen>
  );
}
