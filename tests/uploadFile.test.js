const mockVectorStoreApi = {
  retrieve: jest.fn(() => {
    const err = new Error('not found');
    err.status = 404;
    return Promise.reject(err);
  }),
  create: jest.fn().mockResolvedValue({ id: 'new-store' }),
  fileBatches: { createAndPoll: jest.fn().mockResolvedValue({}) }
};

jest.mock('../src/openai', () => ({
  files: { create: jest.fn().mockResolvedValue({ id: 'file-1' }) },
  beta: {
    assistants: {
      retrieve: jest.fn().mockResolvedValue({ tool_resources: { file_search: { vector_store_ids: [] } } }),
      update: jest.fn().mockResolvedValue({})
    },
    vectorStores: mockVectorStoreApi
  }
}));

const mockQuery = jest
  .fn()
  .mockResolvedValueOnce({
    rows: [{ assistant_id: 'asst-1', vector_store_id: 'old-store', instructions: '' }]
  })
  .mockResolvedValue({});

jest.mock('../src/db', () => ({ query: mockQuery }));
jest.mock('../src/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('fs', () => {
  const readFile = jest.fn().mockResolvedValue('not instructions content');
  const stat = jest.fn().mockResolvedValue({ isFile: () => true, size: 1024 });
  return {
    createReadStream: jest.fn(),
    promises: { readFile, stat }
  };
});

describe('uploadFile script', () => {
  const { upload, MAX_FILE_SIZE_BYTES } = require('../src/scripts/uploadFile');
  const fs = require('fs');

  beforeEach(() => {
    fs.promises.stat.mockResolvedValue({ isFile: () => true, size: 1024 });
  });

  test('creates new vector store when retrieval returns 404', async () => {
    await upload(1, '/fake/path.txt');

    expect(mockVectorStoreApi.retrieve).toHaveBeenCalledWith('old-store');
    expect(mockVectorStoreApi.create).toHaveBeenCalledWith({ name: 'org-1-store' });
    expect(mockQuery).toHaveBeenCalledWith(
      'UPDATE organizations SET vector_store_id=$1 WHERE id=$2',
      ['new-store', 1]
    );
    expect(mockVectorStoreApi.fileBatches.createAndPoll).toHaveBeenCalledWith('new-store', {
      file_ids: ['file-1']
    });
  });

  test('rejects unsupported file extensions', async () => {
    await expect(upload(1, '/fake/path.exe')).rejects.toThrow('Unsupported file extension');
  });

  test('rejects files that exceed the size limit', async () => {
    fs.promises.stat.mockResolvedValueOnce({ isFile: () => true, size: MAX_FILE_SIZE_BYTES + 1 });
    await expect(upload(1, '/fake/path.txt')).rejects.toThrow('exceeds the maximum allowed');
  });
});
