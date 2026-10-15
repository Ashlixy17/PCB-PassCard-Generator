import {PcbFinish} from '../types/pcb';
import {PcbBoard, RasterPixels} from './pcbProcessing';

/** Linear material data: green = roughness, blue = metalness. */
export function createPcbSurfaceMaps(board: PcbBoard, finish: PcbFinish = 'enig'): {surface: RasterPixels; height: RasterPixels} {
  const surface = new Uint8ClampedArray(board.width * board.height * 4);
  const height = new Uint8ClampedArray(surface.length);
  const metalRoughness = {enig: 72, hasl: 100, osp: 125}[finish];
  for (let i = 0; i < board.materials.length; i++) {
    if (!board.boardMask[i]) continue;
    const p = i * 4, silk = !!board.silk[i];
    const metal = !!board.copper[i] && !!board.mask[i] && !silk;
    const substrate = !!board.mask[i] && !board.copper[i] && !silk;
    const raised = silk ? 176 : metal ? 140 : substrate ? 96 : board.copper[i] ? 144 : 128;
    surface[p] = 255;
    surface[p + 1] = silk ? 210 : metal ? metalRoughness : substrate ? 230 : 125;
    surface[p + 2] = metal ? 255 : 0;
    surface[p + 3] = 255;
    height[p] = height[p + 1] = height[p + 2] = raised; height[p + 3] = 255;
  }
  return {surface: {width: board.width, height: board.height, data: surface}, height: {width: board.width, height: board.height, data: height}};
}
