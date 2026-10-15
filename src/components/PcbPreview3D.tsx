import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {ImageDown,RotateCcw} from 'lucide-react';
import {PcbFrames,PcbScenes} from '../types/pcbWorker';
import {PcbSide} from '../types/pcb';
import {createPcbGeometry,disposePcbGeometry,PcbGeometry} from '../utils/pcbGeometry';
import {PcbCanvasTextures} from '../utils/pcbCanvasTextures';

interface Props {
  frames:PcbFrames;scenes:PcbScenes|null;side:PcbSide;
  faceRequest:number;widthMm:number;thicknessMm:number;
  onSizeChange:(width:number,thickness:number)=>void;onFallback:()=>void;
}
interface Runtime {
  frames:(frames:PcbFrames)=>void;
  geometry:(scenes:PcbScenes|null,width:number,thickness:number)=>void;
  view:(view:'front'|'back'|'angled')=>void;
  save:()=>void;
}

export default function PcbPreview3D(props:Props) {
  const host=useRef<HTMLDivElement|null>(null),runtime=useRef<Runtime|null>(null);
  const latest=useRef(props);latest.current=props;
  const lastFaceRequest=useRef(props.faceRequest);
  const [error,setError]=useState('');
  const [ready,setReady]=useState(false);
  const [widthInput,setWidthInput]=useState(String(props.widthMm));
  useEffect(()=>setWidthInput(String(props.widthMm)),[props.widthMm]);

  useEffect(()=>{
    const container=host.current;if(!container)return;
    let stopped=false,raf=0,lost=false,disposed=false;
    const cleanups:(()=>void)[]=[];
    const cleanup=()=>{
      if(disposed)return;disposed=true;
      stopped=true;cancelAnimationFrame(raf);runtime.current=null;
      for(const dispose of cleanups.reverse()){try{dispose();}catch{/* Finish releasing the remaining GPU resources. */}}
    };
    try {
      const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
      cleanups.push(()=>{renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
      renderer.outputColorSpace=THREE.SRGBColorSpace;
      renderer.toneMapping=THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure=.8;
      renderer.setClearColor(0x080d13,1);
      const canvas=renderer.domElement;canvas.setAttribute('aria-label','PCB 三维模型，可拖动旋转与滚轮缩放');canvas.tabIndex=0;
      container.appendChild(canvas);
      const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.05,10000);
      const controls=new OrbitControls(camera,canvas);
      controls.enableDamping=false;controls.enablePan=true;controls.rotateSpeed=.7;controls.zoomSpeed=.8;
      controls.listenToKeyEvents(canvas);
      cleanups.push(()=>controls.dispose());
      scene.add(new THREE.HemisphereLight(0xf0f5ff,0x756a45,.4));
      const key=new THREE.DirectionalLight(0xffffff,1.25);key.position.set(-70,100,160);scene.add(key);
      const backLight=new THREE.DirectionalLight(0xe0ebff,1.15);backLight.position.set(80,50,-150);scene.add(backLight);
      const room=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer);
      let environment:THREE.WebGLRenderTarget;
      try {environment=pmrem.fromScene(room,.04);}finally{room.dispose();pmrem.dispose();}
      scene.environment=environment.texture;scene.environmentIntensity=.22;
      cleanups.push(()=>environment.dispose());

      const textures={} as Record<PcbSide,PcbCanvasTextures>;
      for(const side of ['front','back'] as const) {
        const source=latest.current.scenes?.[side];
        const maps=new PcbCanvasTextures(source?.width||590,source?.height||1180,Math.min(8,renderer.capabilities.getMaxAnisotropy()));
        textures[side]=maps;cleanups.push(()=>maps.dispose());
      }
      const slots={front:textures.front.maps,back:textures.back.maps};
      const faceMaterial=(side:PcbSide)=>new THREE.MeshStandardMaterial({
        map:slots[side].appearance.texture,roughnessMap:slots[side].surface.texture,metalnessMap:slots[side].surface.texture,
        bumpMap:slots[side].height.texture,bumpScale:.035,roughness:1,metalness:1,
        side:side==='front'?THREE.FrontSide:THREE.BackSide,alphaTest:.5,dithering:true,
      });
      const frontMat=faceMaterial('front'),backMat=faceMaterial('back');
      const edgeMat=new THREE.MeshStandardMaterial({color:0xa59965,roughness:.9,metalness:0,dithering:true});
      cleanups.push(()=>{frontMat.dispose();backMat.dispose();edgeMat.dispose();});
      const body=new THREE.Mesh(new THREE.BufferGeometry(),edgeMat),front=new THREE.Mesh(new THREE.BufferGeometry(),frontMat),back=new THREE.Mesh(new THREE.BufferGeometry(),backMat);
      scene.add(body,front,back);
      let geometry:PcbGeometry|null=null;
      let shapeMask:Uint8Array|undefined,shapeWidth=0,shapeHeight=0;
      cleanups.push(()=>{if(geometry)disposePcbGeometry(geometry);else{body.geometry.dispose();front.geometry.dispose();back.geometry.dispose();}});
      const draw=()=>{
        if(stopped||lost||raf)return;
        raf=requestAnimationFrame(()=>{
          raf=0;if(stopped||lost)return;
          renderer.render(scene,camera);
          container.dataset.renderCount=String(Number(container.dataset.renderCount||0)+1);
        });
      };
      controls.addEventListener('change',draw);
      cleanups.push(()=>controls.removeEventListener('change',draw));
      const fitDistance=()=>{
        if(!geometry)return 200;
        const tangent=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
        return Math.max(geometry.heightMm/(2*tangent),geometry.widthMm/(2*tangent*Math.max(.1,camera.aspect)))*1.18;
      };
      const view=(preset:'front'|'back'|'angled')=>{
        const sign=(preset==='back'||preset==='angled'&&latest.current.side==='back')?-1:1;
        const direction=preset==='angled'?new THREE.Vector3(.5,.23,sign):new THREE.Vector3(0,0,sign);
        controls.target.set(0,0,0);camera.up.set(0,1,0);camera.position.copy(direction.normalize().multiplyScalar(fitDistance()));
        controls.minDistance=(geometry?.widthMm||59)*.2;controls.maxDistance=fitDistance()*6;
        camera.far=fitDistance()*20;camera.updateProjectionMatrix();camera.lookAt(controls.target);controls.update();
        container.dataset.view=preset;draw();
      };
      const syncGeometry=(scenes:PcbScenes|null,width:number,thickness:number)=>{
        const source=scenes?.front;if(!source)return;
        if(shapeMask===source.boardMask&&shapeWidth===source.width&&shapeHeight===source.height&&geometry?.widthMm===width&&geometry.thicknessMm===thickness)return;
        const next=createPcbGeometry(source.boardMask,source.width,source.height,width,thickness);
        const refit=!geometry||geometry.widthMm!==width;
        const old=geometry;
        if(!old){body.geometry.dispose();front.geometry.dispose();back.geometry.dispose();}
        geometry=next;body.geometry=next.body;front.geometry=next.front;back.geometry=next.back;
        front.position.z=thickness/2;back.position.z=-thickness/2;
        shapeMask=source.boardMask;shapeWidth=source.width;shapeHeight=source.height;
        if(old)disposePcbGeometry(old);
        container.dataset.holeCount=String(next.holeCount);container.dataset.thicknessMm=String(thickness);
        container.dataset.geometryRevision=String(Number(container.dataset.geometryRevision||0)+1);
        if(refit)view('angled');draw();
      };
      const syncFrames=(frames:PcbFrames)=>{
        let changed=false;
        for(const side of ['front','back'] as const) {
          const maps=textures[side];
          if(maps.update(frames[side])) {
            changed=true;
            const source=maps.sourceSize!;
            const full=source.width===maps.width&&source.height===maps.height;
            container.dataset[side+'Quality']=full?'full':'draft';
            container.dataset[side+'SourceSize']=`${source.width}x${source.height}`;
            container.dataset[side+'Backend']=frames[side]?.appearance?.backend||'cpu';
            if(!full)container.dataset.draftUpdates=String(Number(container.dataset.draftUpdates||0)+1);
          }
          container.dataset[side+'TextureReady']=String(maps.ready);
          container.dataset[side+'TextureSize']=`${maps.width}x${maps.height}`;
        }
        if(changed)draw();
      };
      const resize=()=>{
        const width=container.clientWidth,height=container.clientHeight;if(!width||!height)return;
        renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
        if(geometry) {
          const direction=camera.position.clone().sub(controls.target).normalize();
          camera.position.copy(controls.target).add(direction.multiplyScalar(fitDistance()));controls.update();
        }
        draw();
      };
      const observer=new ResizeObserver(resize);observer.observe(container);cleanups.push(()=>observer.disconnect());
      const lostContext=(event:Event)=>{event.preventDefault();lost=true;setError('3D 显示暂时中断，可以切回 2D 或重新打开 3D。');};
      const restored=()=>{lost=false;for(const face of Object.values(slots))for(const slot of Object.values(face))slot.texture.needsUpdate=true;setError('');draw();};
      canvas.addEventListener('webglcontextlost',lostContext);canvas.addEventListener('webglcontextrestored',restored);
      cleanups.push(()=>{canvas.removeEventListener('webglcontextlost',lostContext);canvas.removeEventListener('webglcontextrestored',restored);});
      runtime.current={frames:syncFrames,geometry:syncGeometry,view,save:()=>{
        if(!geometry)return;
        renderer.render(scene,camera);
        canvas.toBlob(blob=>{
          if(!blob||stopped)return;
          const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='PCB_3D.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
        },'image/png');
      }};
      resize();syncGeometry(latest.current.scenes,latest.current.widthMm,latest.current.thicknessMm);syncFrames(latest.current.frames);
      setReady(true);setError('');
    } catch(error) {
      cleanup();setError(error instanceof Error?`无法开启 3D：${error.message}`:'无法开启 3D 预览');
    }
    return cleanup;
  },[]);

  useLayoutEffect(()=>{runtime.current?.frames(props.frames);},[props.frames]);
  useLayoutEffect(()=>{runtime.current?.geometry(props.scenes,props.widthMm,props.thicknessMm);},[props.scenes,props.widthMm,props.thicknessMm]);
  useEffect(()=>{
    if(lastFaceRequest.current===props.faceRequest)return;
    lastFaceRequest.current=props.faceRequest;runtime.current?.view(props.side);
  },[props.side,props.faceRequest]);

  return <div className="pcb-3d-preview" data-testid="pcb-3d-preview">
    <div className="pcb-3d-toolbar">
      <label>板宽 <input aria-label="3D 板宽" type="number" min={20} max={120} step={1} value={widthInput} onChange={event=>{setWidthInput(event.target.value);const value=event.target.valueAsNumber;if(Number.isFinite(value)&&value>=20&&value<=120)props.onSizeChange(value,props.thicknessMm);}} onBlur={()=>{const parsed=Number(widthInput),value=widthInput.trim()&&Number.isFinite(parsed)?Math.min(120,Math.max(20,parsed)):props.widthMm;setWidthInput(String(value));if(value!==props.widthMm)props.onSizeChange(value,props.thicknessMm);}}/> mm</label>
      <label>板厚 <select aria-label="3D 板厚" value={props.thicknessMm} onChange={event=>props.onSizeChange(props.widthMm,Number(event.target.value))}>{[.6,.8,1,1.2,1.6,2,2.4].map(value=><option key={value} value={value}>{value} mm</option>)}</select></label>
      <button type="button" disabled={!ready||!!error} onClick={()=>runtime.current?.view('angled')}><RotateCcw size={14}/>立体视角</button>
      <button type="button" disabled={!ready||!!error} onClick={()=>runtime.current?.save()}><ImageDown size={14}/>保存视图</button>
    </div>
    <div ref={host} className="pcb-3d-stage" data-testid="pcb-3d-stage"/>
    {error&&<div className="pcb-3d-error" role="alert"><p>{error}</p><button type="button" onClick={props.onFallback}>返回 2D 预览</button></div>}
    <p className="pcb-3d-help">拖动旋转 · 滚轮缩放 · 右键平移 · {props.widthMm} × {props.widthMm*2} × {props.thicknessMm} mm</p>
  </div>;
}
