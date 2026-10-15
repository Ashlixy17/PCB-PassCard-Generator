import JSZip from 'jszip';
import type {E1Options,PassCardInfo,ProfessionKey} from '../types';
import {normalizePcbSettings,PcbSide} from '../types/pcb';
import type {ImportedPcbProject,PcbModelSize,PcbProjectContext} from '../types/pcbProject';
import {PcbBoard,PcbMaterial,RasterPixels} from './pcbProcessing';

const WIDTH=590,HEIGHT=1180,COUNT=WIDTH*HEIGHT;
const MAX_ZIP=100*1024*1024,MAX_FILE=24*1024*1024,MAX_TOTAL=128*1024*1024;
const sides=['front','back'] as const;
type MediaKey='frontPhotoUrl'|'cutoutPhotoUrl'|'customIconUrl'|'rawFrontPhotoUrl'|'rawCutoutPhotoUrl';
const mediaKeys:MediaKey[]=['frontPhotoUrl','cutoutPhotoUrl','customIconUrl','rawFrontPhotoUrl','rawCutoutPhotoUrl'];
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const text=(value:unknown,fallback='',limit=200)=>typeof value==='string'?value.slice(0,limit):fallback;
const clamp=(value:unknown,fallback:number,min:number,max:number)=>typeof value==='number'&&Number.isFinite(value)?Math.min(max,Math.max(min,value)):fallback;
const color=(value:unknown,fallback:string)=>typeof value==='string'&&/^#[a-f\d]{6}$/i.test(value)?value:fallback;
const safePath=(path:string)=>path.length>0&&path.length<500&&!/^[\/\\]|[\\:\x00-\x1f]/.test(path)&&!path.split('/').some(part=>part==='..'||part==='.');
export const PCB_BOARD_IMPORT_NOTICE='此文件未包含原始素材，可查看正反面、制造图层和 3D，修改阻焊配色并重新导出；无法重新分色或单独编辑人物、文字和 Logo。';

