// Rasterize the same Lucide icons used by prototype B. SVG is not supported by Gmail.
// Lucide is ISC licensed; icon source and license are in @lucide/svelte.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const icons = {
  weather: ['cloud-sun', '#5b7750', 2],
  commute: ['route', '#63799b', 2],
  calendar: ['calendar-days', '#5b7750', 2],
  todo: ['list-todo', '#5b7750', 2],
  house: ['house', '#5b78a5', 1.7],
  destination: ['map-pin', '#718575', 1.7],
  clear: ['sun', '#7b9c63', 1.35],
  'partly-cloudy': ['cloud-sun', '#7b9c63', 1.35],
  cloudy: ['cloud', '#7b9c63', 1.35],
  fog: ['cloud-fog', '#7b9c63', 1.35],
  rain: ['cloud-rain', '#7b9c63', 1.35],
  snow: ['cloud-snow', '#7b9c63', 1.35],
  thunderstorm: ['cloud-lightning', '#7b9c63', 1.35],
  unknown: ['cloud', '#7b9c63', 1.35]
};
const output = new URL('../static/email-icons/', import.meta.url);
mkdirSync(output, { recursive: true });
for (const [name, [icon, color, stroke]] of Object.entries(icons)) {
  const source = readFileSync(new URL(`../node_modules/@lucide/svelte/dist/icons/${icon}.svelte`, import.meta.url), 'utf8');
  const nodes = JSON.parse(source.match(/const iconNode = (.*);/)[1]);
  const body = nodes.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([key, value]) => `${key}="${value}"`).join(' ')}/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  writeFileSync(new URL(`${name}.png`, output), new Resvg(svg).render().asPng());
}
