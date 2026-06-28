import { useEffect } from 'react';
import type { DdoSettings, QueueJob } from '../types';
import { fetchQueue } from '../api/queue';

interface UseQueueSyncProps {
  isInitialized: boolean;
  settings: DdoSettings;
  setJobQueue: React.Dispatch<React.SetStateAction<QueueJob[]>>;
  handleActiveCount: (count: number) => void;
}

export function useQueueSync({
  isInitialized,
  settings,
  setJobQueue,
  handleActiveCount
}: UseQueueSyncProps) {
  useEffect(() => {
    if (!isInitialized || !settings.accessToken || !settings.isSharedMode) return;
    
    let active = true;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const pollQueue = async () => {
      if (!active) return;
      try {
        const q = await fetchQueue(
          settings.connectionUrl,
          settings.accessToken,
          settings.username,
          handleActiveCount
        );
        if (active) setJobQueue(q);
      } catch (e) {
        console.error("Queue poll failed", e);
      }
      if (active) {
        timerId = setTimeout(pollQueue, 1500);
      }
    };

    void pollQueue();

    return () => {
      active = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [isInitialized, settings.accessToken, settings.isSharedMode, settings.connectionUrl, settings.username, handleActiveCount, setJobQueue]);
}
