import { createServer as createTcpServer } from 'node:net';
import { createServer } from 'node:http';
export async function startMailbox(
  smtpPort = 3102,
  httpPort = 3101,
  resetLimits?: () => Promise<void>,
) {
  const messages: string[] = [];
  const smtp = createTcpServer((socket) => {
    socket.write('220 localhost ESMTP test mailbox\r\n');
    let buffer = '';
    let data = false;
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      while (buffer.includes('\r\n')) {
        if (data) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end < 0) return;
          messages.push(buffer.slice(0, end));
          buffer = buffer.slice(end + 5);
          data = false;
          socket.write('250 Stored\r\n');
          continue;
        }
        const end = buffer.indexOf('\r\n');
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (/^DATA$/i.test(line)) {
          data = true;
          socket.write('354 End with dot\r\n');
        } else if (/^QUIT/i.test(line)) socket.end('221 Goodbye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  });
  const http = createServer(async (request, response) => {
    if (
      request.url === '/reset-limits' &&
      request.method === 'POST' &&
      resetLimits
    ) {
      await resetLimits();
      response.writeHead(204).end();
      return;
    }
    if (request.url !== '/messages') {
      response.writeHead(404).end();
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(messages));
  });
  await new Promise<void>((resolve) =>
    smtp.listen(smtpPort, '127.0.0.1', resolve),
  );
  await new Promise<void>((resolve) =>
    http.listen(httpPort, '127.0.0.1', resolve),
  );
  return {
    messages,
    stop: async () => {
      await Promise.all([
        new Promise<void>((resolve) => smtp.close(() => resolve())),
        new Promise<void>((resolve) => http.close(() => resolve())),
      ]);
    },
  };
}
