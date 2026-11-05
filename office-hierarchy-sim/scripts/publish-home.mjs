import { readFile, writeFile } from 'node:fs/promises';

// Keep the project homepage and standalone build on the same app/version.
const standalone = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const home = standalone
  .replaceAll('="./assets/', '="./office-hierarchy-sim/dist/assets/')
  .replaceAll('href="../docs/', 'href="./office-hierarchy-sim/docs/');
await writeFile(new URL('../../index.html', import.meta.url), home);
console.log('Published Office Hierarchy to the repository homepage.');
