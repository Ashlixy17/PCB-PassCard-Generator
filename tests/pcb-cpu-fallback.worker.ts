// Simulate missing WebGL2, or lose an existing context on the next preview.
// This worker is test-only and never enters the app bundle.
const loseContext=new URL(self.location.href).searchParams.has('context-loss');
let context:WebGL2RenderingContext|null=null;
const getContext=OffscreenCanvas.prototype.getContext;
Object.defineProperty(OffscreenCanvas.prototype,'getContext',{value:function(type:string,...options:unknown[]) {
  if(type==='webgl2'&&!loseContext)return null;
  const result=Reflect.apply(getContext,this,[type,...options]);
  if(type==='webgl2')context=result;
  return result;
}});
const pending:MessageEvent[]=[];
const scope=self as unknown as {onmessage:(event:MessageEvent)=>void};
scope.onmessage=event=>pending.push(event);
await import('../src/workers/pcb.worker');
const handle=scope.onmessage;
scope.onmessage=event=>{
  if(loseContext&&context&&event.data.type==='process'&&event.data.kind==='preview')context.getExtension('WEBGL_lose_context')?.loseContext();
  handle(event);
};
for(const event of pending)scope.onmessage(event);
export {};
