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
jest.mock('fs', () => ({
  createReadStream: jest.fn(),
  promises: { readFile: jest.fn().mockResolvedValue('not instructions content') }
}));

describe('uploadFile script', () => {
  const { upload } = require('../src/scripts/uploadFile');

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
});
