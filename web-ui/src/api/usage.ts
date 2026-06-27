export interface LogUsagePayload {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalDurationSec: number;
  loadDurationSec: number;
  evalDurationSec: number;
  status: 'success' | 'error' | 'cancelled';
}

export async function logUsage(
  connectionUrl: string,
  accessToken: string,
  payload: LogUsagePayload
): Promise<void> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };
  if (accessToken) {
    headers['X-DDO-Token'] = accessToken;
  }

  try {
    const res = await fetch(`${connectionUrl}/api/usage`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      console.warn(`Failed to log usage. Server returned status: ${res.status}`);
    }
  } catch (err) {
    console.error("Failed to send usage log to server", err);
  }
}
