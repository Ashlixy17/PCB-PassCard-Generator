import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {PCB_DEFAULTS,normalizePcbSettings,PcbLayerSettings} from '../types/pcb';
import {PcbMaterial,PcbScene,RasterPixels,composePcbScene,getPcbLayerSettings,processPcbPixels} from './pcbProcessing';
import {PcbProcessingCache} from './pcbProcessingCache';
import {createPcbRaster,pcbPalette} from './pcbRaster';
import {LatestTaskQueue,SupersededTaskError} from './latestTaskQueue';

const options: PcbLayerSettings={...PCB_DEFAULTS,enabled:true,mode:'auto',invert:false,darkInk:false,preserveDetails:false,detailThreshold:24,brightness:0,contrast:100};
const pixels=(tones:number[],alpha=255):RasterPixels=>({width:tones.length,height:1,data:Uint8ClampedArray.from(tones.flatMap(v=>[v,v,v,alpha]))});

test('independent logo conversion keeps original structure and transparency',()=>{
  const source=pixels([1,60,1]);source.data[11]=0;
  const saved=source.data.slice();
  const output=processPcbPixels(source,{...options,mode:'silk',darkInk:true,preserveDetails:true,detailThreshold:24,edgeExpansion:1});
  assert.equal(output[0],PcbMaterial.Silk);
  assert.equal(output[1],PcbMaterial.Transparent,'internal gray detail must not become solid ink when thickening');
  assert.deepEqual(source.data,saved,'original RGBA must remain available for repeated adjustment');
});

test('actual Rhodes Island source keeps a substantial internal detail mask',async()=>{
  const source=readFileSync(new URL('../data/imageAssets.ts',import.meta.url),'utf8');
  const match=source.match(/'中间__阵营图标__罗德岛\.png':\s*'([^']+)'/);
  assert.ok(match);
  const image=await loadImage(match[1]),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');
  ctx.drawImage(image,0,0);
  const rgba=ctx.getImageData(0,0,image.width,image.height);
  const output=processPcbPixels(rgba,{...options,mode:'silk',darkInk:true,preserveDetails:true});
  let retained=0,body=0;
  for(let i=0;i<output.length;i++) {
    if(rgba.data[i*4+3]<32){assert.equal(output[i],PcbMaterial.Transparent);continue;}
    if(output[i]===PcbMaterial.Transparent)retained++;else body++;
  }
  assert.ok(retained>2000,'tower interior must retain original tonal details');
  assert.ok(body>20000,'tower body must remain recognizable');
});

test('global thresholds produce distinct silk, gold and mask regions',()=>{
  assert.deepEqual([...processPcbPixels(pixels([80,140,220]),options)],[PcbMaterial.Mask,PcbMaterial.Gold,PcbMaterial.Silk]);
  assert.deepEqual([...processPcbPixels(pixels([80,140,220]),{...options,maskThreshold:180})],[PcbMaterial.Mask,PcbMaterial.Mask,PcbMaterial.Silk]);
  assert.deepEqual([...processPcbPixels(pixels([80,140,220]),{...options,silkThreshold:240})],[PcbMaterial.Mask,PcbMaterial.Gold,PcbMaterial.Gold]);
});

test('upper opaque objects cover lower artwork and board holes clip every layer',()=>{
  const scene:PcbScene={side:'front',width:4,height:1,boardMask:new Uint8Array([1,1,1,0]),layers:[
    {id:'photo',label:'photo',x:0,y:0,pixels:pixels([255,255,255,255]),defaults:{mode:'gold'}},
    {id:'baseboard',label:'panel',x:1,y:0,pixels:pixels([0]),defaults:{mode:'mask'}},
    {id:'nameText',label:'text',x:2,y:0,pixels:pixels([255]),defaults:{mode:'silk'}},
  ]};
  const board=composePcbScene(scene,PCB_DEFAULTS);
  assert.deepEqual([...board.materials],[PcbMaterial.Gold,PcbMaterial.Mask,PcbMaterial.Silk,PcbMaterial.Mask]);
  assert.deepEqual([...board.mask],[1,0,0,0]);
  assert.deepEqual([...board.copper],[1,0,1,0],'silk may retain covered copper underneath');
  assert.deepEqual([...board.silk],[0,0,1,0]);
});

