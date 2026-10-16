const zlib = require('node:zlib');

// HWP 5의 OLE 스트림에서 문단 텍스트만 읽는다. 쪽 배치·표 구조의 재현 도구가 아니다.
function hwpParagraphs(buffer) {
  if (buffer.subarray(0, 8).toString('hex') !== 'd0cf11e0a1b11ae1') throw new Error('HWP OLE 형식 오류');
  const sectorSize = 1 << buffer.readUInt16LE(30), miniSize = 1 << buffer.readUInt16LE(32);
  const sector = id => buffer.subarray((id + 1) * sectorSize, (id + 2) * sectorSize);
  const difat = [];
  for (let i = 0; i < 109; i++) {
    const id = buffer.readUInt32LE(76 + i * 4);
    if (id < 0xfffffffa) difat.push(id);
  }
  let next = buffer.readUInt32LE(68);
  for (let i = 0; i < buffer.readUInt32LE(72) && next < 0xfffffffa; i++) {
    const data = sector(next);
    for (let j = 0; j < sectorSize / 4 - 1; j++) {
      const id = data.readUInt32LE(j * 4);
      if (id < 0xfffffffa) difat.push(id);
    }
    next = data.readUInt32LE(sectorSize - 4);
  }
  const fat = Buffer.concat(difat.map(sector));
  function chain(start, table, read, size) {
    const parts = [], seen = new Set();
    let id = start;
    while (id < 0xfffffffa) {
      if (seen.has(id) || id * 4 + 4 > table.length) throw new Error('HWP 스트림 연결 오류');
      seen.add(id); parts.push(read(id)); id = table.readUInt32LE(id * 4);
    }
    return Buffer.concat(parts).subarray(0, size);
  }
  const directory = chain(buffer.readUInt32LE(48), fat, sector), entries = [];
  for (let i = 0; i + 128 <= directory.length; i += 128) {
    const item = directory.subarray(i, i + 128), length = item.readUInt16LE(64);
    if (length < 2) continue;
    entries.push({ name: item.subarray(0, length - 2).toString('utf16le'), type: item[66],
      start: item.readUInt32LE(116), size: Number(item.readBigUInt64LE(120)) });
  }
  const root = entries.find(item => item.type === 5);
  if (!root) throw new Error('HWP 루트 스트림 누락');
  const miniStream = chain(root.start, fat, sector, root.size);
  const miniFat = chain(buffer.readUInt32LE(60), fat, sector);
  const read = item => item.size < buffer.readUInt32LE(56) && item.type === 2 ?
    chain(item.start, miniFat, id => miniStream.subarray(id * miniSize, (id + 1) * miniSize), item.size) :
    chain(item.start, fat, sector, item.size);
  const fileHeader = entries.find(item => item.name === 'FileHeader');
  if (!fileHeader) throw new Error('HWP 파일 헤더 누락');
  const header = read(fileHeader);
  if (!header.toString('ascii', 0, 17).startsWith('HWP Document File')) throw new Error('HWP 5 헤더 오류');
  const flags = header.readUInt32LE(36);
  if (flags & 2 || flags & 4) throw new Error('암호화·배포용 HWP는 지원하지 않습니다.');
  const sections = entries.filter(item => /^Section\d+$/.test(item.name))
    .sort((a, b) => Number(a.name.slice(7)) - Number(b.name.slice(7)));
  const paragraphs = [], controls = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
  for (const section of sections) {
    const data = flags & 1 ? zlib.inflateRawSync(read(section)) : read(section);
    for (let offset = 0; offset + 4 <= data.length;) {
      const record = data.readUInt32LE(offset); offset += 4;
      const tag = record & 1023;
      let size = record >>> 20;
      if (size === 4095) { size = data.readUInt32LE(offset); offset += 4; }
      if (offset + size > data.length) throw new Error('HWP 문단 레코드 크기 오류');
      const content = data.subarray(offset, offset + size); offset += size;
      if (tag !== 67) continue;
      let text = '';
      for (let i = 0; i + 1 < content.length; i += 2) {
        const code = content.readUInt16LE(i);
        if (controls.has(code)) { if (code === 9) text += ' '; i += 14; }
        else if (code === 10 || code === 13) text += '\n';
        else if (code >= 32) text += String.fromCharCode(code);
      }
      if (text.trim()) paragraphs.push({ text: text.trim(), paragraph: paragraphs.length + 1, section: section.name });
    }
  }
  return paragraphs;
}

module.exports = { hwpParagraphs };
