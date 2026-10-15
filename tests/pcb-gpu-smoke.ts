import {PcbSettings, PCB_DEFAULTS, getPcbViews, patchPcbSettings} from '../src/types/pcb';
import {PcbScene, RasterPixels, composePcbScene} from '../src/utils/pcbProcessing';
import {PcbGpuProcessor} from '../src/utils/pcbGpuProcessing';
import {createPcbRaster} from '../src/utils/pcbRaster';
import {createPcbSurfaceMaps} from '../src/utils/pcb3dTextures';
import {PcbFrame, PcbScenes, PcbSideFrames, PcbTextureView} from '../src/types/pcbWorker';
import {closePcbFrames, getPcbWorkerClient, pcbImageBlob, PcbWorkerClient} from '../src/utils/pcbWorkerClient';
import {buildPcbScenes, PcbInputs} from '../src/utils/pcbRenderer';
import {SupersededTaskError} from '../src/utils/latestTaskQueue';

const button=document.querySelector<HTMLButtonElement>('#run')!;
const output=document.querySelector<HTMLPreElement>('#results')!;
const canvas=document.querySelector<HTMLCanvasElement>('#preview')!;
const check=(condition:unknown,message:string)=>{if(!condition)throw new Error(message);};
function equal(actual:ArrayLike<number>,expected:ArrayLike<number>,label:string) {
  check(actual.length===expected.length,`${label}: size mismatch`);
  let mismatches=0,first=-1;
  for(let i=0;i<actual.length;i++)if(actual[i]!==expected[i]){mismatches++;if(first<0)first=i;}
  check(!mismatches,`${label}: ${mismatches} mismatches; first ${first}: ${actual[first]} vs ${expected[first]}`);
}
function decoded(frame:PcbFrame):Uint8ClampedArray {
  const target=document.createElement('canvas');target.width=frame.width;target.height=frame.height;
  const ctx=target.getContext('2d',{willReadFrequently:true})!;
  if(frame.bitmap)ctx.drawImage(frame.bitmap,0,0);else ctx.putImageData(new ImageData(frame.pixels!,frame.width,frame.height),0,0);
  return ctx.getImageData(0,0,frame.width,frame.height).data;
}
function fixture(width:number,height:number):RasterPixels {
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const p=(y*width+x)*4,tone=(x*31+y*17)%256;
    data[p]=x%3? (x*73+y*37)%256:tone;
    data[p+1]=x%3? (x*19+y*61)%256:tone;
    data[p+2]=x%3? (x*41+y*13)%256:tone;
    data[p+3]=[0,31,32,64,128,254,255][(x+y*3)%7];
  }
  return {width,height,data};
}

