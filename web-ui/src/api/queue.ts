import type { QueueJob } from '../types';

const getHeaders = (token: string, username?: string): HeadersInit => {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) {
    headers['X-DDO-Token'] = token;
  }
  if (username) {
    headers['X-DDO-Username'] = username;
  }
  return headers;
};

export async function fetchQueue(
  connectionUrl: string,
  token: string,
  username?: string,
  onActiveCount?: (count: number) => void
): Promise<QueueJob[]> {
  const headers = getHeaders(token, username);
  const res = await fetch(`${connectionUrl}/api/queue`, {
    method: 'GET',
    headers
  });
  if (res.status === 204) return [];
  if (!res.ok) throw new Error(`Queue fetch failed with status ${res.status}`);
  
  const countHeader = res.headers.get('X-DDO-Active-Count');
  if (countHeader && onActiveCount) {
    onActiveCount(parseInt(countHeader, 10));
  }
  
  return res.json() as Promise<QueueJob[]>;
}

export async function joinQueue(
  connectionUrl: string,
  token: string,
  id: string,
  username: string,
  onActiveCount?: (count: number) => void
): Promise<void> {
  const headers = getHeaders(token, username);
  const res = await fetch(`${connectionUrl}/api/queue`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'join', id, username })
  });
  if (!res.ok) throw new Error(`Queue join failed with status ${res.status}`);
  
  const countHeader = res.headers.get('X-DDO-Active-Count');
  if (countHeader && onActiveCount) {
    onActiveCount(parseInt(countHeader, 10));
  }
}

export async function cancelQueue(
  connectionUrl: string,
  token: string,
  id: string,
  username?: string,
  onActiveCount?: (count: number) => void
): Promise<void> {
  const headers = getHeaders(token, username);
  const res = await fetch(`${connectionUrl}/api/queue`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'cancel', id })
  });
  if (!res.ok) throw new Error(`Queue cancel failed with status ${res.status}`);
  
  const countHeader = res.headers.get('X-DDO-Active-Count');
  if (countHeader && onActiveCount) {
    onActiveCount(parseInt(countHeader, 10));
  }
}

export async function completeQueue(
  connectionUrl: string,
  token: string,
  id: string,
  username?: string,
  onActiveCount?: (count: number) => void
): Promise<void> {
  const headers = getHeaders(token, username);
  const res = await fetch(`${connectionUrl}/api/queue`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'complete', id })
  });
  if (!res.ok) throw new Error(`Queue complete failed with status ${res.status}`);
  
  const countHeader = res.headers.get('X-DDO-Active-Count');
  if (countHeader && onActiveCount) {
    onActiveCount(parseInt(countHeader, 10));
  }
}
