jest.mock('../src/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

jest.mock('../src/openai', () => {
  let replyText = 'mock-reply';
  const vectorStores = {
    retrieve: jest.fn(async id => ({ id })),
    create: jest.fn(async () => ({ id: 'vs-1' })),
    fileBatches: { createAndPoll: jest.fn(async () => ({})) }
  };
  const module = {
    __setReplyText: text => {
      replyText = text;
    },
    files: { create: jest.fn(async () => ({ id: 'file-1' })) },
    beta: {
      assistants: {
        retrieve: jest.fn(async () => ({ tool_resources: { file_search: { vector_store_ids: [] } } })),
        update: jest.fn(async () => ({}))
      },
      vectorStores,
      threads: {
        create: jest.fn(async () => ({ id: 'thread-1' })),
        messages: {
          create: jest.fn(async () => ({ id: 'message-1' })),
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
          create: jest.fn(async () => ({ id: 'run-1', status: 'completed' })),
          retrieve: jest.fn(async () => ({ status: 'completed', usage: { prompt_tokens: 5, completion_tokens: 7 } }))
        }
      }
    },
    chat: {
      completions: {
        create: jest.fn(async () => ({ choices: [{ message: { content: 'ar' } }] }))
      }
    }
  };
  return module;
});

jest.mock('../src/db', () => {
  const { DEFAULT_SYSTEM_INSTRUCTIONS } = require('../src/utils/systemInstructions');
  const state = {
    assistantId: 'asst-1',
    vectorStoreId: null,
    instructions: DEFAULT_SYSTEM_INSTRUCTIONS,
    language: 'ar',
    conversation: null,
    nextConversationId: 1
  };

  const query = jest.fn(async (text, params) => {
    if (text.includes('SELECT b.assistant_id')) {
      return {
        rows: [
          {
            assistant_id: state.assistantId,
            vector_store_id: state.vectorStoreId,
            instructions: state.instructions
          }
        ]
      };
    }

    if (text.startsWith('UPDATE organizations SET vector_store_id')) {
      state.vectorStoreId = params[0];
      return { rows: [] };
    }

    if (text.startsWith('INSERT INTO documents')) {
      return { rows: [] };
    }

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
    state.vectorStoreId = null;
    state.instructions = DEFAULT_SYSTEM_INSTRUCTIONS;
    state.language = 'ar';
    state.conversation = null;
    state.nextConversationId = 1;
  };

  return { query };
});

jest.mock('fs', () => {
  const { DEFAULT_SYSTEM_INSTRUCTIONS } = require('../src/utils/systemInstructions');
  return {
    createReadStream: jest.fn(),
    promises: { readFile: jest.fn(async () => DEFAULT_SYSTEM_INSTRUCTIONS) }
  };
});

const { upload } = require('../src/scripts/uploadFile');
const { sendMessage } = require('../src/chat');
const openai = require('../src/openai');
const db = require('../src/db');
const fs = require('fs');
const {
  DEFAULT_SYSTEM_INSTRUCTIONS,
  SYSTEM_INSTRUCTIONS_FILTER_REASON
} = require('../src/utils/systemInstructions');

describe('system instructions filtering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.__reset();
    openai.__setReplyText(DEFAULT_SYSTEM_INSTRUCTIONS);
    fs.promises.readFile.mockResolvedValue(DEFAULT_SYSTEM_INSTRUCTIONS);
  });

  it('skips uploading instruction documents and filters assistant replies', async () => {
    const uploadResult = await upload(1, '/tmp/instructions.txt');
    expect(uploadResult).toEqual({ skipped: true, reason: SYSTEM_INSTRUCTIONS_FILTER_REASON });
    expect(openai.files.create).not.toHaveBeenCalled();

    const reply = await sendMessage(1, 'asst-1', '123', 'hello');
    expect(reply).toBe('عذرًا، لا يمكنني مشاركة هذه التعليمات.');
  });
});