button.addEventListener('click',async()=>{
  button.disabled=true;output.textContent='正在验证 GPU…';
  const report:Record<string,unknown>={};let gpu:PcbGpuProcessor|undefined;
  const progress=(message:string)=>{output.textContent=JSON.stringify({...report,progress:message},null,2);};
  try {
    gpu=new PcbGpuProcessor();
    const pixels=fixture(23,19),boardMask=new Uint8Array(29*25).fill(1);
    for(let y=0;y<25;y++)boardMask[y*29+(y%29)]=0;
    const scene:PcbScene={side:'front',width:29,height:25,boardMask,layers:[
      {id:'photo',label:'photo',x:-2,y:2,pixels},
      {id:'logo',label:'logo',x:12,y:7,pixels:fixture(13,17),defaults:{mode:'silk',preserveDetails:true,darkInk:true,detailThreshold:84}},
    ]};
    const cases:PcbSettings[]=[PCB_DEFAULTS,
      ...[0,1,2,3].flatMap(smoothing=>[0,1,2,3,4].map(edgeExpansion=>({...PCB_DEFAULTS,smoothing,edgeExpansion}))),
      ...['silk','gold','copper','mask','fr4'].map(mode=>patchPcbSettings(PCB_DEFAULTS,{mode:mode as 'silk',preserveDetails:true,detailThreshold:80,edgeExpansion:4,smoothing:3},'front:photo')),
      patchPcbSettings(PCB_DEFAULTS,{brightness:-18,contrast:137,invert:true,darkInk:true,smoothing:2,edgeExpansion:3},'front:photo'),
      patchPcbSettings(PCB_DEFAULTS,{enabled:false},'front:logo'),
      ...(['enig','hasl','osp'] as const).flatMap(finish=>[false,true].flatMap(bareEnabled=>['color','gray'].map(bareMethod=>({
        ...PCB_DEFAULTS,processingMode:'color' as const,maskColor:bareEnabled?'#eeece0':'#174d7c',
        color:{...PCB_DEFAULTS.color,finish,bareEnabled,bareMethod:bareMethod as 'color'|'gray',bareSimilarity:73,smoothing:2,edgeExpansion:3},
      })))),
    ];
    let boards=0,maps=0;
    const verify=(source:PcbScene,settings:PcbSettings,label:string)=>{
      const expected=composePcbScene(source,settings),actual=gpu.readBoard(source,settings);
      for(const field of ['materials','silk','copper','mask'] as const)equal(actual[field],expected[field],`${label}/${field}`);
      boards++;
      const views:PcbTextureView[]=[...getPcbViews(settings),'surface','height'];
      const frames=gpu.preview(source,settings,views);
      try {
        check(gpu.stats.readbacks===0,'A live GPU preview read pixels back to the CPU');
        const finish=settings.processingMode==='color'?settings.color.finish:'enig',surface=createPcbSurfaceMaps(expected,finish);
        for(const view of views) {
          const frame=frames[view]!;check(frame.backend==='gpu','Preview silently fell back to CPU');
          const raster=view==='surface'||view==='height'?surface[view]:createPcbRaster(expected,settings,view);
          equal(decoded(frame),raster.data,`${label}/${view}`);maps++;
        }
      } finally {closePcbFrames(frames);}
    };
    for(let i=0;i<cases.length;i++){verify(scene,cases[i],`case ${i}`);if(i%8===0){progress(`小图算法 ${i+1}/${cases.length}`);await new Promise(resolve=>setTimeout(resolve,0));}}
    const dense:PcbScene={side:'front',width:128,height:128,boardMask:new Uint8Array(128*128).fill(1),layers:[{id:'photo',label:'RGB',x:0,y:0,pixels:fixture(128,128)}]};
    for(const smoothing of [0,1,2,3]) {
      verify(dense,{...PCB_DEFAULTS,smoothing,edgeExpansion:4},`dense RGB/${smoothing}`);
      verify(dense,patchPcbSettings(PCB_DEFAULTS,{smoothing,contrast:137,brightness:13,invert:true,darkInk:true},'front:photo'),`dense adjusted RGB/${smoothing}`);
    }
    report.algorithm_cases=boards;report.exact_gpu_maps=maps;
    const inputs:PcbInputs={
      info:{chinese_name:'缪尔赛思',english_name:'Muelsyse',english_name2:'',id:'RL09',profession:'先锋',profession_en:'VANGUARD',barcode_text:'Muelsyse',show_icon:true,faction:'莱茵生命'},
      e1Opts:{enabled:true,faction:'莱茵生命',iconX:0,iconY:0,iconScale:1,gradientEnabled:false,frontColor:'#174d7c',gradColor:'#174d7c'},
      frontPhotoUrl:'',cutoutPhotoUrl:'',customIconUrl:'',
    };
    const scenes=await buildPcbScenes(inputs);
    for(const processingMode of ['gray','color'] as const)for(const side of ['front','back'] as const) {
      progress(`${processingMode}/${side} 原始 590 × 1180 素材`);
      verify(scenes[side],{...PCB_DEFAULTS,processingMode},`actual ${processingMode}/${side}`);
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    const settings={...PCB_DEFAULTS,smoothing:3,edgeExpansion:4};
    closePcbFrames(gpu.preview(scenes.front,settings,['appearance']));
    const resources=gpu.resourceCounts;
    let samples=0;
    for(let i=0;i<12;i++) {
      const next={...settings,silkThreshold:150+i};
      const frames=gpu.preview(scenes.front,next,['appearance','surface','height']);
      try {
        check(frames.appearance!.width===590&&frames.appearance!.height===1180,'Live adjustment lowered resolution');
        check(gpu.stats.uploadedSources===0&&gpu.stats.tonePasses===0&&gpu.stats.smoothingPasses===0,'Threshold changes recomputed or uploaded immutable source data');
        check(JSON.stringify(gpu.resourceCounts)===JSON.stringify(resources),'Continuous changes allocated more GPU resources');
        equal(decoded(frames.appearance!),createPcbRaster(composePcbScene(scenes.front,next),next).data,`live ${i}`);
        samples++;
      }finally{closePcbFrames(frames);}
    }
    report.live_full_resolution_updates=samples;report.stable_resources=resources;
    const client=getPcbWorkerClient();let workerFrames=0;
    const draw=(_side:string,frames:PcbSideFrames)=>{
      try {
        const frame=frames.appearance!;
        check(frame.backend==='gpu'&&frame.width===590&&frame.height===1180,'Worker did not use full-resolution GPU processing');
        const ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,590,1180);ctx.drawImage(frame.bitmap!,0,0);workerFrames++;
      }finally{closePcbFrames(frames);}
    };
    const accepted:number[]=[],requests:Promise<unknown>[]=[];
    for(let i=0;i<25;i++)requests.push(client.preview({scenes,settings:{...settings,silkThreshold:150+i},side:'front',quality:'full',include3d:true,onSide:(side,frames)=>{accepted.push(i);draw(side,frames);}}).catch(error=>{if(!(error instanceof SupersededTaskError))throw error;return 'superseded';}));
    const results=await Promise.all(requests);
    check(results.slice(0,24).every(result=>result==='superseded')&&accepted.length===2&&accepted.every(i=>i===24),'An obsolete full-resolution GPU request reached the screen');
    report.worker_gpu_faces=workerFrames;report.coalesced_requests=25;
    const lastSettings={...settings,silkThreshold:174};
    const withoutLogo:PcbScenes={...scenes,front:{...scenes.front,layers:scenes.front.layers.filter(layer=>layer.id!=='faction')}};
    for(const sources of [withoutLogo,scenes]) {
      await client.preview({scenes:sources,settings:lastSettings,side:'front',quality:'full',onSide:(side,frames)=>{
        try{equal(decoded(frames.appearance!),createPcbRaster(composePcbScene(sources[side],lastSettings),lastSettings).data,`remove/restore ${side}`);}
        finally{closePcbFrames(frames);}
      }});
    }
    report.removed_source_restored=true;
    const exported=await client.export({scenes,settings:lastSettings,side:'front',quality:'full',plan:{sides:['front','back'],views:['appearance','silk','copper','mask'],outline:true}});
    for(const file of exported) {
      const bitmap=await createImageBitmap(await pcbImageBlob(file));
      try {equal(decoded({width:bitmap.width,height:bitmap.height,bitmap}),createPcbRaster(composePcbScene(scenes[file.side],lastSettings),lastSettings,file.view,file.view!=='appearance').data,`export ${file.side}/${file.view}`);}
      finally{bitmap.close();}
    }
    report.exact_exports=exported.length;
    progress('比较连续高清调整耗时，并验证无 WebGL2 时的回退');
    const fallback=new PcbWorkerClient(new Worker(new URL('./pcb-cpu-fallback.worker.ts',import.meta.url),{type:'module'}));
    try {
      const benchmark:PcbScenes={front:{...scenes.front,layers:[{id:'photo',label:'full photo',x:0,y:0,pixels:fixture(590,1180)},...scenes.front.layers]},back:scenes.back};
      const times:{gpu:number[];cpu:number[]}={gpu:[],cpu:[]};
      let fallbackFaces=0;
      for(const [backend,processor] of [['gpu',client],['cpu',fallback]] as const) {
        for(let i=0;i<6;i++) {
          const next={...settings,silkThreshold:160+i},start=performance.now();
          await processor.preview({scenes:benchmark,settings:next,side:'front',quality:'full',include3d:true,onSide:(side,frames)=>{
            try {
              const frame=frames.appearance!;
              check(frame.backend===backend&&frame.width===590&&frame.height===1180,`${backend} changed live preview resolution`);
              // Reading the test canvas forces GPU work to finish before the
              // timer stops. This readback is test-only; the app transfers bitmaps.
              const actual=decoded(frame);
              if(i===0)equal(actual,createPcbRaster(composePcbScene(benchmark[side],next),next).data,`${backend} full photo`);
              if(backend==='cpu')fallbackFaces++;
            }finally{closePcbFrames(frames);}
          }});
          if(i>0)times[backend].push(Math.round((performance.now()-start)*10)/10);
        }
      }
      report.full_update_with_test_readback_ms=times;report.full_resolution_fallback_faces=fallbackFaces;
    }finally{fallback.dispose();}
    const lostWorkerUrl=new URL('./pcb-cpu-fallback.worker.ts',import.meta.url);lostWorkerUrl.searchParams.set('context-loss','1');
    const recovering=new PcbWorkerClient(new Worker(lostWorkerUrl,{type:'module'}));
    try {
      let recovered=0;
      for(const backend of ['gpu','cpu'] as const)await recovering.preview({scenes,settings:lastSettings,side:'front',quality:'full',include3d:true,onSide:(side,frames)=>{
        try {
          const frame=frames.appearance!;
          check(frame.backend===backend&&frame.width===590&&frame.height===1180,'Worker did not recover a lost context at full precision');
          equal(decoded(frame),createPcbRaster(composePcbScene(scenes[side],lastSettings),lastSettings).data,`context recovery/${side}`);
          if(backend==='cpu')recovered++;
        }finally{closePcbFrames(frames);}
      }});
      report.context_loss_recovered_faces=recovered;
    }finally{recovering.dispose();}
    const lostCanvas=new OffscreenCanvas(8,8),lost=new PcbGpuProcessor(lostCanvas);
    try {
      lostCanvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext();
      let rejected=false;try{lost.preview(scene,PCB_DEFAULTS,['appearance']);}catch{rejected=true;}
      check(rejected,'Lost context produced a blank GPU frame instead of failing over');
      report.context_loss_detected=true;
    }finally{lost.dispose();}
    gpu.dispose();check(Object.values(gpu.resourceCounts).every(value=>value===0),'GPU resources were not released');
    report.result='PASS';report.algorithm_cases=boards;report.exact_gpu_maps=maps;
    output.textContent=JSON.stringify(report,null,2);
  }catch(error){output.textContent=JSON.stringify({...report,result:'FAIL',error:String(error)},null,2);}
  finally{gpu?.dispose();button.disabled=false;}
});
