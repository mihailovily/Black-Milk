import { AdminPanel } from '@/components/admin-panel';
import { ProtectedScreen } from '@/components/protected-screen';
import { getUiMessages } from '@/components/ui-messages';
export default async function AdminUserPage({
  params,
}: {
  params: Promise<{ locale: string; userId: string }>;
}) {
  const { locale, userId } = await params;
  return (
    <ProtectedScreen
      locale={locale}
      path={'/admin/users/' + encodeURIComponent(userId)}
      admin
    >
      <AdminPanel
        locale={locale}
        section="detail"
        userId={userId}
        messages={getUiMessages(locale)}
      />
    </ProtectedScreen>
  );
}
