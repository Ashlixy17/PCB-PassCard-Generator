import test from 'node:test';
import assert from 'node:assert/strict';
import {DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3} from 'three';
import {createCanvas} from '@napi-rs/canvas';
import {PCB_DEFAULTS} from '../types/pcb';
import {composePcbScene, PcbMaterial} from './pcbProcessing';
import {createPcbGeometry, disposePcbGeometry, tracePcbContours} from './pcbGeometry';
import {createPcbSurfaceMaps} from './pcb3dTextures';
import {PcbCanvasTextures} from './pcbCanvasTextures';
import {PcbSideFrames} from '../types/pcbWorker';

const approx=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-5,`${actual} != ${expected}`);

const solidFrames=(width:number,height:number,color:number[]):PcbSideFrames=>Object.fromEntries(['appearance','surface','height'].map(kind=>[kind,{width,height,pixels:Uint8ClampedArray.from({length:width*height*4},(_,i)=>color[i%4])}]));

test('draft and full frames fill fixed texture storage without old pixels or transparent ghosts',()=>{
  const textures=new PcbCanvasTextures(10,20,1,()=>createCanvas(1,1) as unknown as HTMLCanvasElement);
  const originals=Object.values(textures.maps).map(slot=>slot.texture);
  const check=(rgba:number[])=>{
    for(const [index,slot] of Object.values(textures.maps).entries()) {
      assert.equal(slot.texture,originals[index],'quality changes must reuse the same fixed GPU storage');
      assert.equal(slot.canvas.width,10);assert.equal(slot.canvas.height,20);
      const pixels=slot.canvas.getContext('2d')!.getImageData(0,0,10,20).data;
      assert.ok(pixels.every((value,i)=>value===rgba[i%4]),'new pixels must fill the whole board, including its edges');
    }
  };
  try {
    for(let i=0;i<6;i++) {
      const full=solidFrames(10,20,[255,0,0,255]);
      assert.equal(textures.update(full),true);check([255,0,0,255]);
      assert.equal(textures.update(full),false,'unchanged frames must not upload again');
      assert.equal(textures.update(solidFrames(4,8,[0,0,255,255])),true);check([0,0,255,255]);
      assert.equal(textures.update(solidFrames(4,8,[0,0,0,0])),true);check([0,0,0,0]);
    }
    const mixed=solidFrames(4,8,[0,255,0,255]);mixed.height=solidFrames(10,20,[255,0,0,255]).height;
    assert.equal(textures.update(mixed),false,'partial resolutions must not mix material maps');check([0,0,0,0]);
    assert.equal(textures.update({appearance:solidFrames(10,20,[0,0,0,255]).appearance}),false);
  } finally {textures.dispose();}
});

test('3D board has physical thickness, matching face UVs and real through holes',()=>{
  const width=60,height=120,mask=new Uint8Array(width*height).fill(1);
  for(const [x,y,w,h] of [[20,5,20,5],[5,5,4,4],[51,5,4,4]])
    for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)mask[yy*width+xx]=0;
  const saved=mask.slice(),geometry=createPcbGeometry(mask,width,height,60,2.4);
  try {
    geometry.body.computeBoundingBox();
    const size=geometry.body.boundingBox!.getSize(new Vector3());
    approx(size.x,60);approx(size.y,120);approx(size.z,2.4);
    assert.equal(geometry.holeCount,3);
    const material=new MeshBasicMaterial({side:DoubleSide});
    const body=new Mesh(geometry.body,material),face=new Mesh(geometry.front,material);
    face.position.z=1.2;body.updateMatrixWorld();face.updateMatrixWorld();
    const hit=(x:number,y:number)=>new Raycaster(new Vector3(x-30,60-y,10),new Vector3(0,0,-1)).intersectObjects([body,face]).length;
    assert.equal(hit(30,7),0,'slot must pass through the body');
    assert.equal(hit(7,7),0);assert.equal(hit(53,7),0);
    assert.ok(hit(30,60)>0,'solid board must remain between holes');
    assert.equal(new Raycaster(new Vector3(0,0,10),new Vector3(0,0,-1)).intersectObject(body).length,0,'FR4 caps must not fight with the textured faces');
    assert.ok(new Raycaster(new Vector3(0,53,0),new Vector3(0,-1,0)).intersectObject(body).length>0,'the slot must have walls through the full thickness');
    material.dispose();
    const front=geometry.front.getAttribute('uv'),back=geometry.back.getAttribute('uv');
    for(let i=0;i<front.count;i++) {
      approx(front.getX(i)+back.getX(i),1);
      approx(front.getY(i),back.getY(i));
    }
    assert.deepEqual(mask,saved,'tracing must not change the source mask');
    assert.equal(tracePcbContours(mask,width,height),tracePcbContours(mask,width,height),'reuse contours when only thickness changes');
  } finally {disposePcbGeometry(geometry);}
});

test('separate islands and diagonal contacts do not merge into an invalid outline',()=>{
  const mask=new Uint8Array([1,0,0,0,1,0,0,0,1]);
  const contours=tracePcbContours(mask,3,3);
  assert.equal(contours.outlines.length,3);assert.equal(contours.holeCount,0);
  const geometry=createPcbGeometry(mask,3,3);disposePcbGeometry(geometry);
  assert.throws(()=>tracePcbContours(new Uint8Array(9),3,3),/板形为空/);
  assert.throws(()=>createPcbGeometry(mask,3,3,59,0),/板厚/);
  assert.throws(()=>tracePcbContours(mask,4,3),/尺寸无效/);
});

test('only exposed copper is metallic; silk, covered copper and bare FR4 retain their own finish',()=>{
  const materials=[PcbMaterial.Mask,PcbMaterial.Silk,PcbMaterial.Gold,PcbMaterial.CoveredCopper,PcbMaterial.Substrate];
  const board=composePcbScene({side:'front',width:6,height:1,boardMask:new Uint8Array([1,1,1,1,1,0]),layers:[]},PCB_DEFAULTS);
  board.materials.set(materials);
  board.silk.set([0,1,0,0,0,0]);board.copper.set([0,1,1,1,0,0]);board.mask.set([0,0,1,0,1,0]);
  const saved=board.copper.slice(),{surface,height}=createPcbSurfaceMaps(board);
  assert.deepEqual(Array.from({length:6},(_,i)=>surface.data[i*4+2]),[0,0,255,0,0,0]);
  assert.equal(surface.data[5*4+3],0,'holes have no material');
  assert.ok(surface.data[1*4+1]>surface.data[2*4+1],'silk is rougher than exposed metal');
  assert.ok(height.data[1*4]>height.data[0],'silk is raised above mask');
  assert.ok(height.data[4*4]<height.data[0],'bare substrate is below mask');
  assert.deepEqual(board.copper,saved);
  assert.ok(createPcbSurfaceMaps(board,'hasl').surface.data[2*4+1]>surface.data[2*4+1]);
  assert.ok(createPcbSurfaceMaps(board,'osp').surface.data[2*4+1]>surface.data[2*4+1]);
});
