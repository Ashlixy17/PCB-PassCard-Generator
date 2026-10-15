import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {PCB_DEFAULTS,normalizePcbSettings} from '../types/pcb';
import {PcbProjectContext} from '../types/pcbProject';
import {PcbBoard,RasterPixels,composePcbScene} from './pcbProcessing';
import {createPcbRaster} from './pcbRaster';
import {appendPcbProject,readPcbArchive,restorePcbBoard,normalizePcbModelSize} from './pcbProject';
import {PcbProcessingCache} from './pcbProcessingCache';

const count=590*1180;
const decode=async(bytes:Uint8Array):Promise<RasterPixels>=>{
  const image=await loadImage(Buffer.from(bytes)),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');
  ctx.drawImage(image,0,0);return ctx.getImageData(0,0,image.width,image.height);
};
const png=(pixels:RasterPixels)=>{
  const canvas=createCanvas(pixels.width,pixels.height),ctx=canvas.getContext('2d');
  const image=ctx.createImageData(pixels.width,pixels.height);image.data.set(pixels.data);ctx.putImageData(image,0,0);
  return canvas.toBuffer('image/png');
};
function board(side:'front'|'back'):PcbBoard {
  const shape=new Uint8Array(count).fill(1),silk=new Uint8Array(count),copper=new Uint8Array(count),mask=new Uint8Array(count);
  for(let i=0;i<count;i++) {silk[i]=i%7===1?1:0;copper[i]=i%7===2||i%7===3||i%7===1?1:0;mask[i]=i%7===2||i%7===4?1:0;}
  for(let y=20;y<40;y++)for(let x=15;x<32;x++)shape[y*590+x]=0;
  shape[0]=0;
  return restorePcbBoard(side,shape,silk,copper,mask);
}
const context=():PcbProjectContext=>({
  inputs:{info:{chinese_name:'缪尔赛思',english_name:'Muelsyse',english_name2:'',id:'RL09',profession:'先锋',profession_en:'VANGUARD',barcode_text:'Muelsyse',show_icon:true,faction:'莱茵生命'},e1Opts:{enabled:true,faction:'莱茵生命',iconX:25,iconY:-12,iconScale:1.25,gradientEnabled:false,frontColor:'#0d1b2a',gradColor:'#1e3a8a'},frontPhotoUrl:'',cutoutPhotoUrl:'',customIconUrl:''},
  settings:normalizePcbSettings({...PCB_DEFAULTS,processingMode:'color',maskColor:'#151a20',color:{...PCB_DEFAULTS.color,overrides:{'front:faction':{enabled:false,detailThreshold:33}}}}),modelSize:{width:63,thickness:1.2},
});
async function legacyZip(options:{back?:boolean;missing?:string;wrongSize?:boolean}={}) {
  const zip=new JSZip(),folder=zip.folder('Muelsyse_缪尔赛思')!,state=context();
  folder.file('处理参数.json',JSON.stringify({resolution:{width:590,height:1180},settings:state.settings,layout:state.inputs.e1Opts}));
  for(const side of (options.back===false?['front']:['front','back']) as ('front'|'back')[]) {
    const target=folder.folder(side==='front'?'正面':'背面')!,prefix=side==='front'?'F':'B',source=board(side);
    for(const view of ['silk','copper','mask','outline','appearance'] as const) {
      const name={silk:`${prefix}.SilkS.png`,copper:`${prefix}.Cu.png`,mask:`${prefix}.Mask.png`,outline:'板形蒙版.png',appearance:'PCB效果.png'}[view];
      if(name===options.missing)continue;
      const raster=options.wrongSize?{width:1,height:1,data:new Uint8ClampedArray([0,0,0,255])}:createPcbRaster(source,state.settings,view,view!=='appearance');
      target.file(name,png(raster));
    }
  }
  return zip.generateAsync({type:'uint8array'});
}

test('legacy ZIP restores physical layers, underlying copper, holes and exact appearance on both faces',async()=>{
  const restored=await readPcbArchive(await legacyZip(),'old.zip',decode),expected=context();
  assert.equal(restored.kind,'board');assert.deepEqual(restored.availableSides,['front','back']);
  assert.equal(restored.settings.maskColor,'#151a20');assert.deepEqual(restored.inputs.e1Opts,expected.inputs.e1Opts);
  for(const side of ['front','back'] as const) {
    const actual=restored.inputs.savedBoards![side],original=board(side);
    for(const field of ['boardMask','silk','copper','mask','materials'] as const)assert.deepEqual(actual[field],original[field],`${side}/${field}`);
    assert.deepEqual(createPcbRaster(actual,restored.settings).data,createPcbRaster(original,expected.settings).data);
    const scene={side,width:590,height:1180,boardMask:actual.boardMask,layers:[],board:actual};
    assert.equal(composePcbScene(scene,{...restored.settings,silkThreshold:255}),actual,'saved manufacturing layers must not be reclassified');
    assert.equal(new PcbProcessingCache().compose(scene,restored.settings),actual);
  }
});

