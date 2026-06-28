// Run in pure Node environment
import { describe, it, expect, vi } from 'vitest';
import { useInitializeSettings } from './useInitializeSettings';

// Partially mock react hooks to run synchronously without DOM environment
vi.mock('react', async () => {
  const actual = await vi.importActual('react') as any;
  return {
    ...actual,
    useState: () => {
      const setVal = vi.fn();
      return [true, setVal];
    },
    useEffect: (fn: any, _deps: any) => {
      fn(); // execute effect immediately
      return () => {};
    }
  };
});

describe('useInitializeSettings', () => {
  it('should parse URL parameters and update settings', () => {
    const originalWindow = (globalThis as any).window;

    // Define global window object for Node environment
    (globalThis as any).window = {
      location: {
        search: '?token=test-token&sharedMode=true',
        origin: 'http://localhost:3000'
      }
    };

    const setSettings = vi.fn();

    const isInitialized = useInitializeSettings(setSettings);

    // Verify hook behavior
    expect(isInitialized).toBe(true);
    expect(setSettings).toHaveBeenCalled();

    // Verify settings payload contents
    const updateFn = setSettings.mock.calls[0][0] as (prev: any) => any;
    const dummyPrev = { connectionUrl: '', accessToken: '', isSharedMode: false, username: '' };
    const updated = updateFn(dummyPrev);

    expect(updated.accessToken).toBe('test-token');
    expect(updated.isSharedMode).toBe(true);
    expect(updated.connectionUrl).toBe('http://localhost:8088'); // localhost:3000 mapping
    expect(updated.username).toContain('Guest_');

    // Restore global window
    if (originalWindow) {
      (globalThis as any).window = originalWindow;
    } else {
      delete (globalThis as any).window;
    }
  });
});
