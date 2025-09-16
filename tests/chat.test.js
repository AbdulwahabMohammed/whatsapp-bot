jest.mock('../src/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

jest.mock('../src/openai', () => {
  let replyText = 'mock-reply';
  let runStatusSequence = ['completed'];
  let retrieveIndex = 0;
  const module = {
    __setReplyText: text => {
      replyText = text;
    },
    __setRunStatusSequence: sequence => {
      runStatusSequence = Array.isArray(sequence) && sequence.length ? sequence : ['completed'];
      retrieveIndex = 0;
    },
    beta: {
      threads: {
        create: jest.fn(async () => {
          retrieveIndex = 0;
          return { id: 't1', status: runStatusSequence[0] || 'in_progress' };
        }),
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
          create: jest.fn(async () => {
            retrieveIndex = 0;
            return { id: 'r1', status: runStatusSequence[0] || 'in_progress' };
          }),
          retrieve: jest.fn(async () => {
            if (runStatusSequence.length > 0) {
              retrieveIndex = Math.min(retrieveIndex + 1, runStatusSequence.length - 1);
            }
            const status = runStatusSequence[retrieveIndex] || 'completed';
            return {
              status,
              usage: { prompt_tokens: 5, completion_tokens: 7 }
            };
          })
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

const openai = require('../src/openai');
const db = require('../src/db');

describe('sendMessage', () => {
  let sendMessage;

  const loadChatModule = () => {
    jest.isolateModules(() => {
      ({ sendMessage } = require('../src/chat'));
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    db.query.__reset();
    openai.__setReplyText('mock-reply');
    openai.__setRunStatusSequence(['completed']);
    delete process.env.DETECT_LANGUAGE;
    delete process.env.RUN_MAX_RETRIES;
    delete process.env.RUN_INITIAL_DELAY_MS;
    delete process.env.RUN_MAX_DELAY_MS;
    delete process.env.RUN_DELAY_GROWTH;
    delete process.env.FAST_DEV;
  });

  it('resolves with the reply text', async () => {
    loadChatModule();
    const reply = await sendMessage(1, 'a1', '123', 'hi');
    expect(reply).toBe('mock-reply');
    expect(openai.chat.completions.create).toHaveBeenCalled();
    expect(openai.beta.threads.runs.create).toHaveBeenCalledWith('t1', {
      assistant_id: 'a1',
      instructions: 'Please respond in en'
    });
  });

  it('returns null when text is empty', async () => {
    loadChatModule();
    const reply = await sendMessage(1, 'a1', '123', '');
    expect(reply).toBeNull();
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it('filters system instructions replies', async () => {
    const instructions = 'رد فقط باستخدام البيانات المقدمة من الملفات المرجعية الخاصة بالمنشأة.';
    db.query.__state.instructions = instructions;
    openai.__setReplyText(instructions);

    loadChatModule();
    const reply = await sendMessage(1, 'a1', '123', 'hi');
    expect(reply).toBe('عذرًا، لا يمكنني مشاركة هذه التعليمات.');
  });

  it('skips language detection when DETECT_LANGUAGE is false', async () => {
    process.env.DETECT_LANGUAGE = 'false';
    db.query.__state.language = 'ar';
    loadChatModule();

    const reply = await sendMessage(1, 'a1', '123', 'مرحبا');

    expect(reply).toBe('mock-reply');
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
    expect(openai.beta.threads.runs.create).toHaveBeenCalledWith('t1', {
      assistant_id: 'a1',
      instructions: 'Please respond in ar'
    });
  });

  it('uses environment overrides for run polling', async () => {
    process.env.RUN_MAX_RETRIES = '3';
    process.env.RUN_INITIAL_DELAY_MS = '10';
    process.env.RUN_MAX_DELAY_MS = '20';
    process.env.RUN_DELAY_GROWTH = '2';
    openai.__setRunStatusSequence(['in_progress', 'queued', 'completed']);

    const delays = [];
    jest.spyOn(global, 'setTimeout').mockImplementation((fn, ms) => {
      delays.push(ms);
      if (typeof fn === 'function') {
        fn();
      }
      return 0;
    });

    loadChatModule();
    const reply = await sendMessage(1, 'a1', '123', 'hi');

    expect(reply).toBe('mock-reply');
    expect(delays).toEqual([10, 20]);
    expect(openai.beta.threads.runs.retrieve).toHaveBeenCalledTimes(3);
    global.setTimeout.mockRestore();
  });

  it('applies FAST_DEV defaults when overrides are unset', async () => {
    process.env.FAST_DEV = 'true';
    openai.__setRunStatusSequence(['in_progress', 'queued', 'completed']);

    const delays = [];
    jest.spyOn(global, 'setTimeout').mockImplementation((fn, ms) => {
      delays.push(ms);
      if (typeof fn === 'function') {
        fn();
      }
      return 0;
    });

    loadChatModule();
    const reply = await sendMessage(1, 'a1', '123', 'hello');

    expect(reply).toBe('mock-reply');
    expect(delays).toEqual([300, 345]);
    expect(openai.beta.threads.runs.retrieve).toHaveBeenCalledTimes(3);
    global.setTimeout.mockRestore();
  });
});