test('single-face import preserves the available face and explicitly creates an empty reverse with mirrored holes',async()=>{
  const restored=await readPcbArchive(await legacyZip({back:false}),'one.zip',decode);
  assert.deepEqual(restored.availableSides,['front']);assert.match(restored.notice,/空白板/);
  const {front,back}=restored.inputs.savedBoards!;
  assert.equal(back.silk.some(Boolean),false);assert.equal(back.copper.some(Boolean),false);
  for(let y=0;y<1180;y++)for(let x=0;x<590;x++)assert.equal(back.boardMask[y*590+x],front.boardMask[y*590+589-x]);
});

test('editable project round-trips image bytes, crop originals, character fields, profiles and physical preview size',async()=>{
  const state=context(),canvas=createCanvas(3,4),ctx=canvas.getContext('2d');
  ctx.fillStyle='#46a8f0';ctx.fillRect(0,0,3,4);
  state.inputs.frontPhotoUrl=canvas.toDataURL('image/png');state.rawFrontPhotoUrl=state.inputs.frontPhotoUrl;
  state.inputs.cutoutPhotoUrl=state.inputs.frontPhotoUrl;state.inputs.customIconUrl=state.inputs.frontPhotoUrl;
  const zip=new JSZip();await appendPcbProject(zip.folder('Muelsyse_缪尔赛思')!,state);
  const mediaFiles=Object.keys(zip.files).filter(path=>path.endsWith('.image'));assert.equal(mediaFiles.length,1,'duplicate source bytes should be stored only once');
  const restored=await readPcbArchive(await zip.generateAsync({type:'uint8array'}),'new.zip',decode);
  assert.equal(restored.kind,'template');assert.equal(restored.inputs.savedBoards,undefined);
  assert.equal(restored.inputs.frontPhotoUrl,state.inputs.frontPhotoUrl);assert.equal(restored.rawFrontPhotoUrl,state.rawFrontPhotoUrl);
  assert.equal(restored.inputs.cutoutPhotoUrl,state.inputs.cutoutPhotoUrl);assert.equal(restored.inputs.customIconUrl,state.inputs.customIconUrl);
  assert.deepEqual(restored.inputs.info,{...state.inputs.info,faction_en:'',back_color:'#0d1b2a',base_color:'#0d1b2a'});
  assert.deepEqual(restored.settings,state.settings);assert.deepEqual(restored.modelSize,state.modelSize);
});

test('a restored old board can be saved again without losing physical layers or acquiring invented editable artwork',async()=>{
  const state=context();state.inputs.savedBoards={front:board('front'),back:board('back')};
  const zip=new JSZip();await appendPcbProject(zip.folder('snapshot')!,state);
  const restored=await readPcbArchive(await zip.generateAsync({type:'uint8array'}),'snapshot.zip',decode);
  assert.equal(restored.kind,'board');assert.equal(restored.inputs.frontPhotoUrl,'');
  assert.deepEqual(restored.inputs.savedBoards,state.inputs.savedBoards);assert.deepEqual(restored.modelSize,state.modelSize);
  const recolored={...restored.settings,maskColor:'#174d7c'};
  assert.notDeepEqual(createPcbRaster(restored.inputs.savedBoards!.front,recolored).data,createPcbRaster(restored.inputs.savedBoards!.front,restored.settings).data);
  assert.deepEqual(restored.inputs.savedBoards!.front.copper,state.inputs.savedBoards.front.copper);
});

test('incomplete, malformed and differently sized exports fail clearly before replacing the current board',async()=>{
  await assert.rejects(()=>readPcbArchive(new Uint8Array([1,2,3]),'bad.zip',decode),/无法读取 ZIP/);
  await assert.rejects(()=>readPcbArchive(legacyZip as never,'bad.zip',decode),/无法读取 ZIP/);
  await assert.rejects(()=>readPcbArchive(legacyZip as never,'bad.zip',decode),/无法读取 ZIP/);
  await assert.rejects(async()=>readPcbArchive(await legacyZip({missing:'F.Mask.png'}),'missing.zip',decode),/缺少 正面\/F.Mask.png/);
  await assert.rejects(async()=>readPcbArchive(await legacyZip({wrongSize:true}),'small.zip',decode),/尺寸不匹配/);
});

test('archive references stay local and incompatible project versions are rejected',async()=>{
  const base={format:'PCB-PassCard-Generator',version:1,kind:'template',resolution:{width:590,height:1180},media:{frontPhotoUrl:'https://example.invalid/image.png'}};
  const external=new JSZip().file('工程.json',JSON.stringify(base));
  await assert.rejects(async()=>readPcbArchive(await external.generateAsync({type:'uint8array'}),'external.zip',decode),/路径无效/);
  const traversal=new JSZip().file('工程.json',JSON.stringify({...base,media:{frontPhotoUrl:'../outside.png'}}));
  await assert.rejects(async()=>readPcbArchive(await traversal.generateAsync({type:'uint8array'}),'traversal.zip',decode),/路径无效/);
  const future=new JSZip().file('工程.json',JSON.stringify({...base,version:99,media:{}}));
  await assert.rejects(async()=>readPcbArchive(await future.generateAsync({type:'uint8array'}),'future.zip',decode),/版本/);
  assert.deepEqual(normalizePcbModelSize({width:100000,thickness:NaN}),{width:120,thickness:1.6});
});
