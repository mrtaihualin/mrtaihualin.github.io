// Supabase Edge Function: time-plan-daily-limit
// One successful Auto Plan start per Asia/Taipei day for Guest or Login Free.
// The request contains only an idempotency UUID; it never contains minutes or user identity.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS=[
  'https://mrtaihualin.com','https://www.mrtaihualin.com',
  'https://mrtaihualin.github.io','https://gentle-moxie-bf64ad.netlify.app'
];

function todayTaipei(){
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get=(t:string)=>p.find(x=>x.type===t)?.value||'';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function clientIp(req:Request){
  const first=(req.headers.get('x-forwarded-for')||'').split(',')[0].trim();
  return first||req.headers.get('x-real-ip')||'unknown';
}
async function hashIp(ip:string){
  const bytes=new TextEncoder().encode('time-plan-ip-v1:'+ip);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

serve(async(req)=>{
  const origin=req.headers.get('Origin')||'';
  const allowOrigin=ALLOWED_ORIGINS.includes(origin)?origin:ALLOWED_ORIGINS[0];
  const cors={
    'Access-Control-Allow-Origin':allowOrigin,'Vary':'Origin',
    'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods':'POST, OPTIONS'
  };
  const json=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...cors}});
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
  if(origin&&!ALLOWED_ORIGINS.includes(origin))return json({ok:false,error:'origin_not_allowed'},403);

  try{
    const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if(!url||!key)return json({ok:false,error:'server_config_missing'},500);
    const service=createClient(url,key);

    // A verified user JWT uses the account identity. An anonymous JWT uses a hashed IP.
    const authHeader=req.headers.get('Authorization')||'';
    const token=authHeader.replace(/^Bearer\s+/i,'');
    let identity='';
    if(token){
      const {data}=await service.auth.getUser(token);
      if(data?.user?.id)identity='user:'+data.user.id;
    }
    if(!identity)identity='ip:'+await hashIp(clientIp(req));

    const raw=await req.text();
    if(raw.length>1000)return json({ok:false,error:'invalid_payload_size'},400);
    let parsed:unknown={};
    try{parsed=raw.trim()?JSON.parse(raw):{};}catch{return json({ok:false,error:'malformed_json'},400);}
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return json({ok:false,error:'invalid_payload'},400);
    const body=parsed as Record<string,unknown>,keys=Object.keys(body);
    if(keys.length!==1||keys[0]!=='request_id')return json({ok:false,error:'invalid_payload'},400);
    const requestId=String(body.request_id||'');
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))
      return json({ok:false,error:'invalid_request_id'},400);

    const day=todayTaipei();
    const {data,error}=await service.rpc('time_plan_consume_daily',{
      p_identity_key:identity,p_day:day,p_request_id:requestId
    });
    if(error)return json({ok:false,error:'db_error'},500);
    if(!data||data.ok!==true)return json({ok:false,error:'db_result_invalid'},500);
    if(data.allowed!==true)return json({ok:true,allowed:false,reason:'limit',used:1,cap:1,remaining:0},429);
    return json({ok:true,allowed:true,used:1,cap:1,remaining:0,idempotent:data.idempotent===true,day,loggedIn:identity.startsWith('user:')});
  }catch{return json({ok:false,error:'internal_error'},500);}
});
