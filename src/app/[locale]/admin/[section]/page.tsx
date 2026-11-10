import { notFound } from 'next/navigation';
import { AdminPanel, type AdminSection } from '@/components/admin-panel';
import { ProtectedScreen } from '@/components/protected-screen';
import { getUiMessages } from '@/components/ui-messages';
export default async function AdminSectionPage({
  params,
}: {
  params: Promise<{ locale: string; section: string }>;
}) {
  const { locale, section } = await params;
  if (
    !['users', 'invitations', 'access-grants', 'settings', 'audit'].includes(
      section,
    )
  )
    notFound();
  return (
    <ProtectedScreen locale={locale} path={'/admin/' + section} admin>
      <AdminPanel
        locale={locale}
        section={section as AdminSection}
        messages={getUiMessages(locale)}
      />
    </ProtectedScreen>
  );
}
