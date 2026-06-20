const getHeaders = (accessToken: string): HeadersInit => {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (accessToken) {
    headers['X-DDO-Token'] = accessToken;
  }
  return headers;
};

export const pollMessage = async (
  connectionUrl: string,
  accessToken: string
): Promise<unknown> => {
  const headers = getHeaders(accessToken);
  const res = await fetch(`${connectionUrl}/api/poll`, { headers });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
};

export const broadcastMessage = async (
  connectionUrl: string,
  accessToken: string,
  sender: string,
  role: string,
  content: string
): Promise<void> => {
  const headers = getHeaders(accessToken);
  const res = await fetch(`${connectionUrl}/api/broadcast`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sender, role, content })
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
};
