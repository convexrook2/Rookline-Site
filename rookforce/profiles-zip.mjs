// Dependency-free classic ZIP, stored entries, UTF-8 flat filenames.
const encoder = new TextEncoder();
const table = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});
export function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ table[(value ^ byte) & 255];
  return (value ^ 0xffffffff) >>> 0;
}
export function createStoredZip(files) {
  if (!files.length || files.length > 65535) throw new Error('Invalid archive entry count.');
  const seen = new Set();
  const entries = files.map(file => {
    if (typeof file.name !== 'string' || !file.name || /[\\/\x00-\x1f<>:"|?*]/.test(file.name) || ['.', '..'].includes(file.name)) throw new Error('Archive filenames must be flat and safe.');
    const key = file.name.toLowerCase();
    if (seen.has(key)) throw new Error('Duplicate archive filename.');
    seen.add(key);
    const name = encoder.encode(file.name);
    const bytes = file.bytes;
    if (!(bytes instanceof Uint8Array) || name.length > 65535 || bytes.length > 0xffffffff) throw new Error('Unsupported archive entry.');
    return { name, bytes, crc: crc32(bytes) };
  });
  const localSize = entries.reduce((size, entry) => size + 30 + entry.name.length + entry.bytes.length, 0);
  const centralSize = entries.reduce((size, entry) => size + 46 + entry.name.length, 0);
  const totalSize = localSize + centralSize + 22;
  if (totalSize > 0xffffffff) throw new Error('Archive is too large.');
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  const write16 = (at, value) => view.setUint16(at, value, true);
  const write32 = (at, value) => view.setUint32(at, value, true);
  let offset = 0;
  const offsets = [];
  for (const entry of entries) {
    offsets.push(offset);
    write32(offset, 0x04034b50); write16(offset + 4, 20); write16(offset + 6, 0x0800);
    write16(offset + 8, 0); write16(offset + 10, 0); write16(offset + 12, 33); // 1980-01-01, deterministic.
    write32(offset + 14, entry.crc); write32(offset + 18, entry.bytes.length); write32(offset + 22, entry.bytes.length);
    write16(offset + 26, entry.name.length); write16(offset + 28, 0);
    output.set(entry.name, offset + 30); output.set(entry.bytes, offset + 30 + entry.name.length);
    offset += 30 + entry.name.length + entry.bytes.length;
  }
  const directoryStart = offset;
  entries.forEach((entry, index) => {
    write32(offset, 0x02014b50); write16(offset + 4, 20); write16(offset + 6, 20); write16(offset + 8, 0x0800);
    write16(offset + 10, 0); write16(offset + 12, 0); write16(offset + 14, 33);
    write32(offset + 16, entry.crc); write32(offset + 20, entry.bytes.length); write32(offset + 24, entry.bytes.length);
    write16(offset + 28, entry.name.length); write16(offset + 30, 0); write16(offset + 32, 0);
    write16(offset + 34, 0); write16(offset + 36, 0); write32(offset + 38, 0); write32(offset + 42, offsets[index]);
    output.set(entry.name, offset + 46); offset += 46 + entry.name.length;
  });
  write32(offset, 0x06054b50); write16(offset + 4, 0); write16(offset + 6, 0);
  write16(offset + 8, entries.length); write16(offset + 10, entries.length);
  write32(offset + 12, centralSize); write32(offset + 16, directoryStart); write16(offset + 20, 0);
  return output;
}
