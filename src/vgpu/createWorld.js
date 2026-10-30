import { BoxGeometry, ConeGeometry, OctahedronGeometry, DodecahedronGeometry, SphereGeometry } from 'three';
import { instances, composeMatrix, multiplyMatrices, orbitRig, rigPose, orthographic, viewMatrices } from 'vgpu/scene';
import { instanceGeometry } from 'vgpu/scene/gpu';
import { trees, buildings, rocks, lamps, STOPS, JOBS } from '../worldData.js';

// The API is injected so this exact scene runs with vgpu in the browser and
// vgpu/node on a software Vulkan adapter for offscreen pixel validation.
export function createWorld(api, gpu, shader, game) {
  const { geometry, draw, uniforms, bundle }=api;
  const projection=new Float32Array(16),pose={position:new Float32Array(3),quaternion:new Float32Array(4)},camera={view:new Float32Array(16),viewProjection:new Float32Array(16)};
  const rig=orbitRig({target:[game.x,0,game.z],yaw:Math.atan2(23,28),pitch:Math.atan2(37,Math.hypot(23,28)),distance:Math.hypot(23,37,28)});
  const globals=uniforms(gpu,{viewProjection:camera.viewProjection,position:[23,37,62],time:0,car:[game.x,game.z,game.angle,0]});
  function makeBatch(shape,capacity,label){
    const nonIndexed=shape.index?shape.toNonIndexed():shape;
    const count=nonIndexed.attributes.position.count,data=new Float32Array(count*6);
    for(let i=0;i<count;i++){data.set(nonIndexed.attributes.position.array.subarray(i*3,i*3+3),i*6);data.set(nonIndexed.attributes.normal.array.subarray(i*3,i*3+3),i*6+3)}
    shape.dispose();if(shape!==nonIndexed)nonIndexed.dispose();
    const base=geometry(gpu,{buffers:[{attributes:{position:{format:'float32x3',location:0},normal:{format:'float32x3',location:1}},data,stride:24}],vertexCount:count});
    const collection=instances({capacity,attributes:{tint:'float32x4'}}),bridge=instanceGeometry(gpu,collection,{mesh:base});
    const drawable=draw(gpu,{shader,geometry:bridge.geometry,cull:'back',label});drawable.set({camera:globals});
    return {base,collection,bridge,drawable,count:0};
  }
  const boxes=makeBatch(new BoxGeometry(1,1,1),1800,'world-boxes');
  const cones=makeBatch(new ConeGeometry(1,1,5),trees.length*3+20,'forest');
  const roofs=makeBatch(new ConeGeometry(1,1,4),20,'roofs');
  const stones=makeBatch(new DodecahedronGeometry(1,0),rocks.length+10,'rocks');
  const sphere=makeBatch(new SphereGeometry(1,12,6),2,'observatory');
  const car=makeBatch(new BoxGeometry(1,1,1),32,'wagon');
  const markers=makeBatch(new OctahedronGeometry(1,0),1,'destination');
  const batches=[boxes,cones,roofs,stones,sphere,car,markers];
  const matrix=new Float32Array(16);
  function tint(hex,glow=0){return [parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255,glow]}
  function add(batch,pos,scale,color,rotation=[0,0,0],glow=0){let id=batch.collection.add({tint:tint(color,glow)});composeMatrix({position:pos,scale,rotation},matrix);batch.collection.setWorld(id,matrix);return id;}
  const box=(p,s,c,glow=0)=>add(boxes,p,s,c,[0,0,0],glow);
  box([0,-.2,0],[124,.3,124],'#4c6456');
  for(const v of [-36,0,36]){
    box([v,0,0],[8,.08,79],'#7d8170');box([v,.045,0],[6.9,.05,79],'#535f5e');
    box([0,.01,v],[79,.08,8],'#7d8170');box([0,.06,v],[79,.05,6.9],'#535f5e');
    for(let i=-38;i<40;i+=4){box([v,.08,i],[.12,.015,1.6],'#a8aa87');box([i,.1,v],[1.6,.015,.12],'#a8aa87')}
  }
  for(const x of [-36,0,36])for(const z of [-36,0,36])box([x,.105,z],[7,.02,7],'#566260');
  box([-4,.06,40],[21,.1,12],'#68776a');
  trees.forEach((t,i)=>{box([t.x,t.s*1.6,t.z],[.38*t.s,3.2*t.s,.38*t.s],'#554e46');for(let l=0;l<3;l++)add(cones,[t.x,(2.5+l*1.35)*t.s,t.z],[(2.15-l*.45)*t.s,(3-l*.25)*t.s,(2.15-l*.45)*t.s],['#294c48','#355b50','#406656','#2e534d'][i%4],[0,i*.9,0]);});
  for(const b of buildings){
    box([b.x,b.h/2,b.z],[b.w,b.h,b.d],b.c);box([b.x,.25,b.z],[b.w+.7,.5,b.d+.7],'#475c59');
    add(roofs,[b.x,b.h+1.2,b.z],[Math.max(b.w,b.d)*.79,3,Math.max(b.w,b.d)*.79],b.roof,[0,Math.PI/4,0]);
    for(const v of [-.28,.28])box([b.x+b.w*v,b.h*.57,b.z+b.d/2+.05],[1.5,1.35,.1],'#f5cb82',1);
    box([b.x,1.1,b.z+b.d/2+.05],[1.3,2.2,.15],'#344d4d');box([b.x+b.w*.28,b.h+1.8,b.z-b.d*.2],[1,2,1],'#4c565e');
    if(b.kind==='observatory'){add(sphere,[b.x,b.h+2,b.z],[3,2.3,3],'#9bb0b0');add(boxes,[b.x,b.h+4,b.z-1.4],[1,1,4],'#bac6bb',[-.8,0,0]);}
  }
  for(const r of rocks)add(stones,[r.x,r.s*.25,r.z],[r.s,r.s*.65,r.s],'#849284');
  for(const [x,z] of lamps){box([x,2.5,z],[.2,5,.2],'#374c4d');box([x+.6,5,z],[1.5,.17,.2],'#374c4d');box([x+1.2,4.85,z],[.6,.15,.5],'#ffe5ad',1)}
  const carParts=[];
  function part(p,s,c,glow=0){let id=add(car,p,s,c,[0,0,0],glow),local=composeMatrix({position:p,scale:s},new Float32Array(16));carParts.push({id,local});}
  part([0,.65,0],[1.9,.65,3.6],'#d1ac69');part([0,.94,-.65],[1.82,.24,1.4],'#efc783');part([0,1.3,.3],[1.65,.75,1.7],'#d6ba7e');
  part([0,1.36,-.57],[1.4,.46,.05],'#324f59');part([0,1.34,1.17],[1.38,.4,.05],'#324f59');
  for(const side of [-1,1]){part([side*.84,1.35,.3],[.04,.42,1.3],'#3b5960');for(const z of [-1.05,1.1])part([side*.96,.45,z],[.26,.8,.85],'#233438');part([side*.61,.76,-1.82],[.48,.23,.06],'#fff1c9',1);part([side*.65,.7,1.82],[.38,.2,.06],'#dd775d',1)}
  part([0,.44,-1.88],[1.95,.18,.16],'#6c7b78');part([0,.44,1.88],[1.95,.18,.16],'#6c7b78');part([0,1.78,.38],[1.3,.12,1.2],'#455b59');part([-.2,1.95,.4],[.65,.3,.75],'#92724c');part([.4,1.9,.2],[.35,.2,.6],'#73896d');
  const marker=add(markers,[0,4,35],[.7,.7,.7],'#ffe0a0',[0,0,0],1);
  // Destination circle is a set of small, emissive blocks (updated on a handoff).
  const ring=makeBatch(new BoxGeometry(1,1,1),40,'destination-ring');batches.push(ring);let ringIds=Array.from({length:40},()=>add(ring,[0,.16,0],[.48,.04,.13],'#f4c980',[0,0,0],1));
  let previousTarget=-1,recorded=null;
  const carWorld=new Float32Array(16),out=new Float32Array(16);
  const staticBatches=[boxes,cones,roofs,stones,sphere];
  for(const batch of batches)batch.count=batch.bridge.publish();
  function update(g,time,cssWidth,cssHeight,dt=1/60){
    const f=1-Math.exp(-3*dt),ahead=g.speed*.22;
    rig.target[0]+=(g.x-Math.sin(g.angle)*ahead-rig.target[0])*f;rig.target[2]+=(g.z-Math.cos(g.angle)*ahead-rig.target[2])*f;
    orthographic({left:-cssWidth/32,right:cssWidth/32,top:cssHeight/32,bottom:-cssHeight/32,near:.1,far:170},projection);
    viewMatrices(rigPose(rig,pose),projection,camera);
    globals.set({viewProjection:camera.viewProjection,position:pose.position,time,car:[g.x,g.z,g.angle,g.keys?.[' ']?1:0]});
    composeMatrix({position:[g.x,.07,g.z],rotation:[0,g.angle,0]},carWorld);
    for(const p of carParts){multiplyMatrices(carWorld,p.local,out);car.collection.setWorld(p.id,out)}car.count=car.bridge.publish();
    const target=g.done?0:g.loaded?JOBS[g.job].to:0,stop=STOPS[target];
    composeMatrix({position:[stop.x,3.8+Math.sin(time*2)*.35,stop.z],rotation:[0,time*.7,0],scale:.7},out);markers.collection.setWorld(marker,out);markers.count=markers.bridge.publish();
    if(previousTarget!==target){ringIds.forEach((id,i)=>{let a=i/40*Math.PI*2;composeMatrix({position:[stop.x+Math.sin(a)*3.2,.17,stop.z+Math.cos(a)*3.2],scale:[.5,.04,.13],rotation:[0,a,0]},out);ring.collection.setWorld(id,out)});ring.count=ring.bridge.publish();previousTarget=target;}
  }
  return {
    update,
    async prepare(destination){await Promise.all(batches.map(b=>b.drawable.compile(destination)));recorded=bundle(gpu,{target:destination,label:'Pinefall-static'},b=>{for(const batch of staticBatches)b.draw(batch.drawable,{instances:batch.count})});},
    render(frame,destination){frame.pass({target:destination,clear:[.157,.243,.282,1],clearDepth:1},pass=>{if(recorded)pass.bundles(recorded);else for(const b of staticBatches)pass.draw(b.drawable,{instances:b.count});for(const b of [car,markers,ring])pass.draw(b.drawable,{instances:b.count})})},
    destroy(){recorded?.dispose();for(const b of batches){b.drawable.dispose();b.bridge.destroy();b.base.destroy()}},
  };
}
