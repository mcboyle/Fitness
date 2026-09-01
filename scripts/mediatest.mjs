const A='http://localhost:8787/api/v1';
const j=async r=>{const t=await r.text();try{return JSON.parse(t)}catch{return{_raw:t.slice(0,80),_status:r.status}}};
const post=(p,b,t)=>fetch(A+p,{method:'POST',headers:{'content-type':'application/json',...(t?{Authorization:`Bearer ${t}`}:{})},body:JSON.stringify(b??{})}).then(j);
const get=(p,t)=>fetch(A+p,{headers:t?{Authorization:`Bearer ${t}`}:{}}).then(j);
const raw=(u,t)=>fetch(u.startsWith('http')?u:'http://localhost:8787'+u,{headers:t?{Authorization:`Bearer ${t}`}:{}});

const me=await post('/claim',{invite_code:process.argv[2],display_name:'Matthew'});
const inv=await post('/invite',{},me.token);
const her=await post('/claim',{invite_code:inv.invite_code,display_name:'Her'});

// upload a real PNG
const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0000003010100b5a7a1e40000000049454e44ae426082','hex');
const fd=new FormData();
fd.append('taken_on','2026-09-01');
fd.append('file',new Blob([png],{type:'image/png'}),'progress.png');
const up=await fetch(A+'/media',{method:'POST',headers:{Authorization:`Bearer ${me.token}`},body:fd}).then(j);
console.log('1  uploaded          ', JSON.stringify(up));

console.log('2  default visibility', up.visibility, up.visibility==='private'?'PASS':'*** FAIL ***');

const herList=await get('/media',her.token);
console.log('3  partner list      ', herList.media.length===0?'PASS - private photo invisible':`*** FAIL: ${JSON.stringify(herList.media)} ***`);

const herUrl=await get(`/media/${up.id}/url`,her.token);
console.log('4  partner url       ', herUrl.error?`PASS - ${herUrl.error}`:'*** FAIL: got a URL ***');

const mine=await get('/media',me.token);
console.log('5  owner list        ', mine.media.length===1?'PASS':'*** FAIL ***', '| storage_path leaked?', 'storage_path' in mine.media[0]?'*** YES - FAIL ***':'no - PASS');

const myUrl=await get(`/media/${up.id}/url`,me.token);
console.log('6  owner url         ', myUrl.url?'PASS':'*** FAIL ***');
const bytes=await raw(myUrl.url);
console.log('7  owner fetches file', bytes.status===200?`PASS (${bytes.headers.get('content-type')})`:`*** FAIL ${bytes.status} ***`);

// tamper with the signature
const tampered=myUrl.url.replace(/sig=([0-9a-f])/,(m,c)=>'sig='+(c==='0'?'1':'0'));
console.log('8  tampered signature', (await raw(tampered)).status===403?'PASS - 403':'*** FAIL ***');

// her viewer id substituted into his signed URL
const swapped=myUrl.url.replace(/v=[^&]+/,'v='+her.user.id);
console.log('9  viewer-id swap    ', (await raw(swapped)).status===403?'PASS - 403':'*** FAIL ***');

// expired
const expired=myUrl.url.replace(/exp=\d+/,'exp=1000000000');
console.log('10 expired url       ', (await raw(expired)).status===403?'PASS - 403':'*** FAIL ***');

// now share it
await post(`/media/${up.id}/visibility`,{visibility:'shared'},me.token);
const herList2=await get('/media',her.token);
const herUrl2=await get(`/media/${up.id}/url`,her.token);
const herBytes=await raw(herUrl2.url);
console.log('11 after sharing     ', herList2.media.length===1&&herBytes.status===200?'PASS - she sees it':'*** FAIL ***');

// she cannot change visibility on his photo
console.log('12 partner unshare   ', (await post(`/media/${up.id}/visibility`,{visibility:'private'},her.token)).error?'PASS - refused':'*** FAIL ***');

// unshare, then reuse her still-valid signed URL
await post(`/media/${up.id}/visibility`,{visibility:'private'},me.token);
const afterUnshare=await raw(herUrl2.url);
console.log('13 unshare kills live URL', afterUnshare.status===404?'PASS - 404 despite valid signature':`*** FAIL ${afterUnshare.status} ***`);
const herList3=await get('/media',her.token);
console.log('14 gone from her list', herList3.media.length===0?'PASS':'*** FAIL ***');
