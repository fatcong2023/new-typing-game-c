import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const rig=JSON.parse(fs.readFileSync(path.join(root,'french-soldier-walk-overhead.json')));
const base=JSON.parse(fs.readFileSync(path.join(root,'walk-overhead-samples.json'))).samples[0].pose;
for(const name of ['shield_upper_arm','shield_forearm','shield_hand','shield'])delete base[name];
const D=Math.PI/180,T=1.2,N=36,animation={bones:{},slots:structuredClone(rig.animations.walk_shield_overhead.slots)};
const byName=Object.fromEntries(rig.bones.map(b=>[b.name,b]));
const rotate=([x,y],a)=>[x*Math.cos(a*D)-y*Math.sin(a*D),x*Math.sin(a*D)+y*Math.cos(a*D)];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1]];
const normalize=a=>((a+180)%360+360)%360-180;
function world(pose){const W={};for(const b of rig.bones){const p=pose[b.name]||{},par=W[b.parent],q=[(b.x||0)+(p.x||0),(b.y||0)+(p.y||0)];W[b.name]={p:par?add(par.p,rotate(q,par.a)):q,a:(par?.a||0)+(b.rotation||0)+(p.r||0)};}return W;}
function absolute(pose,name,a){const b=byName[name],W=world(pose);pose[name]={...pose[name],r:normalize(a-(W[b.parent]?.a||0)-(b.rotation||0))};}
function solve(pose,upper,lower,target,bend){const W=world(pose),p=W[upper].p,L1=byName[upper].length,L2=byName[lower].length,dx=target[0]-p[0],dy=target[1]-p[1];const d=Math.min(L1+L2-.01,Math.max(Math.abs(L1-L2)+.01,Math.hypot(dx,dy)));const angle=Math.atan2(dy,dx)/D,off=Math.acos(Math.max(-1,Math.min(1,(L1*L1+d*d-L2*L2)/(2*L1*d))))/D;absolute(pose,upper,angle-off*bend);const el=world(pose)[lower].p;absolute(pose,lower,Math.atan2(target[1]-el[1],target[0]-el[0])/D);}
// Plant both feet in a wider fighting stance for the full attack.
for(const [side,target]of [['near',[65,124.5]],['far',[-70,115.5]]]){solve(base,side+'_thigh',side+'_shin',target,1);absolute(base,side+'_foot',0);}
const W0=world(base),wrist=W0.sword_hand.p,hand=W0.sword_hand.a;
// Attack-only weights: cloth at the belt must never follow the raised sword arm.
const rest=world({}),indices=Object.fromEntries(rig.bones.map((b,i)=>[b.name,i]));
const parts=JSON.parse(fs.readFileSync(path.join(root,'natural-parts.json')));
const sw=([x,y])=>[(x-500)*.75,(1326-y)*.75];
const smooth=(v,a,b)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t)};
function weighted(p,weights){const entries=Object.entries(weights).filter(([,v])=>v>1e-8),w=sw(p);return[entries.length,...entries.flatMap(([n,v])=>{const b=rest[n],q=rotate([w[0]-b.p[0],w[1]-b.p[1]],-b.a);return[indices[n],...q,v]})];}
const armWeights=p=>{const e=smooth(p[1],600,674),h=smooth(p[1],761,809);return {sword_upper_arm:1-e,sword_forearm:e*(1-h),sword_hand:e*h};};
const clothWeights=p=>{const h=smooth(p[1],650,725);return {torso:1-h,hips:h};};
const legWeights=p=>{const side=p[0]<505?'far':'near',h=smooth(p[1],845,900),k=smooth(p[1],975,1040),ankle=smooth(p[1],1110,1190);return{hips:1-h,[side+'_thigh']:h*(1-k),[side+'_shin']:h*k*(1-ankle),[side+'_foot']:h*k*ankle};};
const skin=rig.skins[0].attachments;
function pelvisStrip(meta){const rows=[];for(let y=meta.box[1];y<=meta.box[3];y+=16)rows.push([y,Math.max(meta.box[0],668-.4*y),meta.box[2]]);const pts=[],ids=new Map(),cols=32,id=(x,y)=>{const key=x+','+y;if(!ids.has(key)){ids.set(key,pts.length);const [yy,l,r]=rows[y];pts.push([l+(r-l)*x/cols,yy]);}return ids.get(key);};for(let x=0;x<=cols;x++)id(x,0);for(let y=1;y<rows.length;y++)id(cols,y);for(let x=cols-1;x>=0;x--)id(x,rows.length-1);for(let y=rows.length-2;y>0;y--)id(0,y);const hull=pts.length,tr=[];for(let y=0;y<rows.length-1;y++)for(let x=0;x<cols;x++){const a=id(x,y),b=id(x+1,y),c=id(x+1,y+1),d=id(x,y+1);tr.push(a,b,c,c,d,a);}return{type:'mesh',path:'pelvis',uvs:pts.flatMap(([x,y])=>[(x-meta.box[0])/meta.width,(y-meta.box[1])/meta.height]),triangles:tr,vertices:pts.flatMap(p=>weighted(p,p[1]>835?legWeights(p):clothWeights(p))),hull,width:meta.width,height:meta.height,edges:Array.from({length:hull},(_,i)=>[i*2,((i+1)%hull)*2]).flat()};}
for(const slot of ['pelvis','head']){
 const a=structuredClone(skin[slot][slot]),meta=parts[slot],old=a.vertices;a.vertices=[];let at=0;
 for(let i=0;i<a.uvs.length;i+=2){const p=[meta.box[0]+a.uvs[i]*meta.width,meta.box[1]+a.uvs[i+1]*meta.height],weights={},n=old[at++];
  for(let j=0;j<n;j++,at+=4){const name=rig.bones[old[at]].name,v=old[at+3];if(name.startsWith('sword')){for(const [b,w]of Object.entries(clothWeights(p)))weights[b]=(weights[b]||0)+v*w;}else weights[name]=(weights[name]||0)+v;}
  a.vertices.push(...weighted(p,weights));
 }
 const name=slot+'_attack';skin[slot][name]=slot==='pelvis'?pelvisStrip(meta):a;animation.slots[slot]={attachment:[{name}]};
}
// A continuous original-art sleeve replaces fragmented arm cutouts during the cut.
{
 const anchors=[[430,350,393],[450,343,402],[475,337,413],[510,330,416],[550,320,415],[590,312,416],[615,307,409],[637,302,401],[665,289,391],[700,276,374],[740,262,349],[778,255,326],[795,264,318],[806,266,316]],rows=[];
 for(let j=0;j<anchors.length-1;j++){const a=anchors[j],b=anchors[j+1],steps=Math.ceil((b[0]-a[0])/12);for(let i=0;i<steps;i++){const u=i/steps;rows.push(a.map((v,k)=>v+(b[k]-v)*u));}}rows.push(anchors.at(-1));
 const pts=[],ids=new Map(),cols=8,id=(x,y)=>{const key=x+','+y;if(!ids.has(key)){ids.set(key,pts.length);const [yy,l,r]=rows[y];pts.push([l+(r-l)*x/cols,yy]);}return ids.get(key);};
 for(let x=0;x<=cols;x++)id(x,0);for(let y=1;y<rows.length;y++)id(cols,y);for(let x=cols-1;x>=0;x--)id(x,rows.length-1);for(let y=rows.length-2;y>0;y--)id(0,y);const hull=pts.length,tr=[];
 for(let y=0;y<rows.length-1;y++)for(let x=0;x<cols;x++){const a=id(x,y),b=id(x+1,y),c=id(x+1,y+1),d=id(x,y+1);tr.push(a,b,c,c,d,a);}
 skin.sword_upper_arm.sword_arm_attack={type:'mesh',path:'original-concept',uvs:pts.flatMap(([x,y])=>[x/1024,y/1536]),triangles:tr,vertices:pts.flatMap(p=>weighted(p,armWeights(p))),hull,width:1024,height:1536,edges:Array.from({length:hull},(_,i)=>[i*2,((i+1)%hull)*2]).flat()};
 animation.slots.sword_upper_arm={attachment:[{name:'sword_arm_attack'}]};animation.slots.sword_forearm={attachment:[{name:null}]};
}
// Match reference/attack-pose-user-approved.png: raise the whole sword arm,
// with the elbow above the shoulder and the blade angled over the shield.
// World-angle controls make the shoulder lead the stroke instead of wrist IK
// keeping the upper arm below the shoulder.
const startArm=[W0.sword_upper_arm.a,W0.sword_forearm.a,hand];
const controls=[
 {t:0,arm:startArm,torso:2,hips:[0,-6],head:-1.5},
 {t:.10,arm:[-113,-140,-133],torso:1,hips:[2,-7],head:-2},
 {t:.30,arm:[-226,-250,-275],torso:-1,hips:[6,-5],head:0},
 {t:.43,arm:[-235,-255,-285],torso:-2,hips:[7,-4],head:1},
 {t:.47,arm:[-234,-259,-286],torso:0,hips:[3,-7],head:0},
 {t:.57,arm:[-176,-199,-225],torso:7,hips:[-9,-13],head:-5},
 {t:.68,arm:[-122,-123,-95],torso:9,hips:[-12,-17],head:-6},
 {t:.76,arm:[-119,-120,-91],torso:8,hips:[-11,-16],head:-5},
 {t:1.02,arm:[-107,-116,-89],torso:3,hips:[-2,-8],head:-2},
 {t:T,arm:startArm,torso:2,hips:[0,-6],head:-1.5}
];
const mix=(a,b,t)=>a+(b-a)*t;
function sample(t){
 let index=1;while(index<controls.length-1&&t>controls[index].t+1e-9)index++;
 const a=controls[index-1],b=controls[index],dt=b.t-a.t,u=Math.max(0,Math.min(1,(t-a.t)/dt)),ease=u*u*(3-2*u);
 // A continuous tangent through the middle of the cut avoids braking at .57 s.
 const slope=(i,j)=>controls[i].t===.57?(controls[i+1].arm[j]-controls[i-1].arm[j])/(controls[i+1].t-controls[i-1].t):0;
 const arm=a.arm.map((v,j)=>(2*u**3-3*u*u+1)*v+(u**3-2*u*u+u)*dt*slope(index-1,j)+(-2*u**3+3*u*u)*b.arm[j]+(u**3-u*u)*dt*slope(index,j));
 return {arm,torso:mix(a.torso,b.torso,ease),hips:a.hips.map((v,i)=>mix(v,b.hips[i],ease)),head:mix(a.head,b.head,ease)};
}
const samples=[];
for(let i=0;i<=N;i++){
 const time=i*T/N,c=sample(time),pose=structuredClone(base);pose.hips={x:c.hips[0],y:c.hips[1]};pose.torso={r:c.torso};pose.head={r:c.head};
 for(const side of ['near','far']){solve(pose,side+'_thigh',side+'_shin',W0[side+'_foot'].p,1);absolute(pose,side+'_foot',0);}
 for(const [j,name]of ['sword_upper_arm','sword_forearm','sword_hand'].entries())absolute(pose,name,c.arm[j]);pose.sword={r:0};
 // Keep the raised shield in a stable protective plane as the chest pitches into the blow.
 pose.overhead_upper_arm={r:-(c.torso-2)*.6};
 for(const [name,q] of Object.entries(pose)){const tracks=animation.bones[name]??={};if(q.r!==undefined){const prev=tracks.rotate?.at(-1)?.value;let v=q.r;if(prev!==undefined){while(v-prev>180)v-=360;while(v-prev< -180)v+=360;}q.r=v;(tracks.rotate??=[]).push({time:+time.toFixed(6),value:+v.toFixed(5)});}if(q.x!==undefined||q.y!==undefined)(tracks.translate??=[]).push({time:+time.toFixed(6),x:q.x||0,y:q.y||0});}
 samples.push({time,pose,world:world(pose)});
}
rig.animations.attack_shield_overhead=animation;
fs.writeFileSync(path.join(root,'french-soldier-combat.json'),JSON.stringify(rig));
fs.writeFileSync(path.join(root,'overhead-attack-samples.json'),JSON.stringify({duration:T,fps:30,controls,samples},null,2));
console.log(JSON.stringify({animation:'attack_shield_overhead',duration:T,frames:N,animations:Object.keys(rig.animations),joints:samples.filter((_,i)=>[0,9,13,17,20,36].includes(i)).map(s=>({time:s.time,upper:s.world.sword_upper_arm.a,fore:s.world.sword_forearm.a,hand:s.world.sword_hand.a,blade:s.world.sword.a,wrist:s.world.sword_hand.p}))}));
