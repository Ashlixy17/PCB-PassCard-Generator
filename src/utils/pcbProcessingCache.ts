import {PcbLayerSettings, PcbSettings} from '../types/pcb';
import {PcbBoard, PcbScene, RasterPixels, composePcbLayers, getPcbLayerSettings, processPcbPixels} from './pcbProcessing';

export type PcbQuality = 'draft' | 'full';
const DRAFT_SCALE = .4;

function optionsKey(value: PcbLayerSettings): string {
  if (!value.enabled) return 'hidden';
  if (['mask', 'copper', 'fr4'].includes(value.mode)) return value.mode;
  const base = [value.mode, value.edgeExpansion];
  if (value.mode !== 'auto' && !value.preserveDetails) return base.join(':');
  return base.concat([
    value.smoothing, value.brightness, value.contrast, Number(value.invert), Number(value.darkInk),
    ...(value.mode === 'auto' ? [value.silkThreshold, value.maskThreshold] : [value.detailThreshold]),
  ]).join(':');
}

function resizePixels(source: RasterPixels, scale: number): RasterPixels {
  const width = Math.max(1, Math.round(source.width * scale)), height = Math.max(1, Math.round(source.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  const input = new Uint32Array(source.data.buffer, source.data.byteOffset, source.width * source.height);
  const output = new Uint32Array(data.buffer);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    output[y * width + x] = input[Math.min(source.height - 1, Math.floor(y / scale)) * source.width + Math.min(source.width - 1, Math.floor(x / scale))];
  }
  return {width, height, data};
}

/** Only the most recent variant per object/resolution is retained. */
export class PcbProcessingCache {
  private resized = new Map<string, {source: RasterPixels; pixels: RasterPixels}>();
  private masks = new WeakMap<Uint8Array, Uint8Array>();
  private layers = new Map<string, {pixels: RasterPixels; options: string; photo: boolean; data: Uint8Array}>();
  private boards = new Map<string, {scene: PcbScene; converted: Uint8Array[]; board: PcbBoard}>();
  stats = {processedLayers: 0, reusedLayers: 0, composed: false};

  compose(source: PcbScene, settings: PcbSettings, quality: PcbQuality = 'full'): PcbBoard {
    this.stats = {processedLayers: 0, reusedLayers: 0, composed: false};
    const scale = quality === 'draft' ? DRAFT_SCALE : 1;
    let scene = source;
    if (scale !== 1) {
      const width = Math.round(source.width * scale), height = Math.round(source.height * scale);
      let boardMask = this.masks.get(source.boardMask);
      if (!boardMask) {
        boardMask = new Uint8Array(width * height);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) boardMask[y * width + x] = source.boardMask[Math.min(source.height - 1, Math.floor(y / scale)) * source.width + Math.min(source.width - 1, Math.floor(x / scale))];
        this.masks.set(source.boardMask, boardMask);
      }
      scene = {...source, width, height, boardMask, layers: source.layers.map(layer => {
        const key = `${source.side}:${layer.id}`;
        let cached = this.resized.get(key);
        if (!cached || cached.source !== layer.pixels) {
          cached = {source: layer.pixels, pixels: resizePixels(layer.pixels, scale)};
          this.resized.set(key, cached);
        }
        return {...layer, x: Math.round(layer.x * scale), y: Math.round(layer.y * scale), pixels: cached.pixels};
      })};
    }
    const converted = scene.layers.map(layer => {
      const options = getPcbLayerSettings(settings, scene.side, layer);
      if (scale !== 1) {
        options.edgeExpansion = Math.round(options.edgeExpansion * scale);
        options.smoothing = Math.round(options.smoothing * scale);
      }
      const key = `${scene.side}:${quality}:${layer.id}`, signature = optionsKey(options), photo = !!layer.photo;
      const cached = this.layers.get(key);
      if (cached && cached.pixels === layer.pixels && cached.options === signature && cached.photo === photo) {
        this.stats.reusedLayers++;
        return cached.data;
      }
      const data = processPcbPixels(layer.pixels, options, photo);
      this.layers.set(key, {pixels: layer.pixels, options: signature, photo, data});
      this.stats.processedLayers++;
      return data;
    });
    const key = `${scene.side}:${quality}`, cached = this.boards.get(key);
    if (cached && cached.scene.boardMask === scene.boardMask && cached.scene.width === scene.width && cached.scene.height === scene.height &&
      cached.converted.length === converted.length && converted.every((data, i) => data === cached.converted[i] && scene.layers[i].id === cached.scene.layers[i].id && scene.layers[i].x === cached.scene.layers[i].x && scene.layers[i].y === cached.scene.layers[i].y)) return cached.board;
    const board = composePcbLayers(scene, converted);
    this.boards.set(key, {scene, converted, board});
    this.stats.composed = true;
    return board;
  }
}
