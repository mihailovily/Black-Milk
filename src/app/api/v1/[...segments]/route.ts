import { z } from 'zod';
import { endpoint } from '@/server/http';
import { checkOrigin, limitRequest, requireSession } from '@/server/security';
import { AppError } from '@/server/errors';
import { getConfig, googleEnabled, ConfigurationError } from '@/server/config';
import * as service from '@/server/accounts';
import { getAuth } from '@/server/auth';
import * as coffee from '@/server/coffee';

export const dynamic = 'force-dynamic';
async function handle(request: Request) {
  return endpoint(async () => {
    const url = new URL(request.url);
    const path = url.pathname
      .slice('/api/v1/'.length)
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent);
    const method = request.method;
    const mutation = method !== 'GET';
    if (path.join('/') === 'auth-config' && method === 'GET') {
      try {
        getConfig();
      } catch (error) {
        if (error instanceof ConfigurationError)
          return { configured: false, google: false, registrationMode: null };
        throw error;
      }
      const current = await getAuth().api.getSession({
        headers: request.headers,
      });
      let viewer = null;
      if (current) {
        try {
          const active = await requireSession(request.headers);
          viewer = { name: active.user.name, role: active.user.role };
        } catch {
          /* Invalid and blocked sessions are anonymous here. */
        }
      }
      return {
        configured: true,
        google: googleEnabled(),
        registrationMode: (await service.getSettings()).registrationMode,
        viewer,
      };
    }
    if (mutation) checkOrigin(request);
    if (path.join('/') === 'activate') {
      if (method === 'GET')
        return service.inspectActivation(url.searchParams.get('token') || '');
      if (method === 'POST') {
        await limitRequest(request, 'activate', 20);
        return service.activate(await request.json());
      }
    }
    const current = await requireSession(request.headers, path[0] === 'admin');
    if (mutation) await limitRequest(request, 'user:' + current.user.id, 60);
    if (['coffee-items', 'coffee-sets', 'brews'].includes(path[0])) {
      const owner = current.user.id;
      const id = path[1];
      if (id) z.string().uuid().parse(id);
      if (path.length === 1) {
        if (method === 'GET')
          return path[0] === 'brews'
            ? coffee.listBrews(owner, url)
            : coffee.listInventory(owner, url, path[0] === 'coffee-sets');
        if (method === 'POST') {
          const input = await request.json();
          return path[0] === 'brews'
            ? coffee.createBrew(owner, input)
            : path[0] === 'coffee-sets'
              ? coffee.createSet(owner, input)
              : coffee.createItem(owner, input);
        }
      }
      if (path.length === 2 && id) {
        if (method === 'GET')
          return path[0] === 'brews'
            ? coffee.getBrew(owner, id)
            : path[0] === 'coffee-sets'
              ? coffee.getSet(owner, id)
              : coffee.getItem(owner, id);
        if (method === 'PATCH' || method === 'DELETE') {
          const input = await request.json();
          if (path[0] === 'brews')
            return coffee.updateBrew(owner, id, input, method === 'DELETE');
          if (path[0] === 'coffee-sets')
            return method === 'DELETE'
              ? coffee.deleteSet(owner, id, input)
              : coffee.updateSet(owner, id, input);
          return method === 'DELETE'
            ? coffee.deleteItem(owner, id, input)
            : coffee.updateItem(owner, id, input);
        }
      }
      if (
        path[0] === 'coffee-items' &&
        id &&
        path.length === 3 &&
        path[2] === 'adjustments'
      ) {
        if (method === 'GET')
          return (await coffee.getItem(owner, id)).adjustments;
        if (method === 'POST')
          return coffee.adjustItem(owner, id, await request.json());
      }
      throw new AppError('NOT_FOUND', 404);
    }
    if (path[0] === 'me') {
      if (path.length === 1 && method === 'GET')
        return service.getProfile(current.user.id);
      if (path.length === 1 && method === 'PATCH')
        return service.updateProfile(current.user.id, await request.json());
      if (path[1] === 'sessions') {
        if (path.length === 2 && method === 'GET')
          return service.listSessions(current.user.id, current.sessionId);
        if (method === 'DELETE' && path.length <= 3)
          return service.revokeSessions(
            current.user.id,
            current.sessionId,
            path[2],
          );
      }
    }
    if (path[0] === 'admin') {
      const id = path[2];
      if (id) z.string().min(1).max(254).parse(id);
      if (path[1] === 'users') {
        if (path.length === 2 && method === 'GET')
          return service.listUsers(url);
        if (path.length === 2 && method === 'POST')
          return service.inviteUser(current.user.id, await request.json());
        if (path.length === 3 && method === 'GET')
          return service.getProfile(id);
        if (path.length === 3 && method === 'PATCH')
          return service.updateUser(current.user.id, id, await request.json());
        if (path.length === 3 && method === 'DELETE')
          return service.deleteUser(current.user.id, id, await request.json());
        if (path[3] === 'sessions') {
          if (path.length === 4 && method === 'GET')
            return service.listSessions(id);
          if (method === 'DELETE' && path.length <= 5)
            return service.adminRevokeSessions(current.user.id, id, path[4]);
        }
      }
      if (path[1] === 'access-grants') {
        if (path.length === 2 && method === 'GET') return service.listGrants();
        if (path.length === 2 && method === 'POST') {
          const { email } = z
            .object({ email: service.emailInput })
            .strict()
            .parse(await request.json());
          return service.changeGrant(current.user.id, email);
        }
        if (path.length === 3 && method === 'DELETE')
          return service.changeGrant(current.user.id, id, true);
      }
      if (path[1] === 'invitations') {
        if (path.length === 2 && method === 'GET')
          return service.listInvitations();
        if (path.length === 3 && method === 'DELETE')
          return service.cancelInvitation(current.user.id, id);
        if (path.length === 4 && path[3] === 'resend' && method === 'POST')
          return service.inviteUser(current.user.id, await request.json(), id);
      }
      if (path.join('/') === 'admin/settings') {
        if (method === 'GET') return service.getSettings();
        if (method === 'PATCH')
          return service.updateSettings(current.user.id, await request.json());
      }
      if (path.join('/') === 'admin/audit' && method === 'GET')
        return service.listAudit(url);
    }
    throw new AppError('NOT_FOUND', 404);
  });
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
