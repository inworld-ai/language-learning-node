import { describe, it, expect, beforeEach } from 'vitest';
import { TurnMemory } from '../services/turn-memory.js';

describe('TurnMemory', () => {
  let memory: TurnMemory;

  beforeEach(() => {
    memory = new TurnMemory(5);
  });

  it('should add and retrieve turns', () => {
    memory.add('user', 'Hola');
    memory.add('assistant', '¡Hola! ¿Cómo estás?');

    expect(memory.getTurnCount()).toBe(2);
    expect(memory.getContext()).toContain('user: Hola');
    expect(memory.getContext()).toContain('assistant: ¡Hola! ¿Cómo estás?');
  });

  it('should evict oldest turns when over capacity', () => {
    for (let i = 0; i < 7; i++) {
      memory.add('user', `message ${i}`);
    }

    expect(memory.getTurnCount()).toBe(5);
    const context = memory.getContext();
    expect(context).not.toContain('message 0');
    expect(context).not.toContain('message 1');
    expect(context).toContain('message 2');
    expect(context).toContain('message 6');
  });

  it('should return empty context when no turns', () => {
    expect(memory.getContext()).toBe('');
  });

  it('should clear all turns', () => {
    memory.add('user', 'hello');
    memory.add('assistant', 'hi');
    memory.clear();

    expect(memory.getTurnCount()).toBe(0);
    expect(memory.getContext()).toBe('');
  });

  it('should return messages array', () => {
    memory.add('user', 'Hola');
    memory.add('assistant', 'Hi');

    const messages = memory.getMessages();
    expect(messages).toEqual([
      { role: 'user', content: 'Hola' },
      { role: 'assistant', content: 'Hi' },
    ]);
  });

  it('should respect custom capacity', () => {
    const small = new TurnMemory(2);
    small.add('user', 'a');
    small.add('user', 'b');
    small.add('user', 'c');

    expect(small.getTurnCount()).toBe(2);
    expect(small.getContext()).not.toContain('a');
    expect(small.getContext()).toContain('b');
    expect(small.getContext()).toContain('c');
  });
});
