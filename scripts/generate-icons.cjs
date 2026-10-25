const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

function generateIconPng(size) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits per channel
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const ihdrChunk = makeChunk('IHDR', ihdr);

  const rowSize = 1 + size * 4;
  const rawData = Buffer.alloc(size * rowSize);
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size * 0.46;
  const rInner = size * 0.38;

  for (let y = 0; y < size; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter 0
    for (let x = 0; x < size; x++) {
      const px = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);

      // Default background: #0D2A4F
      let red = 13, green = 42, blue = 79, alpha = 255;

      if (dist <= rOuter) {
        // Outer ring accent (cyan-blue)
        if (dist > rInner) {
          red = 59; green = 130; blue = 246; // #3b82f6
        } else {
          // Central emblem background: #1e3a8a
          red = 30; green = 58; blue = 138;
          
          // Gear teeth / engine stylized pattern
          const angle = Math.atan2(dy, dx);
          const cogVal = Math.cos(angle * 8); // 8-tooth gear
          const cogDist = rInner * (0.65 + 0.15 * Math.max(0, cogVal));

          if (dist <= cogDist) {
            // Gold / amber engine core or white center
            if (dist <= rInner * 0.28) {
              red = 245; green = 158; blue = 11; // amber core
            } else {
              red = 248; green = 250; blue = 252; // bright white gear
            }
          }
        }
      }

      rawData[px] = red;
      rawData[px + 1] = green;
      rawData[px + 2] = blue;
      rawData[px + 3] = alpha;
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const targetDirs = [
  path.join(__dirname, '../public/icons'),
  path.join(__dirname, '../public/assets/icons')
];

for (const dir of targetDirs) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  for (const s of sizes) {
    const pngBuf = generateIconPng(s);
    const filePath = path.join(dir, 'icon-' + s + 'x' + s + '.png');
    fs.writeFileSync(filePath, pngBuf);
    console.log('Generated ' + filePath + ' (' + s + 'x' + s + ', ' + pngBuf.length + ' bytes)');
  }
}

console.log('All PWA icons generated successfully.');
