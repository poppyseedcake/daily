import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const output = new URL('../static/', import.meta.url);
const mark = readFileSync(new URL('daily-mark.svg', output), 'utf8');

const render = (size) => new Resvg(mark, { fitTo: { mode: 'width', value: size } }).render();

for (const size of [32, 48]) {
  writeFileSync(new URL(`favicon-${size}x${size}.png`, output), render(size).asPng());
}

// Apple adds its own mask; use an opaque surface and give the existing mark some room.
const markBody = mark.replace(/<svg[^>]*>|<\/svg>/g, '');
const touchIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180"><rect width="180" height="180" fill="#f7f8f5"/><g transform="translate(22 22) scale(2.125)">${markBody}</g></svg>`;
writeFileSync(new URL('apple-touch-icon.png', output), new Resvg(touchIcon).render().asPng());

// Store standard bitmap entries so the ICO also works in older favicon consumers.
const sizes = [16, 32, 48];
const bitmaps = sizes.map((size) => {
  const { pixels } = render(size);
  const maskStride = Math.ceil(size / 32) * 4;
  const pixelBytes = size * size * 4;
  const bitmap = Buffer.alloc(40 + pixelBytes + maskStride * size);
  bitmap.writeUInt32LE(40, 0);
  bitmap.writeInt32LE(size, 4);
  bitmap.writeInt32LE(size * 2, 8);
  bitmap.writeUInt16LE(1, 12);
  bitmap.writeUInt16LE(32, 14);
  bitmap.writeUInt32LE(pixelBytes + maskStride * size, 20);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const source = (y * size + x) * 4;
      const row = size - 1 - y;
      const destination = 40 + (row * size + x) * 4;
      bitmap[destination] = pixels[source + 2];
      bitmap[destination + 1] = pixels[source + 1];
      bitmap[destination + 2] = pixels[source];
      bitmap[destination + 3] = pixels[source + 3];
      if (pixels[source + 3] === 0) {
        bitmap[40 + pixelBytes + row * maskStride + Math.floor(x / 8)] |= 0x80 >> (x % 8);
      }
    }
  }
  return bitmap;
});

const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
for (const [index, size] of sizes.entries()) {
  const entry = 6 + index * 16;
  directory[entry] = size;
  directory[entry + 1] = size;
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(bitmaps[index].length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += bitmaps[index].length;
}
writeFileSync(new URL('favicon.ico', output), Buffer.concat([directory, ...bitmaps]));
