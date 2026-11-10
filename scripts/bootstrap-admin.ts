import './env';
import { emailInput } from '../src/server/accounts';
import { bootstrapAdmin } from '../src/server/access';
import { closeDb } from '../src/server/db';
const index = process.argv.indexOf('--email');
try {
  const email = emailInput.parse(index >= 0 ? process.argv[index + 1] : '');
  await bootstrapAdmin(email);
  console.log(
    'Administrator access reserved. Verify the address through sign-up or Google sign-in.',
  );
} finally {
  await closeDb();
}
