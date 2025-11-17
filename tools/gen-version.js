const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'package.json');
const outPath = path.join(__dirname, '..', 'src', 'version.json');

try {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const ver = pkg.version || '0.0.0';
  const payload = { version: `v${ver}` };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log('Wrote', outPath, payload);
} catch (err) {
  console.error('Failed to generate version.json', err);
  process.exit(1);
}
