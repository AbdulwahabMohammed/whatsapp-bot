const { sendMessage } = require('../src/chat');
const openai = require('../src/openai');
const db = require('../src/db');

jest.mock('../src/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

jest.mock('../src/openai', () => {
  let replyText = 'mock-reply';
  const module = {
    __setReplyText: text => {
      replyText = text;
    },
    beta: {
      threads: {
        create: jest.fn(async () => ({ id: 't1' })),
        messages: {
          create: jest.fn(async () => ({ id: 'm1' })),
          list: jest.fn(async () => ({
            data: [
              {
                content: [
                  { text: { value: replyText } }
                ]
              }
            ]
          }))
        },
        runs: {
          create: jest.fn(async () => ({ id: 'r1', status: 'completed' })),
          retrieve: jest.fn(async () => ({ status: 'completed', usage: { prompt_tokens: 5, completion_tokens: 7 } }))
        }
      }
    },
    chat: {
      completions: {
        create: jest.fn(async () => ({ choices: [{ message: { content: 'en' } }] }))
      }
    }
  };
  return module;
});

jest.mock('../src/db', () => {
  const state = {
    conversation: null,
    nextConversationId: 1,
    language: 'ar',
    instructions: ''
  };

  const query = jest.fn(async (text, params) => {
    if (text.startsWith('SELECT id, thread_id, escalated, detected_language, summary FROM conversations')) {
      if (state.conversation) {
        return { rows: [state.conversation] };
      }
      return { rows: [] };
    }

    if (text.startsWith('INSERT INTO conversations')) {
      const conversation = {
        id: state.nextConversationId++,
        thread_id: params[2],
        escalated: false,
        detected_language: null,
        summary: null
      };
      state.conversation = conversation;
      return { rows: [conversation] };
    }

    if (text.startsWith('UPDATE conversations SET detected_language')) {
      if (state.conversation) {
        state.conversation = { ...state.conversation, detected_language: params[0] };
      }
      return { rows: [] };
    }

    if (text.startsWith('SELECT language, instructions FROM organizations WHERE id=$1')) {
      return { rows: [{ language: state.language, instructions: state.instructions }] };
    }

    if (text.startsWith('INSERT INTO usage_stats')) {
      return { rows: [] };
    }

    return { rows: [] };
  });

  query.__state = state;
  query.__reset = () => {
    state.conversation = null;
    state.nextConversationId = 1;
    state.language = 'ar';
    state.instructions = '';
  };

  return { query };
});

describe('sendMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.__reset();
    openai.__setReplyText('mock-reply');
  });

  it('resolves with the reply text', async () => {
    const reply = await sendMessage(1, 'a1', '123', 'hi');
    expect(reply).toBe('mock-reply');
    expect(openai.chat.completions.create).toHaveBeenCalled();
    expect(openai.beta.threads.runs.create).toHaveBeenCalledWith('t1', {
      assistant_id: 'a1',
      instructions: 'Please respond in en'
    });
  });

  it('returns null when text is empty', async () => {
    const reply = await sendMessage(1, 'a1', '123', '');
    expect(reply).toBeNull();
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it('filters system instructions replies', async () => {
    const instructions = 'رد فقط باستخدام البيانات المقدمة من الملفات المرجعية الخاصة بالمنشأة.';
    db.query.__state.instructions = instructions;
    openai.__setReplyText(instructions);

    const reply = await sendMessage(1, 'a1', '123', 'hi');
    expect(reply).toBe('عذرًا، لا يمكنني مشاركة هذه التعليمات.');
  });
});
