import { PcbLayerSettings, PcbSettings, PcbSide } from '../types/pcb';

export enum PcbMaterial { Mask, Silk, Gold, CoveredCopper, Substrate, Transparent = 255 }
export interface RasterPixels { width: number; height: number; data: Uint8ClampedArray }
export interface PcbSourceLayer {
  id: string;
  label: string;
  x: number;
  y: number;
  pixels: RasterPixels;
  defaults?: Partial<PcbLayerSettings>;
  photo?: boolean;
}
export interface PcbScene {
  side: PcbSide;
  width: number;
  height: number;
  boardMask: Uint8Array;
  layers: PcbSourceLayer[];
}
export interface PcbBoard {
  side: PcbSide;
  width: number;
  height: number;
  boardMask: Uint8Array;
  materials: Uint8Array;
  silk: Uint8Array;
  copper: Uint8Array;
  mask: Uint8Array;
}

export const pcbLayerKey = (side: PcbSide, id: string) => `${side}:${id}`;

export function getPcbLayerSettings(settings: PcbSettings, side: PcbSide, layer: PcbSourceLayer): PcbLayerSettings {
  return {
    enabled: true, mode: 'auto', invert: false, darkInk: false,
    preserveDetails: false, detailThreshold: 24, brightness: 0, contrast: 100,
    silkThreshold: settings.silkThreshold, maskThreshold: settings.maskThreshold,
    edgeExpansion: settings.edgeExpansion, smoothing: settings.smoothing,
    ...layer.defaults, ...settings.overrides[pcbLayerKey(side, layer.id)],
  };
}

function smoothTones(tones: Float32Array, pixels: RasterPixels, radius: number) {
  if (!radius) return tones;
  const {width: w, height: h, data} = pixels, stride = w + 1;
  const sums = new Float64Array(stride * (h + 1)), weights = new Float64Array(sums.length);
  for (let y = 0; y < h; y++) {
    let rowSum = 0, rowWeight = 0;
    for (let x = 0; x < w; x++) {
      const i = y * w + x, alpha = data[i * 4 + 3] / 255, p = (y + 1) * stride + x + 1;
      rowSum += tones[i] * alpha; rowWeight += alpha;
      sums[p] = sums[p - stride] + rowSum; weights[p] = weights[p - stride] + rowWeight;
    }
  }
  const output = new Float32Array(tones.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.max(0, x - radius), x1 = Math.min(w, x + radius + 1);
    const y0 = Math.max(0, y - radius), y1 = Math.min(h, y + radius + 1);
    const a = y0 * stride + x0, b = y0 * stride + x1, c = y1 * stride + x0, d = y1 * stride + x1;
    const weight = weights[d] - weights[b] - weights[c] + weights[a];
    output[y * w + x] = weight > 0 ? (sums[d] - sums[b] - sums[c] + sums[a]) / weight : tones[y * w + x];
  }
  return output;
}

export function processPcbPixels(pixels: RasterPixels, options: PcbLayerSettings, photo = false): Uint8Array {
  const {width, height, data} = pixels, count = width * height;
  const output = new Uint8Array(count).fill(PcbMaterial.Transparent);
  if (!options.enabled) return output;
  let tones = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const p = i * 4;
    let tone = (.2126 * data[p] + .7152 * data[p + 1] + .0722 * data[p + 2] - 128) * options.contrast / 100 + 128 + options.brightness;
    if (options.invert) tone = 255 - tone;
    tones[i] = Math.max(0, Math.min(255, tone));
  }
  tones = smoothTones(tones, pixels, Math.round(options.smoothing));
  const protectedDetails = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const p = i * 4;
    if (data[p + 3] < 32) continue;
    const tone = tones[i];
    if (options.mode === 'mask') { output[i] = PcbMaterial.Mask; continue; }
    if (options.mode === 'copper') { output[i] = PcbMaterial.CoveredCopper; continue; }
    if (options.mode === 'fr4') { output[i] = PcbMaterial.Substrate; continue; }
    if (options.mode === 'silk' || options.mode === 'gold') {
      if (options.preserveDetails) {
        const detail = options.darkInk ? tone > options.detailThreshold : 255 - tone > options.detailThreshold;
        if (detail) { protectedDetails[i] = 1; continue; }
      }
      output[i] = options.mode === 'silk' ? PcbMaterial.Silk : PcbMaterial.Gold;
      continue;
    }
    const max = Math.max(data[p], data[p + 1], data[p + 2]), min = Math.min(data[p], data[p + 1], data[p + 2]);
    const colored = !photo && max > 0 && (max - min) / max > .28;
    const value = options.darkInk ? 255 - tone : tone;
    if (colored && value >= options.maskThreshold) output[i] = PcbMaterial.Gold;
    else if (value >= options.silkThreshold) output[i] = PcbMaterial.Silk;
    else if (value >= options.maskThreshold) output[i] = PcbMaterial.Gold;
    else output[i] = PcbMaterial.Mask;
  }
  const radius = Math.round(options.edgeExpansion);
  if (!radius) return output;
  const expanded = output.slice();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, material = output[i];
    if (material !== PcbMaterial.Silk && material !== PcbMaterial.Gold) continue;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const n = ny * width + nx;
      if (!protectedDetails[n] && output[n] !== PcbMaterial.Silk && output[n] !== PcbMaterial.Gold) expanded[n] = material;
    }
  }
  return expanded;
}

export function composePcbScene(scene: PcbScene, settings: PcbSettings): PcbBoard {
  return composePcbLayers(scene, scene.layers.map(layer =>
    processPcbPixels(layer.pixels, getPcbLayerSettings(settings, scene.side, layer), layer.photo)));
}

/** Compose cached material maps in the original drawing order. */
export function composePcbLayers(scene: PcbScene, convertedLayers: Uint8Array[]): PcbBoard {
  const {width, height, side, boardMask} = scene, count = width * height;
  const materials = new Uint8Array(count), silk = new Uint8Array(count), copper = new Uint8Array(count), mask = new Uint8Array(count);
  for (let index = 0; index < scene.layers.length; index++) {
    const layer = scene.layers[index], converted = convertedLayers[index];
    for (let y = 0; y < layer.pixels.height; y++) for (let x = 0; x < layer.pixels.width; x++) {
      const material = converted[y * layer.pixels.width + x];
      if (material === PcbMaterial.Transparent) continue;
      const nx = layer.x + x, ny = layer.y + y;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const i = ny * width + nx;
      if (!boardMask[i]) continue;
      materials[i] = material;
      silk[i] = material === PcbMaterial.Silk ? 1 : 0;
      mask[i] = material === PcbMaterial.Gold || material === PcbMaterial.Substrate ? 1 : 0;
      if (material !== PcbMaterial.Silk) copper[i] = material === PcbMaterial.Gold || material === PcbMaterial.CoveredCopper ? 1 : 0;
    }
  }
  return {side, width, height, boardMask, materials, silk, copper, mask};
}
