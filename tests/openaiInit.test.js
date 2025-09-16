const ORIGINAL_API_KEY = process.env.OPENAI_API_KEY;

describe('OpenAI initialization guardrails', () => {
  afterEach(() => {
    jest.resetModules();
    if (ORIGINAL_API_KEY) {
      process.env.OPENAI_API_KEY = ORIGINAL_API_KEY;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
    jest.clearAllMocks();
  });

  it('throws a descriptive error when the API key is missing', () => {
    delete process.env.OPENAI_API_KEY;
    jest.resetModules();
    expect(() => require('../src/openai')).toThrow('OPENAI_API_KEY is missing or invalid');
  });

  it('rejects short or malformed API keys', () => {
    process.env.OPENAI_API_KEY = 'sk-12345';
    jest.resetModules();
    expect(() => require('../src/openai')).toThrow('OPENAI_API_KEY is missing or invalid');
  });

  it('allows chat module to load and return null when OpenAI is unavailable', async () => {
    delete process.env.OPENAI_API_KEY;
    jest.resetModules();

    const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const dbMock = { query: jest.fn(async () => ({ rows: [] })) };

    jest.doMock('../src/logger', () => loggerMock);
    jest.doMock('../src/db', () => dbMock);

    let sendMessage;
    jest.isolateModules(() => {
      ({ sendMessage } = require('../src/chat'));
    });

    const reply = await sendMessage(1, 'assistant', '+123', 'مرحبا');
    expect(reply).toBeNull();
    expect(loggerMock.error).toHaveBeenCalledWith(
      'Failed to initialize OpenAI client for chat module:',
      expect.any(Error)
    );
    expect(loggerMock.error).toHaveBeenCalledWith(
      'OpenAI client not initialized; unable to send chat message.',
      expect.any(Error)
    );
  });

  it('surfaces configuration errors from the assistant module', async () => {
    delete process.env.OPENAI_API_KEY;
    jest.resetModules();

    const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    jest.doMock('../src/logger', () => loggerMock);
    jest.doMock('../src/db', () => ({
      query: jest.fn(async () => ({ rows: [] }))
    }));

    let assistant;
    jest.isolateModules(() => {
      assistant = require('../src/assistant');
    });

    await expect(assistant.createAssistant(1)).resolves.toBeNull();
    expect(loggerMock.error).toHaveBeenCalledWith(
      'Failed to initialize OpenAI client for assistant module:',
      expect.any(Error)
    );
    expect(loggerMock.error).toHaveBeenCalledWith(
      'OpenAI client unavailable for assistant create.',
      expect.any(Error)
    );
  });
});
