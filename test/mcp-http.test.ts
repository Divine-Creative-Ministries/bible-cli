import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMcpHttpServer } from '../src/mcp/server.js';

let server: http.Server;
let port: number;

/**
 * http.request sends `path` verbatim as the request target. fetch() and curl
 * normalize it, which would hide exactly the input these tests are about.
 */
function get(target: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ port, host: '127.0.0.1', path: target, agent: false }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

beforeAll(async () => {
  server = createMcpHttpServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('MCP HTTP server request-target handling', () => {
  // Each of these makes `new URL(target, base)` throw. Thrown from the async
  // request handler, that is an unhandled rejection, which kills the process.
  it.each(['//', '///', '//[', '//%zz', 'http://'])('answers malformed target %s with a 400', async (target) => {
    const res = await get(target);
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'bad request — malformed request target' });
  });

  it('keeps serving /healthz after malformed targets', async () => {
    await get('//');
    const res = await get('/healthz');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, server: 'bible-cli-mcp' });
  });

  it('still routes well-formed targets', async () => {
    expect((await get('/healthz?probe=1')).status).toBe(200);
    expect((await get('/nope')).status).toBe(404);
  });
});
