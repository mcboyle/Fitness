import { chromium } from 'playwright';
import { signIn } from './lib/app.mjs';
const CODE = process.argv[2], URL=process.env.TEST_URL ?? 'http://localhost:5173';
const b = await chromium.launch(); const errs=[];
async function phone(label){
  const ctx=await b.newContext({viewport:{width:390,height:844}});
  const p=await ctx.newPage();
  p.on('pageerror',e=>errs.push(`${label}: ${e}`.slice(0,160)));
  p.on('console',m=>m.type()==='error'&&errs.push(`${label} console: ${m.text()}`.slice(0,160)));
  await p.goto(URL,{waitUntil:'networkidle'}); return {ctx,p};
}
async function login(p,code,name){
  await signIn(p, code, name);
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
// A month grid now, not a rolling window: whole weeks, so a cell count is a
// multiple of 7 per person.
const cal=await A.p.locator('section').filter({hasText:'Both streaks'}).first();
console.log('8 shared calendar    :', (await cal.innerText()).replace(/\n/g,' | ').slice(0,70));
const cells=await cal.locator('div[aria-label]').count();
console.log('9 both rows rendered :', cells>0 && cells%7===0 ? `PASS - ${cells} cells across ${cells/7} week-rows` : `*** FAIL cells=${cells} ***`);

/*
 * A rolling goal earned on an EARLIER day must still count, for both people.
 * The partner's window used to be built from their row for the selected date
 * alone, so a workout vanished from their weekly count the moment the date
 * rolled over — invisible in any same-day test.
 */
{
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(process.env.TEST_DB ?? 'data/lifestyle.db');
  const twoDaysAgo = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
  const seq = () => { db.prepare('UPDATE sync_seq SET n = n + 1').run();
    return db.prepare('SELECT n FROM sync_seq').get().n; };
  const her = await B.p.evaluate(() => JSON.parse(localStorage.getItem('lt.session')).user_id);
  db.prepare(`INSERT OR REPLACE INTO daily_log
      (user_id,date,workout_minutes,workout_type,updated_at,server_seq)
      VALUES (?,?,45,'pilates',?,?)`)
    .run(her, twoDaysAgo, new Date().toISOString(), seq());
  db.close();

  await A.p.reload({ waitUntil: 'networkidle' });
  await A.p.waitForSelector('[data-testid=day-header]');
  await A.p.waitForTimeout(3500);
  const strip = (await A.p.locator('section').filter({ hasText: 'Last 7 days' }).first().innerText())
    .replace(/\n+/g, ' | ');
  const herRow = strip.slice(strip.indexOf('Her'));
  console.log('W1 partner workout 2d ago:', /Workouts \| 1\/4/.test(herRow) ? 'PASS - counts across days' : '*** FAIL: ' + herRow.slice(0, 60) + ' ***');
}

// --- reactions: she reacts to his day, he sees it on next open
await B.p.getByRole('button',{name:'Today'}).click(); await B.p.waitForTimeout(1500);
const bar = B.p.getByRole('button',{name:/React .* to Matthew's day/});
console.log('R1 react affordance  :', await bar.count()?'PASS - visible on partner card':'*** FAIL - none ***');
if (await bar.count()) {
  await bar.first().click(); await B.p.waitForTimeout(1500);
  await B.p.getByLabel('Note').fill('proud of you');
  await B.p.getByRole('button',{name:'Send'}).click(); await B.p.waitForTimeout(1800);
  await A.p.reload({waitUntil:'networkidle'}); await A.p.waitForSelector('[data-testid=day-header]'); await A.p.waitForTimeout(3000);
  const inbox = await A.p.locator('body').innerText();
  console.log('R2 he sees inbox     :', /new reaction/.test(inbox)?'PASS - '+(/(\d+) new reaction/.exec(inbox)||[])[0]:'*** FAIL ***');
  console.log('R3 note text         :', /proud of you/.test(inbox)?'PASS':'*** FAIL ***');
  await A.p.getByRole('button',{name:'Mark all seen'}).click(); await A.p.waitForTimeout(1500);
  console.log('R4 dismisses         :', /new reaction/.test(await A.p.locator('body').innerText())?'*** FAIL ***':'PASS - cleared');
}

// The outbox draining is the real proof a write reached the server. Without
// this, a 500 on push is invisible: the local row exists and the UI looks fine.
await A.p.waitForTimeout(2500);
const trouble = await A.p.locator('body').innerText();
console.log('10 outbox drained    :', /Offline|Sync failed/.test(trouble)?'*** FAIL - sync unhappy ***':'PASS - no sync trouble');
const serverSide = await A.p.evaluate(async () => {
  const s = JSON.parse(localStorage.getItem('lt.session'));
  const r = await fetch('/api/v1/sync?since=0', { headers:{ Authorization:`Bearer ${s.token}` }});
  const j = await r.json();
  return { docs: j.rows.documentaries.length, meas: j.rows.measurements.length };
});
console.log('11 on the server     :', JSON.stringify(serverSide), serverSide.docs===1&&serverSide.meas===1?'PASS':'*** FAIL ***');

console.log(errs.length?'ERRORS:\n'+errs.join('\n'):'no console errors');
await b.close();

// --- reactions (appended after the calendar checks)
