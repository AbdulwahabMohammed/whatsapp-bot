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
          retrieve: jest.fn(),
        },
      },
    },
  };
});

jest.mock('../src/db', () => {
  const mockQuery = jest.fn()
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 1, thread_id: 't1' }] })
    .mockResolvedValue({ rows: [{ language: 'ar' }] });
  return { query: mockQuery };
});

describe('sendMessage', () => {
  it('resolves with the reply text', async () => {
    await expect(sendMessage(1, 'a1', '123', 'hi')).resolves.toBe('mock-reply');
    expect(openai.beta.threads.runs.create).toHaveBeenCalledWith('t1', {
      assistant_id: 'a1',
      instructions: 'Please respond in ar',
    });
  });
});
