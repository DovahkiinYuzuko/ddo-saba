import { clientId } from './clientId';

const getHeaders = (accessToken: string, username?: string): HeadersInit => {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (accessToken) {
    headers['X-DDO-Token'] = accessToken;
  }
  if (username) {
    headers['X-DDO-Username'] = username;
  }
  headers['X-DDO-Client-Id'] = clientId;
  return headers;
};

export const pollMessage = async (
  connectionUrl: string,
  accessToken: string,
  sinceId: string,
  username?: string,
  onActiveCount?: (count: number) => void
): Promise<any[]> => {
  const headers = getHeaders(accessToken, username) as Record<string, string>;
  if (sinceId) {
    headers['X-DDO-Since-Id'] = sinceId;
  }
  const res = await fetch(`${connectionUrl}/api/poll`, { headers });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const countHeader = res.headers.get('X-DDO-Active-Count');
  if (countHeader && onActiveCount) {
    onActiveCount(parseInt(countHeader, 10));
  }
  if (res.status === 204) {
    return [];
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
};

export const broadcastMessage = async (
  connectionUrl: string,
  accessToken: string,
  sender: string,
  broadcaster: string,
  role: string,
  content: string,
  id?: string,
  username?: string,
  onActiveCount?: (count: number) => void
): Promise<{ status: string; id: string }> => {
  const headers = getHeaders(accessToken, username);
  const res = await fetch(`${connectionUrl}/api/broadcast`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id, sender, broadcaster, role, content })
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const countHeader = res.headers.get('X-DDO-Active-Count');
  if (countHeader && onActiveCount) {
    onActiveCount(parseInt(countHeader, 10));
  }
  const text = await res.text();
  return text ? JSON.parse(text) : { status: 'ok', id: '' };
};

export const fetchHistory = async (
  connectionUrl: string,
  accessToken: string,
  username?: string,
  onActiveCount?: (count: number) => void
): Promise<unknown> => {
  const headers = getHeaders(accessToken, username);
  const res = await fetch(`${connectionUrl}/api/history`, { headers });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const countHeader = res.headers.get('X-DDO-Active-Count');
  if (countHeader && onActiveCount) {
    onActiveCount(parseInt(countHeader, 10));
  }
  if (res.status === 204) {
    return [];
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
};

export const broadcastModel = async (
  connectionUrl: string,
  accessToken: string,
  sender: string,
  model: string,
  timestamp: number,
  isGenerating?: boolean,
  generatingText?: string,
  username?: string,
  onActiveCount?: (count: number) => void
): Promise<void> => {
  const headers = getHeaders(accessToken, username);
  const res = await fetch(`${connectionUrl}/api/model`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sender, model, timestamp, isGenerating, generatingText })
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const countHeader = res.headers.get('X-DDO-Active-Count');
  if (countHeader && onActiveCount) {
    onActiveCount(parseInt(countHeader, 10));
  }
};

export const pollModel = async (
  connectionUrl: string,
  accessToken: string,
  username?: string,
  onActiveCount?: (count: number) => void
): Promise<{ model?: string; sender?: string; timestamp?: number }> => {
  const headers = getHeaders(accessToken, username);
  const res = await fetch(`${connectionUrl}/api/model`, { headers });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const countHeader = res.headers.get('X-DDO-Active-Count');
  if (countHeader && onActiveCount) {
    onActiveCount(parseInt(countHeader, 10));
  }
  if (res.status === 204) {
    return {};
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
};
