import {PcbSettings, PcbView, PcbFinish} from '../types/pcb';
import {PcbBoard, RasterPixels} from './pcbProcessing';

export function pcbPalette(maskColor: string, finish: PcbFinish = 'enig'): number[][] {
  const rgb = [1, 3, 5].map(p => parseInt(maskColor.slice(p, p + 2), 16));
  const light = .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
  const silk = light > 210 ? [20, 23, 26] : [247, 246, 237];
  const opacity = light < 35 || light > 210 ? .025 : .14;
  const metal = {enig:[201,164,77],hasl:[200,205,215],osp:[226,154,126]}[finish];
  return [rgb, silk, metal, rgb.map(v => Math.round(v + (255 - v) * opacity)), [175, 157, 104]];
}

/** Word-sized copies avoid allocating an RGB array for every pixel. */
export function createPcbRaster(board: PcbBoard, settings: Pick<PcbSettings, 'maskColor'> & Partial<Pick<PcbSettings,'processingMode'|'color'>>, view: PcbView | 'outline' = 'appearance', manufacturing = false): RasterPixels {
  const data = new Uint8ClampedArray(board.width * board.height * 4);
  const output = new Uint32Array(data.buffer);
  const colors = pcbPalette(settings.maskColor, settings.processingMode === 'color' ? settings.color?.finish : 'enig').concat([[235, 239, 244], [25, 33, 44], [0, 0, 0]]);
  // Reading and writing the same native byte order works on either endian architecture.
  const palette = new Uint32Array(Uint8Array.from(colors.flatMap(rgb => [...rgb, 255])).buffer);
  for (let i = 0; i < output.length; i++) {
    if (!board.boardMask[i]) continue;
    if (view === 'outline') { output[i] = palette[7]; continue; }
    if (view === 'appearance') { output[i] = palette[board.materials[i]]; continue; }
    const active = view === 'metal' ? board.copper[i] && board.mask[i] && !board.silk[i]
      : view === 'coveredCopper' ? board.copper[i] && !board.mask[i] && !board.silk[i]
      : view === 'substrate' ? board.mask[i] && !board.copper[i] && !board.silk[i] : board[view][i];
    if (manufacturing && !active) continue;
    output[i] = palette[manufacturing ? 7 : active ? 5 : 6];
  }
  return {width: board.width, height: board.height, data};
}
