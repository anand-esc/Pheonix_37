/* Build the native PyInstaller service required by `npm run dist`. */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const platform = process.platform;
if (platform !== 'win32' && platform !== 'linux') {
  throw new Error(
    `Desktop backend builds are supported on Windows and Linux, not ${platform}.`,
  );
}

const projectRoot = path.resolve(__dirname, '../..');
const backendRoot = path.join(projectRoot, 'backend');
const buildPlatform = platform === 'win32' ? 'windows' : 'linux';

const args = [
  '--noconfirm',
  '--clean',
  '--onefile',
  '--name', 'forensic-backend',
  '--distpath', path.join(backendRoot, 'dist'),
  '--workpath', path.join(backendRoot, 'build', buildPlatform),
  '--specpath', path.join(backendRoot, 'build', 'specs'),
  '--paths', projectRoot,
  '--paths', backendRoot,
  '--hidden-import', 'uvicorn.logging',
  '--hidden-import', 'uvicorn.loops.auto',
  '--hidden-import', 'uvicorn.protocols.http.auto',
  '--hidden-import', 'uvicorn.lifespan.on',
  '--hidden-import', 'api.main',
  '--hidden-import', 'pydantic',
  '--hidden-import', 'hashlib',
  '--hidden-import', 'hmac',
  '--hidden-import', 'fastapi',
  path.join(backendRoot, 'run_server.py'),
];

console.log(`Building forensic-backend for ${buildPlatform}…`);

const result = spawnSync('pyinstaller', args, {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);

console.log('Backend build complete.');