test('exposed substrate is an opening without copper and ENIG requires both',()=>{
  const scene:PcbScene={side:'back',width:2,height:1,boardMask:new Uint8Array([1,1]),layers:[
    {id:'substrate',label:'substrate',x:0,y:0,pixels:pixels([255]),defaults:{mode:'fr4'}},
    {id:'metal',label:'metal',x:1,y:0,pixels:pixels([255]),defaults:{mode:'gold'}},
  ]};
  const board=composePcbScene(scene,PCB_DEFAULTS);
  assert.deepEqual([...board.mask],[1,1]);assert.deepEqual([...board.copper],[0,1]);
});

test('smoothing weights only visible pixels and cannot create opaque background',()=>{
  const source=pixels([255,0]);source.data[3]=0;
  assert.deepEqual([...processPcbPixels(source,{...options,smoothing:1})],[PcbMaterial.Transparent,PcbMaterial.Mask]);
});

test('local parameters are isolated by object and side',()=>{
  const settings={...PCB_DEFAULTS,overrides:{'front:faction':{detailThreshold:8,brightness:30}}};
  const layer={id:'faction',label:'logo',x:0,y:0,pixels:pixels([0]),defaults:{mode:'silk' as const,darkInk:true,preserveDetails:true}};
  assert.equal(getPcbLayerSettings(settings,'front',layer).detailThreshold,8);
  assert.equal(getPcbLayerSettings(settings,'back',layer).detailThreshold,24);
  assert.equal(getPcbLayerSettings(settings,'front',{...layer,id:'gameLogo'}).brightness,0);
});

test('saved configuration is bounded and invalid colors do not break rendering',()=>{
  const settings=normalizePcbSettings({maskColor:'not-a-color',silkThreshold:500,maskThreshold:NaN,overrides:{'front:faction':{detailThreshold:-5},'invalid:key':{mode:'gold'}}});
  assert.equal(settings.maskColor,PCB_DEFAULTS.maskColor);assert.equal(settings.silkThreshold,255);
  assert.equal(settings.maskThreshold,PCB_DEFAULTS.maskThreshold);assert.equal(settings.overrides['front:faction'].detailThreshold,0);
  assert.equal(settings.overrides['invalid:key'],undefined);
});

const cacheScene=():PcbScene=>({side:'front',width:6,height:1,boardMask:new Uint8Array([1,1,1,1,1,0]),layers:[
  {id:'photo',label:'photo',x:0,y:0,pixels:pixels([70,140,210,250,160,255]),photo:true},
  {id:'faction',label:'logo',x:2,y:0,pixels:pixels([0,60,0]),defaults:{mode:'silk',darkInk:true,preserveDetails:true}},
  {id:'nameText',label:'name',x:0,y:0,pixels:pixels([255]),defaults:{mode:'silk'}},
]});

test('cached full-resolution composition stays identical to the original renderer',()=>{
  const scene=cacheScene(),cache=new PcbProcessingCache();
  for(const settings of [PCB_DEFAULTS,{...PCB_DEFAULTS,edgeExpansion:2,smoothing:1},{...PCB_DEFAULTS,overrides:{'front:faction':{mode:'gold' as const,detailThreshold:50}}}]) {
    assert.deepEqual(cache.compose(scene,settings),composePcbScene(scene,settings));
  }
});

test('only the changed logo is processed and mask color reuses the same board',()=>{
  const scene=cacheScene(),cache=new PcbProcessingCache();
  cache.compose(scene,PCB_DEFAULTS);
  const settings={...PCB_DEFAULTS,overrides:{'front:faction':{detailThreshold:70}}};
  const board=cache.compose(scene,settings);
  assert.equal(cache.stats.processedLayers,1);
  assert.equal(cache.stats.reusedLayers,2);
  assert.deepEqual(board,composePcbScene(scene,settings));
  assert.equal(cache.compose(scene,{...settings,maskColor:'#eeece0'}),board);
  assert.equal(cache.stats.processedLayers,0);
  assert.equal(cache.stats.composed,false);
  cache.compose(scene,{...settings,silkThreshold:240});
  assert.equal(cache.stats.processedLayers,1,'a global automatic threshold must not reprocess forced text and logo');
});

test('moving a cached object restores uncovered artwork and replacing pixels invalidates it',()=>{
  const scene=cacheScene(),cache=new PcbProcessingCache();
  cache.compose(scene,PCB_DEFAULTS);
  const moved={...scene,layers:scene.layers.map(layer=>layer.id==='faction'?{...layer,x:1}:layer)};
  assert.deepEqual(cache.compose(moved,PCB_DEFAULTS),composePcbScene(moved,PCB_DEFAULTS));
  assert.equal(cache.stats.processedLayers,0);
  assert.equal(cache.stats.composed,true);
  const changed={...moved,layers:moved.layers.map(layer=>layer.id==='faction'?{...layer,pixels:pixels([50,0,50])}:layer)};
  assert.deepEqual(cache.compose(changed,PCB_DEFAULTS),composePcbScene(changed,PCB_DEFAULTS));
  assert.equal(cache.stats.processedLayers,1);
});

