import { useEffect } from 'react';
import type { DdoSettings, QueueJob } from '../types';
import { fetchQueue } from '../api/queue';
import type { ChatMachineEvent } from '../machines/chatMachine';

interface UseQueueSyncProps {
  isInitialized: boolean;
  settings: DdoSettings;
  setJobQueue: React.Dispatch<React.SetStateAction<QueueJob[]>>;
  handleActiveCount: (count: number) => void;
  send: (event: ChatMachineEvent) => void;
}

export function useQueueSync({
  isInitialized,
  settings,
  setJobQueue,
  handleActiveCount,
  send
}: UseQueueSyncProps) {
  useEffect(() => {
    if (!isInitialized || !settings.accessToken || !settings.isSharedMode) return;
    
    let active = true;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let errorCount = 0;

    const pollQueue = async () => {
      if (!active) return;
      try {
        const q = await fetchQueue(
          settings.connectionUrl,
          settings.accessToken,
          settings.username,
          handleActiveCount
        );
        errorCount = 0;
        if (active) setJobQueue(q);
      } catch (e) {
        console.error("Queue poll failed", e);
        errorCount++;
        if (errorCount >= 3) {
          console.warn("Queue polling failed 3 consecutive times. Rolling back waiting state.");
          if (active) {
            send({ type: 'CANCEL_QUEUE' });
          }
        }
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
  }, [isInitialized, settings.accessToken, settings.isSharedMode, settings.connectionUrl, settings.username, handleActiveCount, setJobQueue, send]);
}
