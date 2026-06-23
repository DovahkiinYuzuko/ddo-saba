import type { QueueJob } from '../types';

export async function fetchQueue(connectionUrl: string, token: string): Promise<QueueJob[]> {
  const headers: HeadersInit = {};
  if (token) {
    headers['X-DDO-Token'] = token;
  }
  const res = await fetch(`${connectionUrl}/api/queue`, {
    method: 'GET',
    headers
  });
  if (res.status === 204) return [];
  if (!res.ok) throw new Error(`Queue fetch failed with status ${res.status}`);
  return res.json() as Promise<QueueJob[]>;
}

export async function joinQueue(connectionUrl: string, token: string, id: string, username: string): Promise<void> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) {
    headers['X-DDO-Token'] = token;
  }
  const res = await fetch(`${connectionUrl}/api/queue`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'join', id, username })
  });
  if (!res.ok) throw new Error(`Queue join failed with status ${res.status}`);
}

export async function cancelQueue(connectionUrl: string, token: string, id: string): Promise<void> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) {
    headers['X-DDO-Token'] = token;
  }
  const res = await fetch(`${connectionUrl}/api/queue`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'cancel', id })
  });
  if (!res.ok) throw new Error(`Queue cancel failed with status ${res.status}`);
}

export async function completeQueue(connectionUrl: string, token: string, id: string): Promise<void> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) {
    headers['X-DDO-Token'] = token;
  }
  const res = await fetch(`${connectionUrl}/api/queue`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'complete', id })
  });
  if (!res.ok) throw new Error(`Queue complete failed with status ${res.status}`);
}
