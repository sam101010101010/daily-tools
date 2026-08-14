import { readFile } from 'node:fs/promises';

const licensePath = 'third-party-licenses/qr-0.6.0-LICENSE-MIT.txt';
const yamlLicensePath = 'third-party-licenses/yaml-2.9.0-LICENSE-ISC.txt';
const diffLicensePath = 'third-party-licenses/diff-9.0.0-LICENSE-BSD-3-Clause.txt';

async function readArtifact(label, url) {
  try {
    return await readFile(url);
  } catch (error) {
    throw new Error(`${label} is missing: ${url.pathname}`, { cause: error });
  }
}

const tracked = await readArtifact(
  'Tracked qr@0.6.0 MIT notice',
  new URL(`../public/${licensePath}`, import.meta.url),
);
const installed = await readArtifact(
  'Installed qr@0.6.0 MIT license',
  new URL('../node_modules/qr/LICENSE-MIT', import.meta.url),
);
const deployed = await readArtifact(
  'Deployed qr@0.6.0 MIT notice',
  new URL(`../dist/${licensePath}`, import.meta.url),
);

if (!tracked.equals(installed)) {
  throw new Error('Tracked qr@0.6.0 MIT notice does not match node_modules/qr/LICENSE-MIT');
}
if (!deployed.equals(tracked)) {
  throw new Error('Deployed qr@0.6.0 MIT notice does not match the tracked public notice');
}

console.log(`Verified ${licensePath} in the production distribution`);

const yamlTracked = await readArtifact(
  'Tracked yaml@2.9.0 ISC notice',
  new URL(`../public/${yamlLicensePath}`, import.meta.url),
);
const yamlInstalled = await readArtifact(
  'Installed yaml@2.9.0 ISC license',
  new URL('../node_modules/yaml/LICENSE', import.meta.url),
);
const yamlDeployed = await readArtifact(
  'Deployed yaml@2.9.0 ISC notice',
  new URL(`../dist/${yamlLicensePath}`, import.meta.url),
);

if (!yamlTracked.equals(yamlInstalled)) {
  throw new Error('Tracked yaml@2.9.0 ISC notice does not match node_modules/yaml/LICENSE');
}
if (!yamlDeployed.equals(yamlTracked)) {
  throw new Error('Deployed yaml@2.9.0 ISC notice does not match the tracked public notice');
}

console.log(`Verified ${yamlLicensePath} in the production distribution`);

const diffTracked = await readArtifact(
  'Tracked diff@9.0.0 BSD-3-Clause notice',
  new URL(`../public/${diffLicensePath}`, import.meta.url),
);
const diffInstalled = await readArtifact(
  'Installed diff@9.0.0 BSD-3-Clause license',
  new URL('../node_modules/diff/LICENSE', import.meta.url),
);
const diffDeployed = await readArtifact(
  'Deployed diff@9.0.0 BSD-3-Clause notice',
  new URL(`../dist/${diffLicensePath}`, import.meta.url),
);

if (!diffTracked.equals(diffInstalled)) {
  throw new Error(
    'Tracked diff@9.0.0 BSD-3-Clause notice does not match node_modules/diff/LICENSE',
  );
}
if (!diffDeployed.equals(diffTracked)) {
  throw new Error('Deployed diff@9.0.0 BSD-3-Clause notice does not match the tracked public notice');
}

console.log(`Verified ${diffLicensePath} in the production distribution`);
