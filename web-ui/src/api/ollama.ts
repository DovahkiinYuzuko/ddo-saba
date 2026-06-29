import type { DdoSettings, DdoParameters, OllamaModelInfo, PsModelInfo } from '../types';

import { clientId } from './clientId';

const getHeaders = (accessToken: string): HeadersInit => {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (accessToken) {
    headers['X-DDO-Token'] = accessToken;
  }
  headers['X-DDO-Client-Id'] = clientId;
  return headers;
};

const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(id);
  }
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

  // 60s timeout since model loading into VRAM can take time
  const res = await fetchWithTimeout(`${settings.connectionUrl}/api/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelName,
      options: optionsPayload,
      keep_alive: 300,
      stream: false
    })
  }, 60000);

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  await res.text();
};

export const fetchModels = async (
  connectionUrl: string,
  accessToken: string
): Promise<OllamaModelInfo[]> => {
  const headers = getHeaders(accessToken);
  const tagsRes = await fetchWithTimeout(`${connectionUrl}/api/tags`, { headers }, 10000);
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
  const psRes = await fetchWithTimeout(`${connectionUrl}/api/ps`, { headers }, 10000);
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
  await fetchWithTimeout(`${connectionUrl}/api/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelName,
      messages: [],
      keep_alive: 300
    })
  }, 10000);
};

export const unloadModel = async (
  modelName: string,
  connectionUrl: string,
  accessToken: string
): Promise<void> => {
  const headers = getHeaders(accessToken);
  
  let res: Response | undefined = undefined;
  const retries = 3;
  const delay = 1000;

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const fetchRes = await fetchWithTimeout(`${connectionUrl}/api/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelName,
          messages: [],
          keep_alive: '0s',
          stream: false
        })
      }, 15000);

      res = fetchRes;

      if (fetchRes.status === 503 && attempt <= retries) {
        console.log(`Unload received 503, retrying... (Attempt ${attempt}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      break;
    } catch (err) {
      if (attempt <= retries) {
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }

  if (!res) {
    throw new Error("Failed to contact server for model unload");
  }

  if (!res.ok) {
    throw new Error(`Unload failed with status ${res.status}`);
  }

  await res.text();
};
