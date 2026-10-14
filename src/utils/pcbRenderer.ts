import {E1Options, PassCardInfo} from '../types';
import {PcbLayerSettings, PcbSettings, PcbSide, PcbView} from '../types/pcb';
import {PcbBoard, PcbScene, PcbSourceLayer} from './pcbProcessing';
import {CARD_WIDTH, CARD_HEIGHT, ensureFontsLoaded, getDiecutMask, getFactionIconPos, getFactionIconUrl, getProfessionIconUrl, isImageValid, loadImage, drawVerticalBarcode} from './passRenderer';
import {getFactionEnText, getProfessionEnText} from '../data/defaultCharacters';
import {createPcbRaster} from './pcbRaster';

export {pcbPalette} from './pcbRaster';
const sourceCache = new Map<string, {dependencies: unknown[]; layer: PcbSourceLayer | null}>();
const polarityCache = new WeakMap<HTMLImageElement, boolean>();
const shapeCache = new Map<PcbSide, {shape: CanvasImageSource | null; mask: Uint8Array}>();

export interface PcbInputs {
  info: PassCardInfo;
  e1Opts: E1Options;
  frontPhotoUrl: string;
  cutoutPhotoUrl: string;
  customIconUrl: string;
}

function newCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH; canvas.height = CARD_HEIGHT;
  return canvas;
}

function sourceLayer(id: string, label: string, draw: (ctx: CanvasRenderingContext2D) => void, defaults?: Partial<PcbLayerSettings>, photo = false): PcbSourceLayer | null {
  const canvas = newCanvas(), ctx = canvas.getContext('2d', {willReadFrequently: true});
  if (!ctx) throw new Error('无法创建 PCB 绘图画布');
  draw(ctx);
  const full = ctx.getImageData(0, 0, CARD_WIDTH, CARD_HEIGHT).data;
  let x0 = CARD_WIDTH, y0 = CARD_HEIGHT, x1 = -1, y1 = -1;
  for (let y = 0; y < CARD_HEIGHT; y++) for (let x = 0; x < CARD_WIDTH; x++) {
    if (!full[(y * CARD_WIDTH + x) * 4 + 3]) continue;
    x0 = Math.min(x0,x); y0 = Math.min(y0,y); x1 = Math.max(x1,x); y1 = Math.max(y1,y);
  }
  if (x1 < 0) return null;
  x0 = Math.max(0,x0 - 5); y0 = Math.max(0,y0 - 5); x1 = Math.min(CARD_WIDTH - 1,x1 + 5); y1 = Math.min(CARD_HEIGHT - 1,y1 + 5);
  const pixels = ctx.getImageData(x0,y0,x1 - x0 + 1,y1 - y0 + 1);
  return {id,label,x:x0,y:y0,pixels,defaults,photo};
}

function fittedImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, base: HTMLImageElement, mirror: boolean) {
  const scale = Math.max(CARD_WIDTH / base.width, CARD_HEIGHT / base.height);
  const w = base.width * scale, h = base.height * scale;
  ctx.save();
  if (mirror) { ctx.translate(CARD_WIDTH,0); ctx.scale(-1,1); }
  ctx.drawImage(image,(CARD_WIDTH - w)/2,(CARD_HEIGHT - h)/2,w,h);
  ctx.restore();
}

