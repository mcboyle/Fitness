import { chromium } from 'playwright';
const CODE = process.argv[2], URL='http://localhost:5173';
const b = await chromium.launch(); const errs=[];
async function phone(label){
  const ctx=await b.newContext({viewport:{width:390,height:844}});
  const p=await ctx.newPage();
  p.on('pageerror',e=>errs.push(`${label}: ${e}`.slice(0,160)));
  p.on('console',m=>m.type()==='error'&&errs.push(`${label} console: ${m.text()}`.slice(0,160)));
  await p.goto(URL,{waitUntil:'networkidle'}); return {ctx,p};
}
async function login(p,code,name){
  await p.getByLabel('Invite code').fill(code);
  await p.getByLabel('Your name').fill(name);
  await p.getByRole('button',{name:'Join'}).click();
  await p.waitForSelector('text=streak',{timeout:15000});
}
const A=await phone('A'); await login(A.p,CODE,'Matthew');
const invite=await A.p.evaluate(async()=>{const s=JSON.parse(localStorage.getItem('lt.session'));
  const r=await fetch('/api/v1/invite',{method:'POST',headers:{Authorization:`Bearer ${s.token}`}});return (await r.json()).invite_code;});
const B=await phone('B'); await login(B.p,invite,'Her');

// --- documentaries
await A.p.getByRole('button',{name:'+ log a documentary'}).click();
await A.p.getByLabel('Documentary title').fill('Free Solo');
await A.p.getByRole('button',{name:'Add',exact:true}).click();
await A.p.waitForTimeout(1500);
console.log('1 documentary        :', (await A.p.locator('section').filter({hasText:'DOCUMENTARIES'}).first().innerText()).replace(/\n/g,' | '));

// --- measurements
await A.p.getByRole('button',{name:'Body'}).click(); await A.p.waitForTimeout(400);
await A.p.getByLabel('Weight').fill('182.4');
await A.p.getByLabel('Waist').fill('34');
await A.p.getByRole('button',{name:'Save measurement'}).click();
await A.p.waitForTimeout(1500);
console.log('2 measurement saved  :', (await A.p.locator('section').filter({hasText:'Weight'}).nth(1).innerText()).replace(/\n/g,' | ').slice(0,60));

// --- photos: upload, default private, share, partner sees
await A.p.getByRole('button',{name:'Photos'}).click(); await A.p.waitForTimeout(400);
const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0000003010100b5a7a1e40000000049454e44ae426082','hex');
await A.p.setInputFiles('input[type=file]',{name:'p.png',mimeType:'image/png',buffer:png});
await A.p.waitForTimeout(2500);
const aPhotos=await A.p.locator('section').filter({hasText:'Yours'}).first().innerText();
console.log('3 upload default     :', /private/.test(aPhotos)?'PASS - private':'*** FAIL ***');

await B.p.getByRole('button',{name:'Photos'}).click(); await B.p.waitForTimeout(2000);
const bBefore=await B.p.locator('body').innerText();
console.log('4 partner sees it?   :', /hasn't shared any photos/.test(bBefore)?'PASS - hidden':'*** FAIL LEAK ***');

await A.p.getByRole('button',{name:'Share',exact:true}).click(); await A.p.waitForTimeout(1500);
await B.p.reload({waitUntil:'networkidle'}); await B.p.getByRole('button',{name:'Photos'}).click(); await B.p.waitForTimeout(2500);
const bImgs=await B.p.locator('img[alt^="Progress photo"]').count();
console.log('5 after share        :', bImgs===1?'PASS - she sees 1 photo':`*** FAIL (${bImgs}) ***`);
const loaded=await B.p.locator('img[alt^="Progress photo"]').first().evaluate(i=>i.naturalWidth>0);
console.log('6 image bytes render :', loaded?'PASS':'*** FAIL - broken image ***');

await A.p.getByRole('button',{name:'Unshare'}).click(); await A.p.waitForTimeout(1500);
await B.p.reload({waitUntil:'networkidle'}); await B.p.getByRole('button',{name:'Photos'}).click(); await B.p.waitForTimeout(2000);
console.log('7 after unshare      :', /hasn't shared any photos/.test(await B.p.locator('body').innerText())?'PASS - gone':'*** FAIL ***');

// --- calendar
await A.p.getByRole('button',{name:'Calendar'}).click(); await A.p.waitForTimeout(800);
const cal=await A.p.locator('section').filter({hasText:'Last 35 days'}).first().innerText();
console.log('8 shared calendar    :', cal.replace(/\n/g,' | ').slice(0,80));
const cells=await A.p.locator('section').filter({hasText:'Last 35 days'}).first().locator('div[aria-label]').count();
console.log('9 both rows rendered :', cells===70?`PASS - ${cells} cells (2 users x 35)`:`cells=${cells}`);

// The outbox draining is the real proof a write reached the server. Without
// this, a 500 on push is invisible: the local row exists and the UI looks fine.
await A.p.waitForTimeout(2500);
const footer = await A.p.locator('footer').innerText();
console.log('10 outbox drained    :', /Synced/.test(footer)?'PASS - '+footer.split('\n')[0]:'*** FAIL: '+footer.replace(/\n/g,' ')+' ***');
const serverSide = await A.p.evaluate(async () => {
  const s = JSON.parse(localStorage.getItem('lt.session'));
  const r = await fetch('/api/v1/sync?since=0', { headers:{ Authorization:`Bearer ${s.token}` }});
  const j = await r.json();
  return { docs: j.rows.documentaries.length, meas: j.rows.measurements.length };
});
console.log('11 on the server     :', JSON.stringify(serverSide), serverSide.docs===1&&serverSide.meas===1?'PASS':'*** FAIL ***');

console.log(errs.length?'ERRORS:\n'+errs.join('\n'):'no console errors');
await b.close();
