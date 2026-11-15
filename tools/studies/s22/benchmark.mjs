// Standalone JS field microbenchmark, not a browser/frame release result.
// Uses installed Node; installs nothing and imports no production code.
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
const here=new URL('.',import.meta.url);
const input=JSON.parse(fs.readFileSync(new URL('vectors.json',here),'utf8'));
const fields=JSON.parse(fs.readFileSync(new URL('field.json',here),'utf8')).funnels.map(f=>({
  ...f,mouth:f.center.map((c,i)=>c-62500*f.axis[i])
}));
const cell=140000, bound=Math.hypot(62500,20000), buckets=new Map();
for (const f of fields) {
  const lo=f.center.map(x=>Math.floor((x-bound)/cell));
  const hi=f.center.map(x=>Math.floor((x+bound)/cell));
  for(let x=lo[0];x<=hi[0];x++) for(let y=lo[1];y<=hi[1];y++) for(let z=lo[2];z<=hi[2];z++) {
    const key=`${x},${y},${z}`;
    if(!buckets.has(key)) buckets.set(key,[]);
    buckets.get(key).push(f);
  }
}
const smooth=u=>{u=Math.max(0,Math.min(1,u));return u*u*u*(10+u*(-15+6*u));};
function kernel(p,t,force,candidates) {
  for(const f of candidates) {
    if(t<f.on)continue;
    const bx=p[0]-f.center[0],by=p[1]-f.center[1],bz=p[2]-f.center[2];
    if(bx*bx+by*by+bz*bz>bound*bound)continue;
    const dx=p[0]-f.mouth[0],dy=p[1]-f.mouth[1],dz=p[2]-f.mouth[2],n=f.axis;
    const s=dx*n[0]+dy*n[1]+dz*n[2];
    if(s<=0||s>=125000)continue;
    const rho=Math.hypot(dx-s*n[0],dy-s*n[1],dz-s*n[2]);
    const u=Math.min(1,s/120000),r=1000+19000*(1-u)**2;
    let w=smooth(s/5000)*smooth((125000-s)/5000)*smooth((r-rho)/Math.min(2000,r/4));
    if(f.on>0)w*=smooth((t-f.on)/120);
    if(w===0)continue;
    const g=w*(.02+.08*u*u)*(s<120000?1:-1),k=2*w*(force[0]*n[0]+force[1]*n[1]+force[2]*n[2]);
    return [g*n[0],g*n[1],g*n[2],force[0]-k*n[0],force[1]-k*n[1],force[2]-k*n[2]];
  }
  return [0,0,0,...force];
}
const candidates=p=>buckets.get(p.map(x=>Math.floor(x/cell)).join(','))??[];
let maxError=0;
for(const q of input.kernel_queries) {
  const expected=[...q.pull_m_s2,...q.modified_force_N];
  const a=kernel(q.position_m,q.t_s,q.force_N,fields),b=kernel(q.position_m,q.t_s,q.force_N,candidates(q.position_m));
  for(let i=0;i<6;i++) {
    maxError=Math.max(maxError,Math.abs(a[i]-expected[i]));
    if(Math.abs(a[i]-expected[i])>1e-7||a[i]!==b[i])throw Error('Python/index parity failed');
  }
}
let sink=0;
function batch(indexed,count,missOnly=false) {
  const start=performance.now();
  for(let i=0;i<count;i++) {
    const q=input.kernel_queries[i%input.kernel_queries.length];
    const p=missOnly?[-2e6,-2e6,-2e6]:q.position_m;
    const a=kernel(p,5000,q.force_N,indexed?candidates(p):fields);sink+=a[0]+a[3]*1e-10;
  }
  return (performance.now()-start)*1000/count;
}
batch(false,10000);batch(true,10000);
const trials=Array.from({length:9},()=>({naive_us:batch(false,5000),indexed_us:batch(true,5000),
                                     full_miss_us:batch(false,5000,true)}));
const median=key=>trials.map(t=>t[key]).sort((a,b)=>a-b)[4];
const result={scope:'Node standalone; warmed 9 batches of 5000 queries, not browser frames',
  node:process.version,funnels:fields.length,python_vectors:input.kernel_queries.length,max_abs_parity_error:maxError,
  maximum_bucket_population:Math.max(...[...buckets.values()].map(a=>a.length)),trials,
  median_naive_us:median('naive_us'),median_indexed_us:median('indexed_us'),
  median_rejected_funnel_ns:median('full_miss_us')*1000/fields.length,
  indexed_4x_cpu_four_evaluations_eight_ticks_ms:median('indexed_us')*4*4*8/1000,
  sink,warning:'4x is arithmetic sensitivity, not actual CPU throttling; optics, sensing, ship systems and rendering excluded'};
fs.writeFileSync(new URL('performance.json',here),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
