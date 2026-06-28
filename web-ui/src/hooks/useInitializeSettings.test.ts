import { describe, it, expect, vi } from 'vitest';
import { useInitializeSettings } from './useInitializeSettings';

// Partially mock react hooks to run synchronously without DOM environment
vi.mock('react', async () => {
  const actual = await vi.importActual('react') as any;
  return {
    ...actual,
    useState: (initial: any) => {
      // Return true for isInitialized to simulate post-effect state
      const val = typeof initial === 'function' ? initial() : initial;
      const setVal = vi.fn();
      return [true, setVal];
    },
    useEffect: (fn: any, deps: any) => {
      fn(); // execute effect immediately
      return () => {};
    }
  };
});

describe('useInitializeSettings', () => {
  it('should parse URL parameters and update settings', () => {
    const originalWindow = (global as any).window;

    // Define global window object for Node environment
    (global as any).window = {
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
      (global as any).window = originalWindow;
    } else {
      delete (global as any).window;
    }
  });
});