test('a draft never replaces the full-resolution material maps used for export',()=>{
  const scene:PcbScene={side:'front',width:590,height:1180,boardMask:new Uint8Array(590*1180).fill(1),layers:cacheScene().layers};
  const cache=new PcbProcessingCache(),full=cache.compose(scene,PCB_DEFAULTS);
  const original=scene.layers[1].pixels.data.slice();
  const draft=cache.compose(scene,PCB_DEFAULTS,'draft');
  assert.equal(draft.width,236);assert.equal(draft.height,472);
  assert.equal(cache.compose(scene,PCB_DEFAULTS,'full'),full);
  assert.deepEqual(full,composePcbScene(scene,PCB_DEFAULTS));
  assert.deepEqual(scene.layers[1].pixels.data,original);
});

test('raster previews and manufacturing PNGs agree about colors, holes and openings',()=>{
  const board=composePcbScene(cacheScene(),PCB_DEFAULTS);
  const preview=createPcbRaster(board,PCB_DEFAULTS);
  for(let i=0;i<board.materials.length;i++) {
    if(!board.boardMask[i]) {assert.equal(preview.data[i*4+3],0);continue;}
    assert.deepEqual([...preview.data.slice(i*4,i*4+4)],[...pcbPalette(PCB_DEFAULTS.maskColor)[board.materials[i]],255]);
  }
  const white=createPcbRaster(board,{maskColor:'#eeece0'});
  assert.deepEqual([...white.data.slice(0,4)],[20,23,26,255]);
  for(const view of ['silk','copper','mask'] as const) {
    const raster=createPcbRaster(board,PCB_DEFAULTS,view,true);
    for(let i=0;i<board.materials.length;i++)assert.deepEqual([...raster.data.slice(i*4,i*4+4)],[0,0,0,board.boardMask[i]&&board[view][i]?255:0]);
  }
});

const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('rapid preview requests run only the active job and the newest pending job',async()=>{
  const started:number[]=[],finish=new Map<number,(value:number)=>void>();
  const queue=new LatestTaskQueue<number,number>(task=>{started.push(task.payload);return new Promise(resolve=>finish.set(task.payload,resolve));});
  const results:Promise<number|Error>[]=[queue.preview(1).catch(error=>error)];
  await tick();
  for(let value=2;value<=100;value++)results.push(queue.preview(value).catch(error=>error));
  assert.equal(queue.isCurrent(1),false,'superseded results must not be published');
  finish.get(1)!(1);await tick();
  assert.deepEqual(started,[1,100]);
  finish.get(100)!(100);
  const completed=await Promise.all(results);
  assert.equal(completed[99],100);
  assert.ok(completed.slice(0,99).every(value=>value instanceof SupersededTaskError));
});

test('explicit exports remain ordered while preview updates are coalesced',async()=>{
  const started:string[]=[],finish=new Map<string,(value:string)=>void>();
  const queue=new LatestTaskQueue<string,string>(task=>{started.push(task.payload);return new Promise(resolve=>finish.set(task.payload,resolve));});
  const first=queue.preview('old').catch(error=>error);await tick();
  const export1=queue.export('file1'),export2=queue.export('file2');
  const replaced=queue.preview('replaced').catch(error=>error),latest=queue.preview('latest');
  for(const value of ['old','file1','file2','latest']) {finish.get(value)!(value);await tick();}
  assert.deepEqual(started,['old','file1','file2','latest']);
  assert.equal(await export1,'file1');assert.equal(await export2,'file2');assert.equal(await latest,'latest');
  assert.ok(await first instanceof SupersededTaskError);assert.ok(await replaced instanceof SupersededTaskError);
});

test('a failed worker rejects running and pending tasks without leaving a stuck queue',async()=>{
  let finish:(value:string)=>void;
  const queue=new LatestTaskQueue<string,string>(()=>new Promise(resolve=>{finish=resolve;}));
  const first=queue.preview('first').catch(error=>error);await tick();
  const file=queue.export('file').catch(error=>error),latest=queue.preview('latest').catch(error=>error);
  const failure=new Error('worker failed');queue.dispose(failure);
  assert.ok(await first instanceof SupersededTaskError);
  assert.equal(await file,failure);assert.equal(await latest,failure);
  finish!('unused');await tick();
  assert.ok(await queue.preview('closed').catch(error=>error) instanceof Error);
});
