import {PCB_DEFAULTS, PcbSide, getPcbViews} from '../src/types/pcb';
import {PcbScenes, PcbSideFrames} from '../src/types/pcbWorker';
import {composePcbScene} from '../src/utils/pcbProcessing';
import {createPcbRaster} from '../src/utils/pcbRaster';
import {createPcbSurfaceMaps} from '../src/utils/pcb3dTextures';
import {getPcbWorkerClient, closePcbFrames, pcbImageBlob} from '../src/utils/pcbWorkerClient';
import {SupersededTaskError} from '../src/utils/latestTaskQueue';
import {buildPcbScenes,PcbInputs} from '../src/utils/pcbRenderer';
import {exportPcbImages} from '../src/utils/pcbWorkerClient';

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
    data[i] = x<195?230:tone; data[i + 1] = x<195?190:tone; data[i + 2] = x<195?70:x>390?220:tone; data[i + 3] = 255;
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
    report.exact_png_exports_verified = images.length;
    let surfaceMaps=0;
    const verifyMaps=(face:PcbSide,frames:PcbSideFrames,board:ReturnType<typeof composePcbScene>,finish:'enig'|'hasl'|'osp')=>{
      const expected=createPcbSurfaceMaps(board,finish);
      for(const kind of ['surface','height'] as const) {
        const frame=frames[kind];check(!!frame,`Missing ${kind} map`);
        const decoded=document.createElement('canvas');decoded.width=frame!.width;decoded.height=frame!.height;
        const ctx=decoded.getContext('2d')!;
        if(frame!.bitmap)ctx.drawImage(frame!.bitmap,0,0);else ctx.putImageData(new ImageData(frame!.pixels!,frame!.width,frame!.height),0,0);
        const actual=ctx.getImageData(0,0,decoded.width,decoded.height).data;
        check(actual.every((value,i)=>value===expected[kind].data[i]),`${face}/${finish}/${kind} altered linear material data`);
        surfaceMaps++;
      }
    };
    await client.preview({scenes,settings,side:'front',quality:'full',include3d:true,onSide:(face,frames)=>{
      verifyMaps(face,frames,original[face],'enig');draw(face,frames);
    }});
    let colorExports=0;
    for(const finish of ['enig','hasl','osp'] as const) {
      const colorSettings={...PCB_DEFAULTS,processingMode:'color' as const,color:{...PCB_DEFAULTS.color,finish,metalHue:finish==='osp'?15:45}};
      const expectedBoards={front:composePcbScene(scenes.front,colorSettings),back:composePcbScene(scenes.back,colorSettings)};
      await client.preview({scenes,settings:colorSettings,side:'front',quality:'full',include3d:true,onSide:(face,frames)=>{
        check(!!frames.metal && !!frames.coveredCopper && !!frames.substrate,'Color preview omitted process-specific layers');
        verifyMaps(face,frames,expectedBoards[face],finish);draw(face,frames);
      }});
      const files=await client.export({scenes,settings:colorSettings,side:'front',quality:'full',plan:{sides:['front','back'],views:getPcbViews(colorSettings),outline:true}});
      check(files.length===16,'Color export omitted material or manufacturing layers');
      for(const file of files) {
        const bitmap=await createImageBitmap(await pcbImageBlob(file));
        check(bitmap.width===590 && bitmap.height===1180,'Color export used draft dimensions');
        const decoded=document.createElement('canvas');decoded.width=590;decoded.height=1180;
        const ctx=decoded.getContext('2d')!;ctx.drawImage(bitmap,0,0);bitmap.close();
        const actual=ctx.getImageData(0,0,590,1180).data;
        const expected=createPcbRaster(expectedBoards[file.side],colorSettings,file.view,file.view!=='appearance').data;
        check(actual.every((value,i)=>value===expected[i]),`${finish}/${file.side}/${file.view} changed worker export pixels`);
        colorExports++;
      }
    }
    await client.preview({scenes,settings,side:'back',quality:'full',onSide:(face,frames)=>{
      check(!frames.metal && Object.keys(frames).length===4,'Grayscale reused color-specific layers after switching back');draw(face,frames);
    }});
    report.exact_color_png_exports_verified=colorExports;
    report.exact_3d_material_maps_verified=surfaceMaps;
    const inputs:PcbInputs={
      info:{chinese_name:'测试',english_name:'Test',english_name2:'',id:'R001',profession:'近卫',profession_en:'GUARD',barcode_text:'Test',show_icon:true,faction:'罗德岛',elite_phase:'E1'},
      e1Opts:{enabled:true,faction:'罗德岛',iconX:0,iconY:0,iconScale:1,gradientEnabled:false,frontColor:'#174d7c',gradColor:'#174d7c'},
      frontPhotoUrl:'',cutoutPhotoUrl:'',customIconUrl:'',
    };
    const independent=await buildPcbScenes(inputs);
    check(independent.back.layers.length===1 && independent.back.layers[0].id==='faction','Back inherited front artwork');
    const backLogo=independent.back.layers[0];
    check(Math.abs(backLogo.x+backLogo.pixels.width/2-295)<3 && Math.abs(backLogo.y+backLogo.pixels.height/2-590)<3,'Back logo is not centered');
    const changed=await buildPcbScenes({...inputs,frontPhotoUrl:canvas.toDataURL(),e1Opts:{...inputs.e1Opts,iconX:100,iconY:-80,iconScale:1.7},info:{...inputs.info,elite_phase:'E2',show_icon:false}});
    check(changed.front.layers.some(layer=>layer.id==='photo'),'Front photo fixture was not loaded');
    check(changed.back.layers.length===1 && changed.back.layers[0]===backLogo,'Front photos, layout or E2 changed the independent back');
    const moved=await buildPcbScenes({...inputs,backLogo:{x:60,y:40,scale:1.25}});
    check(moved.back.layers[0].x>backLogo.x && moved.back.layers[0].y<backLogo.y,'Back position did not use its independent coordinates');
    check(moved.front.layers.every((layer,i)=>layer===independent.front.layers[i]),'Moving the back invalidated front artwork');
    for(const processingMode of ['gray','color'] as const) {
      const backSettings={...PCB_DEFAULTS,processingMode,backLogo:{x:60,y:40,scale:1.25}};
      const files=await exportPcbImages(inputs,backSettings,{sides:['back'],views:getPcbViews(backSettings),outline:true});
      check(files.scenes.back.layers.length===1 && files.scenes.back.layers[0].x===moved.back.layers[0].x,'Back export ignored the saved independent layout');
      const board=composePcbScene(files.scenes.back,backSettings);
      for(const file of files.images) {
        const bitmap=await createImageBitmap(await pcbImageBlob(file));
        const decoded=document.createElement('canvas');decoded.width=590;decoded.height=1180;
        const ctx=decoded.getContext('2d')!;ctx.drawImage(bitmap,0,0);bitmap.close();
        const actual=ctx.getImageData(0,0,590,1180).data,expected=createPcbRaster(board,backSettings,file.view,file.view!=='appearance').data;
        check(actual.every((value,i)=>value===expected[i]),`Independent back ${processingMode}/${file.view} preview and export disagree`);
      }
    }
    report.independent_back_verified=true;report.result = 'PASS';
    output.textContent = JSON.stringify(report, null, 2);
  } catch (error) {
    output.textContent = JSON.stringify({...report, result: 'FAIL', error: String(error)}, null, 2);
  } finally { clearInterval(heartbeat); button.disabled = false; }
});
