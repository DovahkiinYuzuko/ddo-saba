import { useState, useEffect } from 'react';
import type { DdoSettings } from '../types';

export function useInitializeSettings(
  setSettings: React.Dispatch<React.SetStateAction<DdoSettings>>
): boolean {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('token') || params.get('accessToken') || '';
    const isSharedModeFromUrl = params.get('sharedMode') === 'true' || params.get('isSharedMode') === 'true';
    
    setSettings(prev => ({
      ...prev,
      connectionUrl: window.location.origin.includes('localhost:3000')
        ? 'http://localhost:8088'
        : window.location.origin,
      accessToken: tokenFromUrl || prev.accessToken,
      isSharedMode: isSharedModeFromUrl || prev.isSharedMode,
      username: 'Guest_' + Math.floor(Math.random() * 1000)
    }));
    setIsInitialized(true);
  }, [setSettings]);

  return isInitialized;
}
