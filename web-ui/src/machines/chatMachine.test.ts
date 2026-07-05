import { describe, it, expect } from 'vitest';
import { createActor } from 'xstate';
import { chatMachine } from './chatMachine';

describe('chatMachine unit tests', () => {
  it('should initialize with default states and context', () => {
    const actor = createActor(chatMachine).start();
    const state = actor.getSnapshot();
    
    // Parallel states: local, sync, and queue should all be in idle initially
    expect(state.value).toEqual({ local: 'idle', sync: 'idle', queue: 'idle' });
    expect(state.context.activeModel).toBe('');
    expect(state.context.isGenerating).toBe(false);
  });

  it('should transition local state to loadingModel when SELECT_MODEL event is sent', () => {
    const actor = createActor(chatMachine).start();
    
    actor.send({ type: 'SELECT_MODEL', modelName: 'Gemma4-E4B-QAT' });
    
    const state = actor.getSnapshot();
    expect(state.value).toEqual({ local: 'loadingModel', sync: 'idle', queue: 'idle' });
  });

  it('should support updating context fields via UPDATE_CONTEXT event', () => {
    const actor = createActor(chatMachine).start();
    
    // Direct value update
    actor.send({
      type: 'UPDATE_CONTEXT',
      payload: { activeModel: 'Gemma4-E4B-QAT' }
    });

    let state = actor.getSnapshot();
    expect(state.context.activeModel).toBe('Gemma4-E4B-QAT');

    // Functional update
    actor.send({
      type: 'UPDATE_CONTEXT',
      payload: { 
        activeUserCount: (prev: number) => prev + 2 
      }
    });

    state = actor.getSnapshot();
    expect(state.context.activeUserCount).toBe(3); // Default is 1, so 1 + 2 = 3
  });

  it('should handle local generation lifecycle and assign isGenerating', () => {
    const actor = createActor(chatMachine).start();
    
    actor.send({ type: 'START_GENERATE' });
    let state = actor.getSnapshot();
    expect(state.value).toEqual({ local: 'generating', sync: 'idle', queue: 'idle' });
    expect(state.context.isGenerating).toBe(true);

    actor.send({ type: 'GENERATE_COMPLETE' });
    state = actor.getSnapshot();
    expect(state.value).toEqual({ local: 'idle', sync: 'idle', queue: 'idle' });
    expect(state.context.isGenerating).toBe(false);
  });

  it('should handle remote generation lifecycle with guards and cleanup', () => {
    const actor = createActor(chatMachine).start();
    
    // Start polling to enable sync transitions
    actor.send({ type: 'START_POLLING' });
    let state = actor.getSnapshot();
    expect(state.value).toEqual({ local: 'idle', sync: 'polling', queue: 'idle' });

    // Peer starts generating
    actor.send({ type: 'PEER_START_GENERATE' });
    state = actor.getSnapshot();
    expect(state.value).toEqual({ local: 'idle', sync: 'remoteGenerating', queue: 'idle' });
    expect(state.context.isRemoteGenerating).toBe(true);

    // Peer completes generating
    actor.send({ type: 'PEER_COMPLETE_GENERATE' });
    state = actor.getSnapshot();
    expect(state.value).toEqual({ local: 'idle', sync: 'polling', queue: 'idle' });
    expect(state.context.isRemoteGenerating).toBe(false);
  });

  it('should block PEER_START_GENERATE when local user is generating (guard test)', () => {
    const actor = createActor(chatMachine).start();
    
    actor.send({ type: 'START_POLLING' });
    actor.send({ type: 'START_GENERATE' });
    
    let state = actor.getSnapshot();
    expect(state.value).toEqual({ local: 'generating', sync: 'polling', queue: 'idle' });
    expect(state.context.isGenerating).toBe(true);

    // Send PEER_START_GENERATE -> should be blocked by guard
    actor.send({ type: 'PEER_START_GENERATE' });
    state = actor.getSnapshot();
    expect(state.value).toEqual({ local: 'generating', sync: 'polling', queue: 'idle' }); // Still in polling
    expect(state.context.isRemoteGenerating).toBe(false);
  });

  it('should transition sync state to polling and reset isRemoteGenerating when local generation starts', () => {
    const actor = createActor(chatMachine).start();
    
    actor.send({ type: 'START_POLLING' });
    actor.send({ type: 'PEER_START_GENERATE' });
    
    let state = actor.getSnapshot();
    expect(state.value).toEqual({ local: 'idle', sync: 'remoteGenerating', queue: 'idle' });
    expect(state.context.isRemoteGenerating).toBe(true);

    // Local user starts generating -> forces sync to polling and resets isRemoteGenerating
    actor.send({ type: 'START_GENERATE' });
    state = actor.getSnapshot();
    expect(state.value).toEqual({ local: 'generating', sync: 'polling', queue: 'idle' });
    expect(state.context.isRemoteGenerating).toBe(false);
  });

  it('should handle queue lifecycle transitions', () => {
    const actor = createActor(chatMachine).start();
    
    // Simulate shared mode settings setup
    actor.send({
      type: 'UPDATE_CONTEXT',
      payload: {
        settings: {
          connectionUrl: 'http://localhost:8088',
          accessToken: 'test-token',
          isSharedMode: true,
          username: 'Bob'
        },
        activeChatId: 'chat_1',
        chats: [{ id: 'chat_1', title: 'Test Chat', messages: [] }]
      }
    });

    // Submit message while waiting in queue
    actor.send({ type: 'SUBMIT_MESSAGE', content: 'Hello queue' });
    let state = actor.getSnapshot();
    expect(state.value).toEqual({ local: 'idle', sync: 'idle', queue: 'waiting' });
    expect(state.context.pendingMessage).toBe('Hello queue');

    // Promote job in queue
    const userMsg = { id: 'msg_1', role: 'user' as const, content: 'Hello queue', sender: 'Bob', timestamp: '12:00' };
    actor.send({ type: 'PROMOTE_QUEUE', userMsg });
    state = actor.getSnapshot();
    expect(state.value).toEqual({ local: 'idle', sync: 'idle', queue: 'running' });
    expect(state.context.chats[0].messages).toEqual([userMsg]);

    // Complete generation
    actor.send({ type: 'GENERATE_COMPLETE' });
    state = actor.getSnapshot();
    expect(state.value).toEqual({ local: 'idle', sync: 'idle', queue: 'idle' });
    expect(state.context.pendingMessage).toBe('');
  });
});
