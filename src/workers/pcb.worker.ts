import {PcbSide, PcbView, PcbSettings, getPcbViews} from '../types/pcb';
import {PcbExportImage, PcbFrame, PcbScenePatch, PcbSideFrames, PcbWorkerRequest, PcbWorkerResponse} from '../types/pcbWorker';
import {PcbBoard, PcbScene, RasterPixels} from '../utils/pcbProcessing';
import {PcbProcessingCache} from '../utils/pcbProcessingCache';
import {createPcbRaster} from '../utils/pcbRaster';

const scope = self as unknown as {
  onmessage: (event: MessageEvent<PcbWorkerRequest>) => void;
  postMessage: (message: PcbWorkerResponse, transfer?: Transferable[]) => void;
};
const processor = new PcbProcessingCache();
const scenes = new Map<PcbSide, PcbScene>();
const sources = new Map<string, RasterPixels>();
let cancelledUntil = 0;
interface CachedImage {board: PcbBoard; color: string; raster: RasterPixels; canvas?: OffscreenCanvas}
const images = new Map<string, CachedImage>();

function applyScene(patch: PcbScenePatch): PcbScene {
  const boardMask = patch.boardMask || scenes.get(patch.side)?.boardMask;
  if (!boardMask) throw new Error('缺少 PCB 板形');
  const layers = patch.layers.map(layer => {
    const key = `${patch.side}:${layer.id}`;
    if (layer.pixels) sources.set(key, layer.pixels);
    const pixels = sources.get(key);
    if (!pixels) throw new Error(`缺少 PCB 素材：${layer.label}`);
    return {...layer, pixels};
  });
  const scene = {...patch, boardMask, layers};
  scenes.set(patch.side, scene);
  return scene;
}

function imageFor(board: PcbBoard, settings: PcbSettings, view: PcbView | 'outline', quality: string, manufacturing = false): CachedImage {
  const key = `${board.side}:${quality}:${view}:${manufacturing}`;
  const paletteKey = view === 'appearance' ? `${settings.maskColor}:${settings.processingMode}:${settings.color.finish}` : '';
  const cached = images.get(key);
  if (cached?.board === board && cached.color === paletteKey) return cached;
  const raster = createPcbRaster(board, settings, view, manufacturing);
  let canvas: OffscreenCanvas | undefined;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = cached?.canvas || new OffscreenCanvas(board.width, board.height);
    canvas.width = board.width; canvas.height = board.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建后台 PCB 画布');
    ctx.putImageData(new ImageData(raster.data, board.width, board.height), 0, 0);
  }
  const image = {board, color: paletteKey, raster, canvas};
  images.set(key, image);
  return image;
}

async function previewFrame(image: CachedImage): Promise<PcbFrame> {
  const {width, height, data} = image.raster;
  if (image.canvas && typeof createImageBitmap !== 'undefined') return {width, height, bitmap: await createImageBitmap(image.canvas)};
  // Worker still performs the pixel loop when OffscreenCanvas is unavailable.
  return {width, height, pixels: data.slice()};
}

async function process(request: Extract<PcbWorkerRequest, {type: 'process'}>) {
  try {
    const source = {front: applyScene(request.scenes.front), back: applyScene(request.scenes.back)};
    if (request.kind === 'export') {
      const files: PcbExportImage[] = [];
      for (const side of request.plan!.sides) {
        // Export always uses the unscaled original sources, even during a drag.
        const board = processor.compose(source[side], request.settings, 'full');
        const requested = [...request.plan!.views.filter(view=>getPcbViews(request.settings).includes(view)), ...(request.plan!.outline ? ['outline' as const] : [])];
        for (const view of requested) {
          const image = imageFor(board, request.settings, view, 'full', view !== 'appearance');
          files.push(image.canvas ? {side, view, blob: await image.canvas.convertToBlob({type: 'image/png'})} : {side, view, raster: image.raster});
        }
      }
      scope.postMessage({type: 'done', id: request.id, images: files});
      return;
    }
    const order: PcbSide[] = [request.side, request.side === 'front' ? 'back' : 'front'];
    for (const side of order) {
      if (request.id <= cancelledUntil) break;
      const board = processor.compose(source[side], request.settings, request.quality);
      const frames: PcbSideFrames = {};
      for (const view of getPcbViews(request.settings)) frames[view] = await previewFrame(imageFor(board, request.settings, view, request.quality));
      if (request.id <= cancelledUntil) {
        for (const frame of Object.values(frames)) frame.bitmap?.close();
        break;
      }
      const transfer = Object.values(frames).map(frame => frame.bitmap || frame.pixels!.buffer) as Transferable[];
      scope.postMessage({type: 'side', id: request.id, side, frames}, transfer);
      // Let a superseding request cancel the second face before doing more work.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    scope.postMessage({type: 'done', id: request.id});
  } catch (error) {
    scope.postMessage({type: 'error', id: request.id, message: error instanceof Error ? error.message : 'PCB 后台处理失败'});
  }
}

scope.onmessage = event => {
  if (event.data.type === 'cancel') cancelledUntil = Math.max(cancelledUntil, event.data.id);
  else void process(event.data);
};
