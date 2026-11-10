import ru from '../../messages/ru.json';
import en from '../../messages/en.json';
export function getUiMessages(locale: string) {
  const source = locale === 'en' ? en : ru;
  return {
    Common: source.Common,
    Auth: source.Auth,
    Account: source.Account,
    Admin: source.Admin,
    Errors: source.Errors,
    AuditActions: source.AuditActions,
  };
}
export type UiMessages = ReturnType<typeof getUiMessages>;
