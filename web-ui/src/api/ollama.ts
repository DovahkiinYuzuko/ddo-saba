import type { DdoSettings, DdoParameters, OllamaModelInfo, PsModelInfo } from '../types';

const getHeaders = (accessToken: string): HeadersInit => {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (accessToken) {
    headers['X-DDO-Token'] = accessToken;
  }
  return headers;
};

export const loadModelOnSelection = async (
  modelName: string,
  settings: DdoSettings,
  parameters: DdoParameters,
  numPredictEnabled: boolean
): Promise<void> => {
  if (!modelName) return;

  const headers = getHeaders(settings.accessToken);
  const optionsPayload: Record<string, unknown> = { ...parameters };
  if (!numPredictEnabled) {
    delete optionsPayload.num_predict;
  }

  const res = await fetch(`${settings.connectionUrl}/api/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelName,
      options: optionsPayload,
      keep_alive: 300
    })
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
};

export const fetchModels = async (
  connectionUrl: string,
  accessToken: string
): Promise<OllamaModelInfo[]> => {
  const headers = getHeaders(accessToken);
  const tagsRes = await fetch(`${connectionUrl}/api/tags`, { headers });
  if (!tagsRes.ok) {
    throw new Error(`HTTP ${tagsRes.status}`);
  }
  const data = await tagsRes.json();
  return data.models?.map((m: { name: string; size?: number }) => ({
    name: m.name,
    size: m.size
  })) || [];
};

export const fetchPs = async (
  connectionUrl: string,
  accessToken: string
): Promise<PsModelInfo | null> => {
  const headers = getHeaders(accessToken);
  const psRes = await fetch(`${connectionUrl}/api/ps`, { headers });
  if (!psRes.ok) {
    throw new Error(`HTTP ${psRes.status}`);
  }
  const data = await psRes.json();
  if (data.models && data.models.length > 0) {
    const m = data.models[0];
    return {
      name: m.name,
      size: m.size,
      processor: m.size_vram > 0 ? 'GPU' : 'CPU',
      until: m.expires_at || ''
    };
  }
  return null;
};

export const keepAliveModel = async (
  modelName: string,
  connectionUrl: string,
  accessToken: string
): Promise<void> => {
  const headers = getHeaders(accessToken);
  await fetch(`${connectionUrl}/api/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelName,
      messages: [],
      keep_alive: 300
    })
  });
};

export const unloadModel = async (
  modelName: string,
  connectionUrl: string,
  accessToken: string
): Promise<void> => {
  const headers = getHeaders(accessToken);
  await fetch(`${connectionUrl}/api/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelName,
      messages: [],
      keep_alive: 0
    })
  });
};
