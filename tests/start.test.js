const { spawn } = require('child_process');
const path = require('path');

describe('npm start', () => {
  it('runs src/index.js', done => {
    const child = spawn('npm', ['start'], {
      cwd: path.resolve(__dirname, '..'),
      env: {
        ...process.env,
        PGHOST: 'localhost',
        PGPORT: '1',
        PGUSER: 'test',
        PGDATABASE: 'test',
        PGPASSWORD: 'test',
        NODE_ENV: 'test'
      }
    });

    let output = '';
    child.stdout.on('data', data => {
      output += data.toString();
    });
    child.stderr.on('data', data => {
      output += data.toString();
    });

    child.on('close', code => {
      try {
        expect(code).toBe(1);
        expect(output).toContain('Failed to create/list organizations');
        done();
      } catch (err) {
        done(err);
      }
    });
  }, 10000);
});
