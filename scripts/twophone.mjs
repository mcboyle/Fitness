import { chromium } from 'playwright';
const CODE = process.argv[2];
const URL = 'http://localhost:5173';
const b = await chromium.launch();
const errs = [];

async function phone(label) {
  const ctx = await b.newContext({ viewport:{width:390,height:844} });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(`${label} pageerror: ${e}`));
  p.on('console', m => m.type()==='error' && errs.push(`${label} console: ${m.text()}`));
  await p.goto(URL, { waitUntil:'networkidle' });
  return { ctx, p };
}

async function login(p, code, name) {
  await p.getByLabel('Invite code').fill(code);
  await p.getByLabel('Your name').fill(name);
  await p.getByRole('button', { name:'Join' }).click();
  await p.waitForSelector('text=streak', { timeout:15000 });
}

// --- his phone
const A = await phone('A');
console.log('login screen shown:', await A.p.getByLabel('Invite code').isVisible());
await login(A.p, CODE, 'Matthew');
console.log('A signed in, header rendered');

// mint her code from his session
const invite = await A.p.evaluate(async () => {
  const s = JSON.parse(localStorage.getItem('lt.session'));
  const r = await fetch('/api/v1/invite', { method:'POST', headers:{ Authorization:`Bearer ${s.token}` }});
  return (await r.json()).invite_code;
});
console.log('her invite code:', invite);

// A logs a full day
for (let i=0;i<10;i++) { await A.p.getByRole('button',{name:'+8 oz'}).click(); await A.p.waitForTimeout(120); }
await A.p.getByRole('button',{name:/Self-Care/}).click();
await A.p.getByRole('button',{name:/Daily Journal/}).click();
await A.p.waitForTimeout(1500);
console.log('A logged:', (await A.p.locator('ul').first().innerText()).replace(/\n/g,' | '));

// --- her phone
const B = await phone('B');
await login(B.p, invite, 'Her');
await B.p.waitForTimeout(2500);
const bCard = B.p.locator('section', { has: B.p.getByRole('heading', { name: 'Matthew' }) });
console.log('B sees partner card:', await bCard.count() ? (await bCard.first().innerText()).replace(/\n/g,' | ') : 'NOT FOUND');

// --- offline write survives
await B.ctx.setOffline(true);
for (let i=0;i<3;i++) await B.p.getByRole('button',{name:'+8 oz'}).click();
await B.p.waitForTimeout(1200);
console.log('B offline footer:', (await B.p.locator('footer').innerText()).replace(/\n/g,' | '));
await B.ctx.setOffline(false);
await B.p.waitForTimeout(3000);
console.log('B back online   :', (await B.p.locator('footer').innerText()).replace(/\n/g,' | '));

// --- A pulls her data
await A.p.reload({ waitUntil:'networkidle' });
await A.p.waitForSelector('text=streak');
await A.p.waitForTimeout(3000);
const aCard = A.p.locator('section', { has: A.p.getByRole('heading', { name: 'Her' }) });
console.log('A sees her card :', await aCard.count() ? (await aCard.first().innerText()).replace(/\n/g,' | ') : 'NOT FOUND');

console.log(errs.length ? 'ERRORS:\n'+errs.join('\n') : 'no console errors');
await b.close();
