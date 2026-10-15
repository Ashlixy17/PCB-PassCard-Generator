import * as THREE from 'three';
import {PcbCanvasTextures} from '../src/utils/pcbCanvasTextures';
import {PcbSideFrames} from '../src/types/pcbWorker';

const button=document.querySelector<HTMLButtonElement>('#run')!;
const output=document.querySelector<HTMLPreElement>('#results')!;
const check=(condition:boolean,message:string)=>{if(!condition)throw new Error(message);};
const kinds=['appearance','surface','height'] as const;

async function frames(width:number,height:number,pixel:(x:number,y:number)=>number[],bitmap:boolean):Promise<PcbSideFrames> {
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)data.set(pixel(x,y),(y*width+x)*4);
  const source=document.createElement('canvas');source.width=width;source.height=height;
  if(bitmap)source.getContext('2d')!.putImageData(new ImageData(data,width,height),0,0);
  const result:PcbSideFrames={};
  for(const kind of kinds)result[kind]=bitmap?{width,height,bitmap:await createImageBitmap(source)}:{width,height,pixels:data.slice()};
  return result;
}

button.addEventListener('click',async()=>{
  button.disabled=true;output.textContent='正在验证…';
  const report:Record<string,unknown>={};
  let renderer:THREE.WebGLRenderer|undefined;
  const textureSets=[new PcbCanvasTextures(64,128),new PcbCanvasTextures(64,128)];
  const material=new THREE.MeshBasicMaterial({transparent:true,toneMapped:false});
  const geometry=new THREE.PlaneGeometry(2,2);
  const target=new THREE.WebGLRenderTarget(32,64,{depthBuffer:false,stencilBuffer:false});
  try {
    renderer=new THREE.WebGLRenderer({canvas:document.querySelector<HTMLCanvasElement>('#preview')!,alpha:true,antialias:false});
    renderer.setSize(180,360);renderer.setClearColor(0,0);renderer.toneMapping=THREE.NoToneMapping;
    const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);
    camera.position.z=1;scene.add(new THREE.Mesh(geometry,material));
    const pixels=new Uint8Array(32*64*4);let gpuChecks=0,updates=0;
    const read=(set:PcbCanvasTextures,kind:typeof kinds[number])=>{
      material.map=set.maps[kind].texture;material.needsUpdate=true;
      renderer!.setRenderTarget(target);renderer!.clear();renderer!.render(scene,camera);
      renderer!.readRenderTargetPixels(target,0,0,32,64,pixels);
      check(renderer!.getContext().getError()===0,'WebGL rejected a texture upload');
      return pixels;
    };
    const solid=(set:PcbCanvasTextures,rgba:number[])=>{
      for(const kind of kinds) {
        check(read(set,kind).every((value,i)=>value===rgba[i%4]),`${kind}: a draft left stale pixels on the GPU`);
        check(set.maps[kind].canvas.width===64&&set.maps[kind].canvas.height===128,'GPU source dimensions changed');
        gpuChecks++;
      }
    };
    const update=(set:PcbCanvasTextures,input:PcbSideFrames)=>{
      check(set.update(input),'A complete frame was rejected');updates++;
      // The real hook closes worker bitmaps before the next GPU render.
      for(const frame of Object.values(input))frame.bitmap?.close();
    };
    const identities=textureSets.map(set=>kinds.map(kind=>set.maps[kind].texture.uuid));
    for(const [index,set] of textureSets.entries()) {
      const size=index?4:64,height=index?8:128;
      update(set,await frames(size,height,()=>[255,0,0,255],true));solid(set,[255,0,0,255]);
    }
    const allocated=renderer.info.memory.textures;
    for(let cycle=0;cycle<10;cycle++)for(const set of textureSets) {
      for(const [w,h,rgba] of [[64,128,[0,255,0,255]],[4,8,[0,0,255,255]],[4,8,[0,0,0,0]]] as const) {
        update(set,await frames(w,h,()=>[...rgba],cycle%2===0));solid(set,[...rgba]);
      }
    }
    for(const [index,set] of textureSets.entries()) {
      const mixed=await frames(4,8,()=>[255,0,0,255],false);
      mixed.height=(await frames(64,128,()=>[255,0,0,255],false)).height;
      check(!set.update(mixed),'Mixed-resolution maps must keep the previous complete set');solid(set,[0,0,0,0]);
      update(set,await frames(2,4,(x,y)=>y<2?(x?[0,255,0,255]:[255,0,0,255]):(x?[255,255,255,255]:[0,0,255,255]),true));
      for(const kind of kinds) {
        const data=read(set,kind);
        for(const [x,y,rgba] of [[0,0,[0,0,255,255]],[31,0,[255,255,255,255]],[0,63,[255,0,0,255]],[31,63,[0,255,0,255]]] as const) {
          const offset=(y*32+x)*4;
          check(rgba.every((value,c)=>data[offset+c]===value),`${kind}: UV orientation or coverage shifted`);
        }
        check(set.maps[kind].texture.uuid===identities[index][kinds.indexOf(kind)],'Quality changes allocated another texture');gpuChecks++;
      }
    }
    check(renderer.info.memory.textures===allocated,'Texture memory grew while switching quality');
    report.updates=updates;report.gpu_image_checks=gpuChecks;report.quality_cycles=10;
    report.bitmap_and_pixel_paths=true;report.gpu_texture_count=allocated;report.stable_texture_size='64x128';
    report.result='PASS';output.textContent=JSON.stringify(report,null,2);
  } catch(error) {output.textContent=JSON.stringify({...report,result:'FAIL',error:String(error)},null,2);}
  finally {
    for(const set of textureSets)set.dispose();geometry.dispose();material.dispose();target.dispose();
    renderer?.dispose();renderer?.forceContextLoss();button.disabled=false;
  }
});