export async function buildPcbScenes(inputs: PcbInputs, signal?: AbortSignal): Promise<Record<PcbSide, PcbScene>> {
  await ensureFontsLoaded();
  if (signal?.aborted) throw new DOMException('Source request replaced', 'AbortError');
  const factionSrc = inputs.customIconUrl || getFactionIconUrl(inputs.info.faction);
  const [photo,cutout,faction,baseboard,frontBorder,backBorder,gameLogo,profession,stripeFront,stripeBack,trademark,shape] = await Promise.all([
    inputs.frontPhotoUrl ? loadImage(inputs.frontPhotoUrl) : null,
    inputs.cutoutPhotoUrl ? loadImage(inputs.cutoutPhotoUrl) : null,
    factionSrc ? loadImage(factionSrc) : null,
    loadImage('./psd_assets/中间__精一底板.png'),
    loadImage('./psd_assets/正面__装饰图案__饰边.png'),
    loadImage('./psd_assets/背面__装饰__饰边.png'),
    loadImage('./psd_assets/正面__装饰图案__明日方舟.png'),
    loadImage(getProfessionIconUrl(inputs.info.profession)),
    loadImage('./psd_assets/正面__装饰图案__渐变条纹.png'),
    loadImage('./psd_assets/背面__装饰__渐变条纹.png'),
    loadImage('./psd_assets/背面__文字__商标.png'),
    getDiecutMask(),
  ]);
  if (signal?.aborted) throw new DOMException('Source request replaced', 'AbortError');
  const scenes = {} as Record<PcbSide,PcbScene>;
  const {info,e1Opts} = inputs, isE2 = info.elite_phase === 'E2';
  for (const side of ['front','back'] as const) {
    const back = side === 'back', layers: PcbSourceLayer[] = [];
    const add = (id: string,label: string,draw: (ctx: CanvasRenderingContext2D) => void,defaults?: Partial<PcbLayerSettings>,isPhoto=false,dependencies: unknown[] = []) => {
      const key = `${side}:${id}`, cached = sourceCache.get(key);
      const layer = cached && dependencies.length === cached.dependencies.length && dependencies.every((value, i) => value === cached.dependencies[i])
        ? cached.layer : sourceLayer(id,label,draw,defaults,isPhoto);
      sourceCache.set(key, {dependencies, layer});
      if (layer) layers.push(layer);
    };
    const baseImage = isImageValid(photo) ? photo : isImageValid(cutout) ? cutout : null;
    if (baseImage) {
      if (back) {
        const active = isImageValid(cutout) ? cutout : baseImage;
        add('cutout','背面人物图',ctx => fittedImage(ctx,active,baseImage,true),undefined,true,[active,baseImage]);
      } else {
        if (isImageValid(photo)) add('photo','人物完整图',ctx => fittedImage(ctx,photo,baseImage,false),undefined,true,[photo,baseImage]);
        if (isImageValid(cutout)) add('cutout','透明人物抠图',ctx => fittedImage(ctx,cutout,baseImage,false),undefined,true,[cutout,baseImage]);
      }
    }
    if (!isE2 && isImageValid(baseboard)) add('baseboard','下方底板',ctx => {
      if (back) {ctx.translate(CARD_WIDTH,0);ctx.scale(-1,1);}
      ctx.drawImage(baseboard,0,685,590,495);
    },{mode:'copper'},false,[baseboard]);
    if (!back && !isE2 && info.show_icon && isImageValid(faction)) {
      const pos = getFactionIconPos(info.faction);
      let darkInk = polarityCache.get(faction);
      if (darkInk === undefined) {
        let weight = 0, brightness = 0;
        const sample = document.createElement('canvas'); sample.width = 64;sample.height = 64;
        const sampleCtx = sample.getContext('2d',{willReadFrequently:true});
        if (sampleCtx) {
          sampleCtx.drawImage(faction,0,0,64,64);
          const rgba = sampleCtx.getImageData(0,0,64,64).data;
          for (let i=0;i<rgba.length;i+=4) { weight += rgba[i+3];brightness += (rgba[i]+rgba[i+1]+rgba[i+2])/3 * rgba[i+3]; }
        }
        darkInk = weight > 0 && brightness/weight < 128;
        polarityCache.set(faction,darkInk);
      }
      add('faction','阵营 Logo（原始纹理）',ctx => ctx.drawImage(faction,pos.x + e1Opts.iconX,pos.y + e1Opts.iconY,(inputs.customIconUrl ? faction.width : pos.w) * e1Opts.iconScale,(inputs.customIconUrl ? faction.height : pos.h) * e1Opts.iconScale),
        {mode:'silk',preserveDetails:true,darkInk,detailThreshold:24},false,[faction,info.faction,!!inputs.customIconUrl,e1Opts.iconX,e1Opts.iconY,e1Opts.iconScale]);
    }
    if (!back && isImageValid(gameLogo)) add('gameLogo','明日方舟 Logo',ctx => ctx.drawImage(gameLogo,452,1102,123,58),{mode:'silk'},false,[gameLogo]);
    if (back && isImageValid(trademark)) add('trademark','背面商标',ctx => ctx.drawImage(trademark,121,669,317,54),{mode:'silk'},false,[trademark]);
    const border = back ? backBorder : frontBorder;
    if (isImageValid(border)) add('border','饰边与固定文字',ctx => ctx.drawImage(border,0,0,CARD_WIDTH,CARD_HEIGHT),undefined,false,[border]);
    const barcodeText = info.barcode_text || info.english_name || info.id || 'ARKNIGHTS - R001';
    add('barcode','条形码与竖排编号',ctx => {
      drawVerticalBarcode(ctx,barcodeText,back ? 535 : 0,back ? 849 : 850,55,310,'#000000');
      ctx.save();ctx.translate(back ? 521 : 83,1013);ctx.rotate(Math.PI/2);
      ctx.fillStyle='#000000';ctx.font='bold 17px "NotoSansHans-Bold", sans-serif';ctx.textBaseline='top';
      ctx.fillText(`ARKNIGHTS - ${info.id || 'R001'}`,0,0);ctx.restore();
    },undefined,false,[barcodeText,info.id]);
    if (!back) {
      add('nameText','姓名、别名与编号',ctx => {
        ctx.fillStyle='#ffffff';ctx.textBaseline='top';ctx.font='84.58px "BebasNeue", sans-serif';
        ctx.fillText((info.english_name || 'AMIYA').toUpperCase(),115,693);
        if (info.english_name2) {ctx.font='41.67px "BebasNeue", sans-serif';ctx.fillText(info.english_name2.toLowerCase(),282,723);}
        ctx.font='bold 16.67px "NotoSansHans-Bold", sans-serif';ctx.fillText(`ARKNIGHTS - ${info.id || 'R001'}`,115,767);
      },{mode:'silk'},false,[info.english_name,info.english_name2,info.id]);
      if (isImageValid(profession)) add('professionIcon','职业图标',ctx => ctx.drawImage(profession,117,993,83,83),undefined,false,[profession]);
    }
    add('professionText','职业与阵营文字',ctx => {
      ctx.fillStyle='#ffffff';ctx.textBaseline='top';ctx.font=`${back ? 16 : 16.125}px "NotoSansHans-Medium", sans-serif`;
      ctx.fillText(`${getProfessionEnText(info.profession,info.profession_en)} / ${getFactionEnText(info.faction,info.faction_en)}`,back ? 122 : 117,back ? 691 : 1131);
    },{mode:'silk'},false,[info.profession,info.profession_en,info.faction,info.faction_en]);
    const stripe = back ? stripeBack : stripeFront;
    if (isImageValid(stripe)) add('stripe','装饰竖条',ctx => ctx.drawImage(stripe,back ? 483 : 95,684,13,496),{mode:'gold'},false,[stripe]);
    const cachedShape = shapeCache.get(side);
    const boardMask = cachedShape?.shape === shape ? cachedShape.mask : new Uint8Array(CARD_WIDTH * CARD_HEIGHT).fill(1);
    if (shape && cachedShape?.shape !== shape) {
      const canvas = newCanvas(), ctx = canvas.getContext('2d',{willReadFrequently:true});
      if (ctx) {
        if (back) {ctx.translate(CARD_WIDTH,0);ctx.scale(-1,1);}
        ctx.drawImage(shape,0,0);
        const rgba=ctx.getImageData(0,0,CARD_WIDTH,CARD_HEIGHT).data;
        for(let i=0;i<boardMask.length;i++) boardMask[i]=rgba[i*4+3]>127?1:0;
      }
    }
    shapeCache.set(side,{shape,mask:boardMask});
    scenes[side]={side,width:CARD_WIDTH,height:CARD_HEIGHT,boardMask,layers};
  }
  return scenes;
}

export function drawPcbBoard(canvas: HTMLCanvasElement, board: PcbBoard, settings: PcbSettings, view: PcbView = 'appearance', manufacturing = false) {
  canvas.width=board.width;canvas.height=board.height;
  const ctx=canvas.getContext('2d'); if(!ctx) return;
  const raster = createPcbRaster(board,settings,view,manufacturing);
  ctx.putImageData(new ImageData(raster.data,board.width,board.height),0,0);
}

export function pcbCanvas(board: PcbBoard, settings: PcbSettings, view: PcbView='appearance', manufacturing=false) {
  const canvas=document.createElement('canvas');drawPcbBoard(canvas,board,settings,view,manufacturing);return canvas;
}

export function downloadPcbImage(board: PcbBoard, settings: PcbSettings, view: PcbView, name: string) {
  const link=document.createElement('a');
  link.download=name;link.href=pcbCanvas(board,settings,view,view!=='appearance').toDataURL('image/png');link.click();
}
