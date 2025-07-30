const { sendMessage } = require('../src/chat');
const openai = require('../src/openai');

jest.mock('../src/openai', () => {
  return {
    beta: {
      threads: {
        create: jest.fn(async () => ({ id: 't1' })),
        messages: {
          create: jest.fn(async () => ({ id: 'm1' })),
          list: jest.fn(async () => ({
            data: [
              {
                content: [
                  { text: { value: 'mock-reply' } }
                ]
              }
            ]
          })),
        },
        runs: {
          create: jest.fn(async () => ({ id: 'r1', status: 'completed' })),
          retrieve: jest.fn(async () => ({ status: 'completed', usage: { prompt_tokens: 5, completion_tokens: 7 } })),
        },
      },
    },
    chat: {
      completions: {
        create: jest.fn(async () => ({ choices: [{ message: { content: 'en' } }] })),
      },
    },
  };
});

jest.mock('../src/db', () => {
  const mockQuery = jest.fn()
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 1, thread_id: 't1', escalated: false, detected_language: null }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ language: 'ar' }] })
    .mockResolvedValue({ rows: [] });
  return { query: mockQuery };
});

describe('sendMessage', () => {
  it('resolves with the reply text', async () => {
    await expect(sendMessage(1, 'a1', '123', 'hi')).resolves.toBe('mock-reply');
    expect(openai.chat.completions.create).toHaveBeenCalled();
    expect(openai.beta.threads.runs.create).toHaveBeenCalledWith('t1', {
      assistant_id: 'a1',
      instructions: 'Please respond in en',
    });
  });
});
