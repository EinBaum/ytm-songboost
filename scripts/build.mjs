import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateRawSync, crc32 } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));

const popup = manifest.action.default_popup;
const files = new Set([
  'manifest.json',
  ...Object.values(manifest.icons),
  ...Object.values(manifest.action.default_icon),
  popup,
  manifest.background.service_worker,
  ...manifest.content_scripts.flatMap((script) => script.js),
]);
for (const [, src] of readFileSync(join(root, popup), 'utf8').matchAll(/<script[^>]+src="([^"]+)"/g)) files.add(src);

// Fixed timestamp 1980-01-01 00:00 so the same sources give the same zip.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const local = [];
const central = [];
let offset = 0;
for (const file of [...files].sort()) {
  const data = readFileSync(join(root, file));
  const packed = deflateRawSync(data, { level: 9 });
  const name = Buffer.from(file, 'utf8');
  const crc = crc32(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(DOS_TIME, 10);
  header.writeUInt16LE(DOS_DATE, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(packed.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  local.push(header, name, packed);
  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(0x031e, 4);
  entry.writeUInt16LE(20, 6);
  entry.writeUInt16LE(0x0800, 8);
  entry.writeUInt16LE(8, 10);
  entry.writeUInt16LE(DOS_TIME, 12);
  entry.writeUInt16LE(DOS_DATE, 14);
  entry.writeUInt32LE(crc, 16);
  entry.writeUInt32LE(packed.length, 20);
  entry.writeUInt32LE(data.length, 24);
  entry.writeUInt16LE(name.length, 28);
  entry.writeUInt32LE((0o100644 << 16) >>> 0, 38);
  entry.writeUInt32LE(offset, 42);
  central.push(entry, name);
  offset += header.length + name.length + packed.length;
}
const centralSize = central.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.size, 8);
end.writeUInt16LE(files.size, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

const out = join(root, 'dist', `ytm-songboost-${manifest.version}.zip`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([...local, ...central, end]));
console.log(`${out} (${files.size} files)`);
