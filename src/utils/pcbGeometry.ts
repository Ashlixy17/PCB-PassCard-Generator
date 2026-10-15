import {BufferGeometry, ExtrudeGeometry, Path, Shape, ShapeGeometry, Vector2} from 'three';

type Point = {x: number; y: number};
export interface PcbContours {outlines: {outer: Point[]; holes: Point[][]}[]; holeCount: number}
const contourCache = new WeakMap<Uint8Array, {width: number; height: number; contours: PcbContours}>();

function area(points: Point[]) {
  return points.reduce((sum,p,i) => {const q=points[(i+1)%points.length];return sum+p.x*q.y-q.x*p.y;},0)/2;
}

function simplify(points: Point[], tolerance = .6): Point[] {
  const closed=[...points,points[0]], keep=new Set([0,closed.length-1]);
  const stack=[[0,closed.length-1]];
  while(stack.length) {
    const [a,b]=stack.pop()!, start=closed[a], end=closed[b];
    const dx=end.x-start.x,dy=end.y-start.y,length=dx*dx+dy*dy;
    let furthest=-1,distance=tolerance;
    for(let i=a+1;i<b;i++) {
      const p=closed[i],t=length?Math.max(0,Math.min(1,((p.x-start.x)*dx+(p.y-start.y)*dy)/length)):0;
      const d=Math.hypot(p.x-start.x-t*dx,p.y-start.y-t*dy);
      if(d>distance){furthest=i;distance=d;}
    }
    if(furthest>=0){keep.add(furthest);stack.push([a,furthest],[furthest,b]);}
  }
  const result=closed.filter((_,i)=>i<closed.length-1&&keep.has(i));
  return result.length>=3?result:points;
}

function contains(p: Point, polygon: Point[]) {
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j];
    if((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}

/** Trace the physical board mask once; printed artwork never changes these contours. */
export function tracePcbContours(mask: Uint8Array, width: number, height: number): PcbContours {
  const cached=contourCache.get(mask);
  if(cached?.width===width && cached.height===height)return cached.contours;
  if(width<1 || height<1 || mask.length!==width*height)throw new Error('PCB 板形尺寸无效');
  const stride=width+1,edges:{a:number;b:number;used:boolean}[]=[],outgoing=new Map<number,number[]>();
  const add=(a:number,b:number)=>{const index=edges.push({a,b,used:false})-1;const list=outgoing.get(a)||[];list.push(index);outgoing.set(a,list);};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const i=y*width+x;if(!mask[i])continue;
    const a=y*stride+x;
    if(y===0||!mask[i-width])add(a,a+1);
    if(x===width-1||!mask[i+1])add(a+1,a+1+stride);
    if(y===height-1||!mask[i+width])add(a+1+stride,a+stride);
    if(x===0||!mask[i-1])add(a+stride,a);
  }
  const point=(vertex:number)=>({x:vertex%stride,y:Math.floor(vertex/stride)});
  const rings:Point[][]=[];
  for(const first of edges) {
    if(first.used)continue;
    const ring:Point[]=[];let edge=first,closed=false;
    for(let guard=0;guard<=edges.length;guard++) {
      edge.used=true;ring.push(point(edge.a));
      if(edge.b===first.a){closed=true;break;}
      const a=point(edge.a),b=point(edge.b),dx=b.x-a.x,dy=b.y-a.y;
      const next=(outgoing.get(edge.b)||[]).filter(index=>!edges[index].used).sort((left,right)=>{
        const rank=(index:number)=>{const c=point(edges[index].b),ex=c.x-b.x,ey=c.y-b.y,cross=dx*ey-dy*ex;return cross>0?0:dx*ex+dy*ey>0?1:cross<0?2:3;};
        return rank(left)-rank(right);
      })[0];
      if(next===undefined)break;edge=edges[next];
    }
    if(closed&&ring.length>=4)rings.push(ring);
  }
  const outlines=rings.filter(ring=>area(ring)>0).map(outer=>({outer:simplify(outer),holes:[] as Point[][]}));
  for(const hole of rings.filter(ring=>area(ring)<0)) {
    const owners=outlines.filter(outline=>contains(hole[0],outline.outer)).sort((a,b)=>Math.abs(area(a.outer))-Math.abs(area(b.outer)));
    owners[0]?.holes.push(simplify(hole));
  }
  if(!outlines.length)throw new Error('PCB 板形为空，无法建立模型');
  const contours={outlines,holeCount:outlines.reduce((sum,outline)=>sum+outline.holes.length,0)};
  contourCache.set(mask,{width,height,contours});return contours;
}

export function createPcbGeometry(mask: Uint8Array, pixelWidth: number, pixelHeight: number, widthMm=59, thicknessMm=1.6) {
  if(!Number.isFinite(widthMm)||!Number.isFinite(thicknessMm)||widthMm<=0||thicknessMm<=0)throw new Error('PCB 尺寸与板厚必须大于零');
  const contours=tracePcbContours(mask,pixelWidth,pixelHeight),heightMm=widthMm*pixelHeight/pixelWidth;
  const convert=(points:Point[])=>points.map(p=>new Vector2((p.x/pixelWidth-.5)*widthMm,(.5-p.y/pixelHeight)*heightMm));
  const shapes=contours.outlines.map(outline=>{const shape=new Shape(convert(outline.outer));shape.holes=outline.holes.map(hole=>new Path(convert(hole)));return shape;});
  const body=new ExtrudeGeometry(shapes,{depth:thicknessMm,bevelEnabled:false,steps:1,curveSegments:1});
  body.translate(0,0,-thicknessMm/2);
  // The textured faces own the caps. Drawing FR4 caps underneath would cause
  // depth fighting on large boards, especially at grazing viewing angles.
  const walls=body.groups.find(group=>group.materialIndex===1);
  if(walls)body.setDrawRange(walls.start,walls.count);
  const front=new ShapeGeometry(shapes),back=front.clone();
  const assignUV=(geometry:BufferGeometry,reverse:boolean)=>{
    const positions=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
    for(let i=0;i<positions.count;i++){const u=positions.getX(i)/widthMm+.5;uv.setXY(i,reverse?1-u:u,positions.getY(i)/heightMm+.5);}
    uv.needsUpdate=true;
  };
  assignUV(front,false);assignUV(back,true);
  return {body,front,back,widthMm,heightMm,thicknessMm,holeCount:contours.holeCount};
}

export type PcbGeometry = ReturnType<typeof createPcbGeometry>;
export function disposePcbGeometry(geometry: PcbGeometry) {geometry.body.dispose();geometry.front.dispose();geometry.back.dispose();}
