import {PcbBackLogoLayout, PCB_BACK_LOGO_DEFAULTS} from '../types/pcb';

/** Percentages locate the logo's center, independently of the front template. */
export function getBackLogoRect(image: {width: number; height: number}, layout: PcbBackLogoLayout = PCB_BACK_LOGO_DEFAULTS) {
  const ratio = Math.min(590 * .6 / image.width, 1180 * .35 / image.height) * layout.scale;
  const width = image.width * ratio, height = image.height * ratio;
  return {x: 590 * layout.x / 100 - width / 2, y: 1180 * layout.y / 100 - height / 2, width, height};
}
