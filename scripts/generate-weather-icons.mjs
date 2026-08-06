import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const width = 64;
const height = 64;
const outputDirectory = new URL('../static/weather-icons/', import.meta.url);

const colors = {
  background: [247, 250, 252, 255],
  outline: [38, 55, 68, 255],
  cloud: [218, 229, 236, 255],
  cloudShadow: [183, 202, 213, 255],
  sun: [245, 179, 56, 255],
  rain: [49, 139, 199, 255],
  snow: [80, 166, 184, 255],
  lightning: [235, 172, 42, 255],
  fog: [125, 153, 166, 255],
  unknown: [111, 125, 135, 255]
};

const makeCanvas = () => new Uint8Array(width * height * 4);

const paint = (pixels, x, y, color) => {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const offset = (y * width + x) * 4;
  pixels.set(color, offset);
};

const rectangle = (pixels, x, y, rectangleWidth, rectangleHeight, color) => {
  for (let row = y; row < y + rectangleHeight; row += 1) {
    for (let column = x; column < x + rectangleWidth; column += 1) {
      paint(pixels, column, row, color);
    }
  }
};

const circle = (pixels, centerX, centerY, radius, color) => {
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      if ((x - centerX) ** 2 + (y - centerY) ** 2 <= radius ** 2) {
        paint(pixels, x, y, color);
      }
    }
  }
};

const line = (pixels, startX, startY, endX, endY, color, thickness = 2) => {
  const distance = Math.max(Math.abs(endX - startX), Math.abs(endY - startY));
  for (let step = 0; step <= distance; step += 1) {
    const progress = distance === 0 ? 0 : step / distance;
    const x = Math.round(startX + (endX - startX) * progress);
    const y = Math.round(startY + (endY - startY) * progress);
    rectangle(pixels, x - Math.floor(thickness / 2), y - Math.floor(thickness / 2), thickness, thickness, color);
  }
};

