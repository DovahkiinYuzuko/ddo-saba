import { describe, it, expect } from 'vitest';
import { createActor } from 'xstate';
import { chatMachine } from './chatMachine';

describe('chatMachine unit tests', () => {
  it('should initialize with default states and context', () => {
    const actor = createActor(chatMachine).start();
    const state = actor.getSnapshot();
    
    // Parallel states: local and sync should both be in idle initially
    expect(state.value).toEqual({ local: 'idle', sync: 'idle' });
    expect(state.context.activeModel).toBe('');
    expect(state.context.isGenerating).toBe(false);
  });

  it('should transition local state to loadingModel when SELECT_MODEL event is sent', () => {
    const actor = createActor(chatMachine).start();
    
    actor.send({ type: 'SELECT_MODEL', modelName: 'Gemma4-E4B-QAT' });
    
    const state = actor.getSnapshot();
    expect(state.value).toEqual({ local: 'loadingModel', sync: 'idle' });
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
});