export function pcbProjectName(info:PassCardInfo) {
  return `${info.english_name||info.id}_${info.chinese_name||''}`.replace(/[\x00-\x1f\x7f\\/:*?"<>|]/g,'').replace(/^\.+|\.+$/g,'')||'PCB_Card';
}
export function normalizePcbModelSize(value:unknown):PcbModelSize {
  const saved=object(value),thickness=clamp(saved.thickness,1.6,.6,2.4);
  return {width:clamp(saved.width,59,20,120),thickness:[.6,.8,1,1.2,1.6,2,2.4].includes(thickness)?thickness:1.6};
}
function normalizeLayout(value:unknown):E1Options {
  const saved=object(value);
  return {enabled:saved.enabled!==false,faction:text(saved.faction,'罗德岛'),iconX:clamp(saved.iconX,0,-150,150),iconY:clamp(saved.iconY,0,-150,150),iconScale:clamp(saved.iconScale,1,.3,2.5),gradientEnabled:saved.gradientEnabled===true,frontColor:color(saved.frontColor,'#0d1b2a'),gradColor:color(saved.gradColor,'#1e3a8a')};
}
function normalizeInfo(value:unknown,name:string,layout:E1Options):PassCardInfo {
  const saved=object(value),[english,...chinese]=name.split('_');
  const profession=['先锋','近卫','狙击','重装','医疗','辅助','术师','特种'].includes(String(saved.profession))?saved.profession as ProfessionKey:'先锋';
  return {chinese_name:text(saved.chinese_name,chinese.join('_')),english_name:text(saved.english_name,english),english_name2:text(saved.english_name2),id:text(saved.id),profession,profession_en:text(saved.profession_en,'VANGUARD'),barcode_text:text(saved.barcode_text,text(saved.english_name,english)),show_icon:saved.show_icon!==false,faction:text(saved.faction,layout.faction),faction_en:text(saved.faction_en),back_color:color(saved.back_color,'#0d1b2a'),base_color:color(saved.base_color,'#0d1b2a')};
}

function pngSize(bytes:Uint8Array) {
  if(bytes.length<24||![137,80,78,71,13,10,26,10].every((value,i)=>bytes[i]===value))throw new Error('图层不是有效的 PNG 文件');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const width=view.getUint32(16),height=view.getUint32(20);
  if(width<1||height<1||width>8192||height>8192||width*height>32*1024*1024)throw new Error('图片尺寸过大或无效');
  return {width,height};
}
function imageMime(bytes:Uint8Array):string {
  if(bytes[0]===137&&bytes[1]===80){pngSize(bytes);return 'image/png';}
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(new TextDecoder().decode(bytes.subarray(0,4))==='GIF8')return 'image/gif';
  if(new TextDecoder().decode(bytes.subarray(0,4))==='RIFF'&&new TextDecoder().decode(bytes.subarray(8,12))==='WEBP')return 'image/webp';
  throw new Error('工程素材仅支持 PNG、JPEG、WebP 或 GIF 图片');
}
function dataUrl(bytes:Uint8Array,mime:string) {
  const chunks:string[]=[];
  for(let i=0;i<bytes.length;i+=32768)chunks.push(String.fromCharCode(...bytes.subarray(i,i+32768)));
  return `data:${mime};base64,${btoa(chunks.join(''))}`;
}
async function mediaBytes(url:string):Promise<Uint8Array> {
  const match=/^data:image\/[a-z0-9.+-]+;base64,([a-z\d+/=\s]+)$/i.exec(url);
  if(match) {
    if(match[1].length>MAX_FILE*4/3+1024)throw new Error('工程素材过大');
    const decoded=Uint8Array.from(atob(match[1]),character=>character.charCodeAt(0));
    try{imageMime(decoded);return decoded;}catch{/* Convert other locally uploaded image formats below. */}
  }
  if(!url.startsWith('data:image/'))throw new Error('工程素材需要先上传到当前页面');
  const {loadImage}=await import('./passRenderer');
  const image=await loadImage(url);if(!image)throw new Error('无法保存工程素材');
  if(image.width*image.height>32*1024*1024)throw new Error('工程素材尺寸过大');
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  canvas.getContext('2d')!.drawImage(image,0,0);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('无法保存工程素材')),'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

/** Stores an editable template, or an honest physical-layer snapshot when the
 * original artwork is unavailable. Does not infer missing artwork from a PNG. */
export async function appendPcbProject(folder:JSZip,context:PcbProjectContext,name=pcbProjectName(context.inputs.info),availableSides:readonly PcbSide[]=sides) {
  const {inputs,settings,modelSize}=context;
  const manifest:Record<string,unknown>={format:'PCB-PassCard-Generator',version:1,kind:inputs.savedBoards?'board':'template',name,resolution:{width:WIDTH,height:HEIGHT},settings,layout:inputs.e1Opts,info:inputs.info,modelSize,availableSides};
  if(inputs.savedBoards) {
    const boards:Partial<Record<PcbSide,string>>={};
    for(const side of availableSides) {
      const board=inputs.savedBoards[side],packed=new Uint8Array(COUNT*4);
      if(board.width!==WIDTH||board.height!==HEIGHT)throw new Error('保存的板面尺寸不匹配');
      [board.boardMask,board.silk,board.copper,board.mask].forEach((plane,i)=>packed.set(plane,i*COUNT));
      const path=`工程/${side}.pcb`;folder.file(path,packed,{compression:'DEFLATE'});boards[side]=path;
    }
    manifest.boards=boards;
  } else {
    const media:Partial<Record<MediaKey,string>>={},written=new Map<string,string>();
    for(const key of mediaKeys) {
      const url=key==='rawFrontPhotoUrl'||key==='rawCutoutPhotoUrl'?context[key]:inputs[key];
      if(!url)continue;
      let path=written.get(url);
      if(!path) {
        const bytes=await mediaBytes(url);imageMime(bytes);
        path=`工程/素材/${key}.image`;folder.file(path,bytes);written.set(url,path);
      }
      media[key]=path;
    }
    manifest.media=media;
  }
  folder.file('工程.json',JSON.stringify(manifest,null,2));
}

/** Read selected entries with decompressed-size limits; nothing is extracted
 * to disk, and references can never request an external URL or filesystem path. */
function archiveReader(zip:JSZip,root:string) {
  let total=0;
  const cached=new Map<string,Promise<Uint8Array>>();
  return (relative:string,limit=MAX_FILE):Promise<Uint8Array>=>{
    if(!safePath(relative))return Promise.reject(new Error('工程文件路径无效'));
    const path=root+relative;
    if(cached.has(path))return cached.get(path)!;
    const file=zip.file(path);if(!file)return Promise.reject(new Error(`压缩包缺少文件：${relative}`));
    const promise=new Promise<Uint8Array>((resolve,reject)=>{
      const stream=(file as JSZip.JSZipObject & {internalStream:(type:'uint8array')=>JSZip.JSZipStreamHelper<Uint8Array>}).internalStream('uint8array');
      const chunks:Uint8Array[]=[];let size=0,failed=false;
      stream.on('data',chunk=>{
        if(failed)return;
        size+=chunk.length;total+=chunk.length;
        if(size>limit||total>MAX_TOTAL){failed=true;stream.pause();reject(new Error('压缩包展开后的数据过大'));return;}
        chunks.push(chunk);
      }).on('error',reject).on('end',()=>{
        if(failed)return;
        const bytes=new Uint8Array(size);let offset=0;
        for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
        resolve(bytes);
      }).resume();
    });
    cached.set(path,promise);return promise;
  };
}

export function restorePcbBoard(side:PcbSide,boardMask:Uint8Array,silk:Uint8Array,copper:Uint8Array,mask:Uint8Array):PcbBoard {
  if([boardMask,silk,copper,mask].some(plane=>plane.length!==COUNT))throw new Error('板面图层尺寸不匹配');
  const materials=new Uint8Array(COUNT);
  for(let i=0;i<COUNT;i++) {
    if(!boardMask[i]){silk[i]=copper[i]=mask[i]=0;continue;}
    materials[i]=silk[i]?PcbMaterial.Silk:copper[i]?(mask[i]?PcbMaterial.Gold:PcbMaterial.CoveredCopper):mask[i]?PcbMaterial.Substrate:PcbMaterial.Mask;
  }
  return {side,width:WIDTH,height:HEIGHT,boardMask,materials,silk,copper,mask};
}
function fillMissingSide(boards:Partial<Record<PcbSide,PcbBoard>>) {
  const source=boards.front||boards.back;if(!source)throw new Error('压缩包内没有可恢复的板面');
  for(const side of sides)if(!boards[side]) {
    const mask=new Uint8Array(COUNT);
    for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++)mask[y*WIDTH+x]=source.boardMask[y*WIDTH+WIDTH-1-x];
    boards[side]=restorePcbBoard(side,mask,new Uint8Array(COUNT),new Uint8Array(COUNT),new Uint8Array(COUNT));
  }
  return boards as Record<PcbSide,PcbBoard>;
}
export async function decodePcbPng(bytes:Uint8Array):Promise<RasterPixels> {
  const size=pngSize(bytes);
  const bitmap=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'}));
  try {
    if(bitmap.width!==size.width||bitmap.height!==size.height)throw new Error('PNG 尺寸无效');
    const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('无法读取板面图层');
    ctx.drawImage(bitmap,0,0);return ctx.getImageData(0,0,size.width,size.height);
  }finally{bitmap.close();}
}
function binaryPlane(pixels:RasterPixels) {
  if(pixels.width!==WIDTH||pixels.height!==HEIGHT||pixels.data.length!==COUNT*4)throw new Error('当前仅支持 590 × 1180 像素的已保存板面');
  const result=new Uint8Array(COUNT);
  for(let i=0;i<COUNT;i++){const p=i*4;result[i]=pixels.data[p+3]>=128&&(pixels.data[p]+pixels.data[p+1]+pixels.data[p+2])/3<128?1:0;}
  return result;
}

export async function readPcbArchive(data:ArrayBuffer|Uint8Array,filename='PCB_Card.zip',decode=decodePcbPng):Promise<ImportedPcbProject> {
  if(data.byteLength>MAX_ZIP)throw new Error('ZIP 文件超过 100 MB');
  let zip:JSZip;
  try{zip=await JSZip.loadAsync(data);}catch{throw new Error('无法读取 ZIP，请选择本工具导出的板面压缩包');}
  const entries=Object.values(zip.files);
  if(entries.length>512)throw new Error('压缩包包含过多文件');
  if(entries.some(file=>!safePath((file.unsafeOriginalName||file.name).replace(/\/$/,''))))throw new Error('压缩包包含无效路径');
  const projectFiles=entries.filter(file=>!file.dir&&/(^|\/)工程\.json$/.test(file.name));
  const metadataFiles=projectFiles.length?projectFiles:entries.filter(file=>!file.dir&&/(^|\/)处理参数\.json$/.test(file.name));
  if(metadataFiles.length!==1)throw new Error(metadataFiles.length?'压缩包包含多个工程，请每次导入一张板':'未找到工程数据或处理参数.json');
  const metadataFile=metadataFiles[0],root=metadataFile.name.slice(0,metadataFile.name.lastIndexOf('/')+1),read=archiveReader(zip,root);
  let metadata:Record<string,unknown>;
  try{metadata=object(JSON.parse(new TextDecoder().decode(await read(metadataFile.name.slice(root.length),2*1024*1024))));}
  catch(error){throw new Error(`无法读取板面参数：${error instanceof Error?error.message:'JSON 无效'}`);}
  const resolution=object(metadata.resolution);
  if(resolution.width!==WIDTH||resolution.height!==HEIGHT)throw new Error('当前仅支持 590 × 1180 像素的已保存板面');
  const name=text(metadata.name,root.replace(/\/$/,'').split('/').pop()||filename.replace(/^PCB_|_(gray|color)\.zip$|\.zip$/gi,''));
  const layout=normalizeLayout(metadata.layout),info=normalizeInfo(metadata.info,name,layout);
  const settings=normalizePcbSettings(metadata.settings),modelSize=normalizePcbModelSize(metadata.modelSize);
  const inputs={info,e1Opts:layout,frontPhotoUrl:'',cutoutPhotoUrl:'',customIconUrl:''};
  if(projectFiles.length) {
    if(metadata.format!=='PCB-PassCard-Generator'||metadata.version!==1)throw new Error('不支持此工程格式或版本');
    if(metadata.kind==='template') {
      const media=object(metadata.media),urls:Partial<Record<MediaKey,string>>={};
      for(const key of mediaKeys)if(media[key]!==undefined) {
        if(typeof media[key]!=='string')throw new Error('工程素材路径无效');
        const bytes=await read(media[key] as string);urls[key]=dataUrl(bytes,imageMime(bytes));
      }
      return {kind:'template',name,settings,modelSize,inputs:{...inputs,frontPhotoUrl:urls.frontPhotoUrl||'',cutoutPhotoUrl:urls.cutoutPhotoUrl||'',customIconUrl:urls.customIconUrl||''},rawFrontPhotoUrl:urls.rawFrontPhotoUrl||urls.frontPhotoUrl||'',rawCutoutPhotoUrl:urls.rawCutoutPhotoUrl||urls.cutoutPhotoUrl||'',availableSides:[...sides],notice:'工程已恢复，可继续编辑素材、文字和分层参数。'};
    }
    if(metadata.kind!=='board')throw new Error('工程类型无效');
    const paths=object(metadata.boards),boards:Partial<Record<PcbSide,PcbBoard>>={};
    for(const side of sides)if(typeof paths[side]==='string') {
      const bytes=await read(paths[side] as string,COUNT*4);
      if(bytes.length!==COUNT*4||bytes.some(value=>value>1))throw new Error('工程中的制造图层数据无效');
      boards[side]=restorePcbBoard(side,bytes.slice(0,COUNT),bytes.slice(COUNT,COUNT*2),bytes.slice(COUNT*2,COUNT*3),bytes.slice(COUNT*3));
    }
    const availableSides=sides.filter(side=>!!boards[side]);
    return {kind:'board',name,settings,modelSize,inputs:{...inputs,savedBoards:fillMissingSide(boards)},availableSides,notice:PCB_BOARD_IMPORT_NOTICE};
  }
  const boards:Partial<Record<PcbSide,PcbBoard>>={};
  for(const side of sides) {
    const face=side==='front'?'正面':'背面',prefix=side==='front'?'F':'B';
    const names=[`${face}/板形蒙版.png`,`${face}/${prefix}.SilkS.png`,`${face}/${prefix}.Cu.png`,`${face}/${prefix}.Mask.png`];
    if(!names.some(path=>zip.file(root+path)))continue;
    for(const path of names)if(!zip.file(root+path))throw new Error(`缺少 ${path}，请导出时勾选制造分层和板形蒙版`);
    const planes:Uint8Array[]=[];
    for(const path of names){const bytes=await read(path,8*1024*1024);const size=pngSize(bytes);if(size.width!==WIDTH||size.height!==HEIGHT)throw new Error(`${path} 的图层尺寸不匹配`);planes.push(binaryPlane(await decode(bytes)));}
    boards[side]=restorePcbBoard(side,planes[0],planes[1],planes[2],planes[3]);
  }
  const availableSides=sides.filter(side=>!!boards[side]);
  return {kind:'board',name,settings,modelSize,inputs:{...inputs,savedBoards:fillMissingSide(boards)},availableSides,notice:PCB_BOARD_IMPORT_NOTICE+(availableSides.length===1?' 未导出的一面显示为空白板。':'')};
}