const polygon = (pixels, points, color) => {
  const minimumY = Math.max(0, Math.min(...points.map(([, y]) => y)));
  const maximumY = Math.min(height - 1, Math.max(...points.map(([, y]) => y)));

  for (let y = minimumY; y <= maximumY; y += 1) {
    const intersections = [];
    for (let index = 0; index < points.length; index += 1) {
      const [x1, y1] = points[index];
      const [x2, y2] = points[(index + 1) % points.length];
      if ((y1 <= y && y < y2) || (y2 <= y && y < y1)) {
        intersections.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    intersections.sort((left, right) => left - right);
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      for (let x = Math.ceil(intersections[index]); x <= intersections[index + 1]; x += 1) {
        paint(pixels, x, y, color);
      }
    }
  }
};

const drawSun = (pixels, centerX = 32, centerY = 30) => {
  const rayColor = colors.sun;
  line(pixels, centerX, centerY - 23, centerX, centerY - 17, rayColor, 3);
  line(pixels, centerX, centerY + 17, centerX, centerY + 23, rayColor, 3);
  line(pixels, centerX - 23, centerY, centerX - 17, centerY, rayColor, 3);
  line(pixels, centerX + 17, centerY, centerX + 23, centerY, rayColor, 3);
  line(pixels, centerX - 16, centerY - 16, centerX - 12, centerY - 12, rayColor, 3);
  line(pixels, centerX + 12, centerY + 12, centerX + 16, centerY + 16, rayColor, 3);
  line(pixels, centerX + 16, centerY - 16, centerX + 12, centerY - 12, rayColor, 3);
  line(pixels, centerX - 16, centerY + 16, centerX - 12, centerY + 12, rayColor, 3);
  circle(pixels, centerX, centerY, 11, colors.outline);
  circle(pixels, centerX, centerY, 8, colors.sun);
};

const drawCloud = (pixels, y = 37) => {
  circle(pixels, 20, y, 12, colors.outline);
  circle(pixels, 35, y - 8, 15, colors.outline);
  circle(pixels, 48, y, 11, colors.outline);
  rectangle(pixels, 18, y - 1, 32, 15, colors.outline);
  circle(pixels, 20, y - 2, 9, colors.cloud);
  circle(pixels, 35, y - 9, 12, colors.cloud);
  circle(pixels, 48, y - 2, 8, colors.cloud);
  rectangle(pixels, 20, y - 1, 28, 11, colors.cloud);
  rectangle(pixels, 22, y + 7, 25, 5, colors.cloudShadow);
};

const drawRain = (pixels) => {
  drawCloud(pixels, 34);
  line(pixels, 23, 51, 19, 59, colors.rain, 3);
  line(pixels, 34, 51, 30, 59, colors.rain, 3);
  line(pixels, 45, 51, 41, 59, colors.rain, 3);
};

const drawSnow = (pixels) => {
  drawCloud(pixels, 34);
  for (const [x, y] of [[23, 54], [34, 57], [45, 54]]) {
    line(pixels, x - 4, y, x + 4, y, colors.snow, 2);
    line(pixels, x, y - 4, x, y + 4, colors.snow, 2);
    line(pixels, x - 3, y - 3, x + 3, y + 3, colors.snow, 2);
    line(pixels, x + 3, y - 3, x - 3, y + 3, colors.snow, 2);
  }
};

const drawFog = (pixels) => {
  for (const y of [23, 33, 43]) {
    line(pixels, 13, y, 51, y, colors.fog, 4);
  }
  line(pixels, 22, 53, 42, 53, colors.fog, 4);
};

const drawThunderstorm = (pixels) => {
  drawCloud(pixels, 32);
  polygon(pixels, [[35, 43], [27, 55], [34, 55], [30, 64], [44, 49], [37, 49]], colors.outline);
  polygon(pixels, [[35, 44], [30, 53], [36, 53], [33, 59], [41, 50], [35, 50]], colors.lightning);
};

const drawUnknown = (pixels) => {
  circle(pixels, 32, 32, 19, colors.outline);
  circle(pixels, 32, 32, 16, colors.background);
  line(pixels, 26, 27, 28, 24, colors.unknown, 3);
  line(pixels, 28, 24, 36, 24, colors.unknown, 3);
  line(pixels, 36, 24, 39, 28, colors.unknown, 3);
  line(pixels, 39, 28, 38, 32, colors.unknown, 3);
  line(pixels, 38, 32, 32, 37, colors.unknown, 3);
  circle(pixels, 32, 44, 2, colors.unknown);
};

const drawIcon = (name) => {
  const pixels = makeCanvas();
  rectangle(pixels, 0, 0, width, height, colors.background);

  switch (name) {
    case 'clear':
      drawSun(pixels);
      break;
    case 'partly-cloudy':
      drawSun(pixels, 25, 25);
      drawCloud(pixels, 39);
      break;
    case 'cloudy':
      drawCloud(pixels, 34);
      break;
    case 'fog':
      drawFog(pixels);
      break;
    case 'rain':
      drawRain(pixels);
      break;
    case 'snow':
      drawSnow(pixels);
      break;
    case 'thunderstorm':
      drawThunderstorm(pixels);
      break;
    case 'unknown':
      drawUnknown(pixels);
      break;
  }

  return pixels;
};

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

const crc32 = (data) => {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const typeBytes = Buffer.from(type, 'ascii');
  const payload = Buffer.concat([typeBytes, data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(payload), 0);
  return Buffer.concat([length, payload, checksum]);
};

const encodePng = (pixels) => {
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    rows[rowOffset] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * width * 4, width * 4).copy(rows, rowOffset + 1);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
};

mkdirSync(outputDirectory, { recursive: true });
for (const name of ['clear', 'partly-cloudy', 'cloudy', 'fog', 'rain', 'snow', 'thunderstorm', 'unknown']) {
  writeFileSync(new URL(`${name}.png`, outputDirectory), encodePng(drawIcon(name)));
}
