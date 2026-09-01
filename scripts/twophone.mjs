import { chromium } from 'playwright';
import { signIn, waitForApp } from './lib/app.mjs';
const CODE = process.argv[2];
const URL = process.env.TEST_URL ?? 'http://localhost:5173';
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

const A = await phone('A');
console.log('login screen shown:', await A.p.getByLabel('Invite code').isVisible());
await signIn(A.p, CODE, 'Matthew');
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
await signIn(B.p, invite, 'Her');
await B.p.waitForTimeout(2500);
const bCard = B.p.locator('section', { has: B.p.getByRole('heading', { name: 'Matthew' }) });
console.log('B sees partner card:', await bCard.count() ? (await bCard.first().innerText()).replace(/\n/g,' | ') : 'NOT FOUND');

// --- offline write survives
await B.ctx.setOffline(true);
for (let i=0;i<3;i++) await B.p.getByRole('button',{name:'+8 oz'}).click();
await B.p.waitForTimeout(1200);
// The permanent "Synced" line is gone; sync only speaks up when it is unhappy.
const trouble = async (page) => {
  const body = await page.locator('body').innerText();
  return /Offline|Sync failed/.test(body) ? body.match(/(Offline[^\n]*|Sync failed[^\n]*)/)[0] : 'no trouble shown';
};
console.log('B offline notice:', await trouble(B.p));
await B.ctx.setOffline(false);
await B.p.waitForTimeout(3000);
console.log('B back online   :', await trouble(B.p));

// --- A pulls her data
await A.p.reload({ waitUntil:'networkidle' });
await waitForApp(A.p);
await A.p.waitForTimeout(3000);
const aCard = A.p.locator('section', { has: A.p.getByRole('heading', { name: 'Her' }) });
console.log('A sees her card :', await aCard.count() ? (await aCard.first().innerText()).replace(/\n/g,' | ') : 'NOT FOUND');

console.log(errs.length ? 'ERRORS:\n'+errs.join('\n') : 'no console errors');
await b.close();
