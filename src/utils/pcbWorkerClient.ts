import {PcbExportImage, PcbExportPlan, PcbScenePatch, PcbScenes, PcbSideFrames, PcbWorkerJob, PcbWorkerRequest, PcbWorkerResponse} from '../types/pcbWorker';
import {PcbSettings, PcbSide, PcbView} from '../types/pcb';
import {PcbBoard,PcbSourceLayer} from './pcbProcessing';
import {LatestTaskQueue, QueuedTask} from './latestTaskQueue';
import {PcbInputs, buildPcbScenes} from './pcbRenderer';

export function closePcbFrames(frames: PcbSideFrames) {
  for (const frame of Object.values(frames)) frame.bitmap?.close();
}

export class PcbWorkerClient {
  private worker: Worker;
  private queue: LatestTaskQueue<PcbWorkerJob, PcbExportImage[]>;
  private sentSources = new Map<string, PcbSourceLayer>();
  private sentMasks = new Map<PcbSide, Uint8Array>();
  private sentBoards = new Map<PcbSide,PcbBoard>();
  private running: {task: QueuedTask<PcbWorkerJob>; resolve: (images: PcbExportImage[]) => void; reject: (error: Error) => void} | null = null;
  closed = false;

  constructor(worker?: Worker) {
    this.worker = worker || new Worker(new URL('../workers/pcb.worker.ts', import.meta.url), {type: 'module'});
    this.queue = new LatestTaskQueue(task => this.execute(task));
    this.worker.onmessage = event => {
      const message = event.data as PcbWorkerResponse, running = this.running;
      if (message.type === 'side') {
        if (running?.task.id === message.id && this.queue.isCurrent(message.id) && running.task.payload.onSide) running.task.payload.onSide(message.side, message.frames);
        else closePcbFrames(message.frames);
      } else if (running?.task.id === message.id) {
        this.running = null;
        if (message.type === 'error') running.reject(new Error(message.message));
        else running.resolve(message.images || []);
      }
    };
    this.worker.onerror = event => this.dispose(new Error(event.message || 'PCB 后台处理器无法启动'));
    this.worker.onmessageerror = () => this.dispose(new Error('PCB 后台数据传输失败'));
  }

  preview(job: PcbWorkerJob): Promise<PcbExportImage[]> {
    this.cancelPreview();
    return this.queue.preview(job);
  }

  export(job: PcbWorkerJob): Promise<PcbExportImage[]> { return this.queue.export(job); }

  cancelPreview() {
    if (this.running?.task.kind === 'preview') this.worker.postMessage({type: 'cancel', id: this.running.task.id} satisfies PcbWorkerRequest);
    this.queue.cancelPreview();
  }

  dispose(error = new Error('PCB processor closed')) {
    this.closed = true;
    this.queue.dispose(error); this.running?.reject(error); this.running = null;
    this.worker.terminate(); this.sentSources.clear(); this.sentMasks.clear();this.sentBoards.clear();
  }

  private patchScenes(scenes: PcbScenes): Record<PcbSide, PcbScenePatch> {
    return Object.fromEntries((['front', 'back'] as const).map(side => {
      const scene = scenes[side];
      const present=new Set(scene.layers.map(layer=>`${side}:${layer.id}`));
      // The worker releases removed sources. Forget our matching sent entries
      // too, so re-enabling the same immutable source uploads its pixels again.
      for (const key of this.sentSources.keys()) if (key.startsWith(`${side}:`)&&!present.has(key)) this.sentSources.delete(key);
      const boardMask = this.sentMasks.get(side) === scene.boardMask ? undefined : scene.boardMask;
      this.sentMasks.set(side, scene.boardMask);
      const board=this.sentBoards.get(side)===scene.board?undefined:scene.board||null;
      if(scene.board)this.sentBoards.set(side,scene.board);else this.sentBoards.delete(side);
      const layers = scene.layers.map(layer => {
        const key = `${side}:${layer.id}`, previous = this.sentSources.get(key);
        this.sentSources.set(key, layer);
        // Do not detach the immutable source buffers; the main thread reuses them.
        return {...layer, pixels: previous?.pixels === layer.pixels ? undefined : layer.pixels};
      });
      return [side, {...scene, layers, boardMask, board}];
    })) as Record<PcbSide, PcbScenePatch>;
  }

  private execute(task: QueuedTask<PcbWorkerJob>): Promise<PcbExportImage[]> {
    return new Promise((resolve, reject) => {
      this.running = {task, resolve, reject};
      const {settings, side, quality, plan, include3d} = task.payload;
      this.worker.postMessage({type: 'process', id: task.id, kind: task.kind, scenes: this.patchScenes(task.payload.scenes), settings, side, quality, plan, include3d} satisfies PcbWorkerRequest);
    });
  }
}

let sharedClient: PcbWorkerClient | undefined;
export function getPcbWorkerClient(): PcbWorkerClient {
  if (!sharedClient || sharedClient.closed) sharedClient = new PcbWorkerClient();
  return sharedClient;
}

// Vite replaces this module without leaving an old worker or bitmap producer alive.
(import.meta as ImportMeta & {hot?: {dispose: (callback: () => void) => void}}).hot?.dispose(() => sharedClient?.dispose());

export async function exportPcbImages(inputs: PcbInputs, settings: PcbSettings, plan: PcbExportPlan) {
  const scenes = await buildPcbScenes({...inputs,backLogo:settings.backLogo});
  const images = await getPcbWorkerClient().export({scenes, settings, side: plan.sides[0] || 'front', quality: 'full', plan});
  return {scenes, images};
}

export function pcbImageBlob(image: PcbExportImage): Promise<Blob> {
  if (image.blob) return Promise.resolve(image.blob);
  const {width, height, data} = image.raster!;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('无法创建 PNG 导出画布'));
  ctx.putImageData(new ImageData(data, width, height), 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG 导出失败')), 'image/png'));
}

export async function downloadPcbPreview(inputs: PcbInputs, settings: PcbSettings, side: PcbSide, view: PcbView, name: string) {
  const {images} = await exportPcbImages(inputs, settings, {sides: [side], views: [view], outline: false});
  const blob = await pcbImageBlob(images[0]), url = URL.createObjectURL(blob), link = document.createElement('a');
  link.download = name; link.href = url; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
