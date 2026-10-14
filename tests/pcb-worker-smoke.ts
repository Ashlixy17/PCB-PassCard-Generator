import {PCB_DEFAULTS, PcbSide} from '../src/types/pcb';
import {PcbScenes, PcbSideFrames} from '../src/types/pcbWorker';
import {composePcbScene} from '../src/utils/pcbProcessing';
import {createPcbRaster} from '../src/utils/pcbRaster';
import {getPcbWorkerClient, closePcbFrames, pcbImageBlob} from '../src/utils/pcbWorkerClient';
import {SupersededTaskError} from '../src/utils/latestTaskQueue';

const button = document.querySelector<HTMLButtonElement>('#run')!;
const output = document.querySelector<HTMLPreElement>('#results')!;
const canvas = document.querySelector<HTMLCanvasElement>('#preview')!;
const check = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
const settle = () => new Promise(resolve => setTimeout(resolve, 35));

button.addEventListener('click', async () => {
  button.disabled = true; output.textContent = '正在验证…';
  const data = new Uint8ClampedArray(590 * 1180 * 4);
  for (let y = 0; y < 1180; y++) for (let x = 0; x < 590; x++) {
    const i = (y * 590 + x) * 4, tone = 60 + (x * 3 + y) % 190;
    data[i] = tone; data[i + 1] = tone; data[i + 2] = tone; data[i + 3] = 255;
  }
  const pixels = {width: 590, height: 1180, data}, mask = new Uint8Array(590 * 1180).fill(1);
  for (let x = 180; x < 400; x++) for (let y = 30; y < 60; y++) mask[y * 590 + x] = 0;
  const scenes = Object.fromEntries((['front', 'back'] as const).map(side => [side,
    {side, width: 590, height: 1180, boardMask: mask, layers: [{id: 'photo', label: 'photo', x: 0, y: 0, pixels, photo: true}]}])) as PcbScenes;
  const settings = {...PCB_DEFAULTS, edgeExpansion: 4, smoothing: 3};
  const report: Record<string, unknown> = {};
  let lastTick = performance.now(), maxGap = 0, ticks = 0;
  const heartbeat = setInterval(() => {
    const now = performance.now(); maxGap = Math.max(maxGap, now - lastTick); lastTick = now; ticks++;
  }, 16);
  const resetTimer = () => { lastTick = performance.now(); maxGap = 0; ticks = 0; };
  try {
    await settle(); resetTimer();
    const start = performance.now();
    const original = {front: composePcbScene(scenes.front, settings), back: composePcbScene(scenes.back, settings)};
    report.original_main_thread_compute_ms = Math.round(performance.now() - start);
    await settle(); report.original_max_timer_gap_ms = Math.round(maxGap);
    const client = getPcbWorkerClient();
    const draw = (face: PcbSide, frames: PcbSideFrames) => {
      if (face === 'front' && frames.appearance) {
        const frame = frames.appearance; canvas.width = frame.width; canvas.height = frame.height;
        const ctx = canvas.getContext('2d')!;
        if (frame.bitmap) ctx.drawImage(frame.bitmap, 0, 0);
        else ctx.putImageData(new ImageData(frame.pixels!, frame.width, frame.height), 0, 0);
      }
      closePcbFrames(frames);
    };
    resetTimer(); const workerStart = performance.now();
    await client.preview({scenes, settings, side: 'front', quality: 'full', onSide: draw});
    report.worker_elapsed_ms = Math.round(performance.now() - workerStart);
    await settle(); report.worker_max_timer_gap_ms = Math.round(maxGap); report.worker_heartbeat_ticks = ticks;
    check(ticks >= 2, 'The main-thread heartbeat stopped during worker rendering');
    const accepted: number[] = [], requests: Promise<unknown>[] = [];
    for (let value = 0; value < 25; value++) requests.push(client.preview({scenes, settings: {...settings, silkThreshold: 170 + value}, side: 'front', quality: 'draft', onSide: (face, frames) => {
      accepted.push(value); check(frames.appearance?.width === 236, 'Wrong draft dimensions'); draw(face, frames);
    }}).catch(error => { if (!(error instanceof SupersededTaskError)) throw error; return 'superseded'; }));
    const results = await Promise.all(requests);
    check(results.slice(0, 24).every(value => value === 'superseded'), 'Intermediate previews were not coalesced');
    check(accepted.length === 2 && accepted.every(value => value === 24), 'An obsolete preview reached the screen');
    report.continuous_requests = 25; report.accepted_latest_faces = accepted.length;
    await client.preview({scenes, settings, side: 'back', quality: 'full', onSide: (face, frames) => {
      check(frames.appearance?.width === 590 && frames.appearance?.height === 1180, 'Full precision was not restored'); draw(face, frames);
    }});
    const images = await client.export({scenes, settings, side: 'front', quality: 'full', plan: {sides: ['front', 'back'], views: ['appearance', 'silk', 'copper', 'mask'], outline: true}});
    for (const file of images) {
      const bitmap = await createImageBitmap(await pcbImageBlob(file));
      check(bitmap.width === 590 && bitmap.height === 1180, 'Export used draft pixels');
      const decoded = document.createElement('canvas'); decoded.width = 590; decoded.height = 1180;
      const ctx = decoded.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); bitmap.close();
      const actual = ctx.getImageData(0, 0, 590, 1180).data;
      const expected = createPcbRaster(original[file.side], settings, file.view, file.view !== 'appearance').data;
      check(actual.every((value, i) => value === expected[i]), `${file.side}/${file.view} changed the original layer output`);
    }
    report.exact_png_exports_verified = images.length; report.result = 'PASS';
    output.textContent = JSON.stringify(report, null, 2);
  } catch (error) {
    output.textContent = JSON.stringify({...report, result: 'FAIL', error: String(error)}, null, 2);
  } finally { clearInterval(heartbeat); button.disabled = false; }
});
