import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createServer } from 'vite'

let server, browser, origin
const A = '00000000-0000-0000-0000-000000000001'
const B = '00000000-0000-0000-0000-000000000002'
const T = '00000000-0000-0000-0000-000000000003'
const N = '00000000-0000-0000-0000-000000000004'
const trip = (id=T, name='A 여행', revision=1) => ({ id, name, revision, created_at: '2026-10-07T00:00:00Z', trip_dates: [], places: [{ id: N, name:'카페', memo:'메모', category:'cafe', created_at:'2026-10-07T00:00:00Z' }] })
const token = user => 'header.' + Buffer.from(JSON.stringify({sub:user})).toString('base64url') + '.signature'
const session = (user=A, expiresAt=Date.now()+3600000) => ({userId:user, email:user===A?'a@test.invalid':'b@test.invalid', accessToken:token(user), refreshToken:'refresh-'+user, expiresAt})
const auth = user => ({access_token:token(user), refresh_token:'next-'+user, expires_in:3600, user:{id:user,email:'b@test.invalid'}})
const json = (route, value, status=200) => route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)})
const until = async predicate => {
  const start=Date.now()
  while(!await predicate()) { if(Date.now()-start>8000) throw new Error('Condition timed out'); await new Promise(resolve=>setTimeout(resolve,20)) }
}
before(async () => {
  process.env.VITE_SUPABASE_URL='https://supabase.test.invalid'
  process.env.VITE_SUPABASE_ANON_KEY='test-public-key'
  server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'})
  await server.listen()
  origin=server.resolvedUrls.local[0].replace(/\/$/,'')
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
})
after(async () => { await browser?.close(); await server?.close() })
async function fixture(options={}) {
  const context=await browser.newContext({viewport:{width:390,height:844}})
  const page=await context.newPage()
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  await page.route('**/seed',route=>route.fulfill({contentType:'text/html',body:'<html></html>'}))
  await page.goto(origin+'/seed')
  await page.evaluate(async ({active,copies,pending,lastUser})=> {
    if(active) {localStorage.setItem('travel-helper.session',JSON.stringify(active));localStorage.setItem('travel-helper.last-user',active.userId)}
    if(lastUser) localStorage.setItem('travel-helper.last-user',lastUser)
    if(pending) localStorage.setItem('travel-helper.pending-write',JSON.stringify(pending))
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('travel-helper',1);r.onupgradeneeded=()=>r.result.createObjectStore('trip-snapshots',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
    const tx=db.transaction('trip-snapshots','readwrite')
    for(const row of copies) tx.objectStore('trip-snapshots').put(row)
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)})
    db.close()
    sessionStorage.setItem('travel-helper.pkce-verifier','test-verifier')
  },{active: options.active===null?null:options.active??session(),copies:options.copies??[],pending:options.pending,lastUser:options.lastUser})
  if(options.failIDB) await page.addInitScript(()=>{indexedDB.open=()=>{throw new Error('test IDB unavailable')}})
  if(options.failDelete) await page.addInitScript(()=>{
    const original=IDBObjectStore.prototype.openCursor
    IDBObjectStore.prototype.openCursor=function(...args) {
      if(this.transaction.mode==='readwrite' && localStorage.getItem('test.fail-delete')!=='off') throw new Error('test delete failure')
      return original.apply(this,args)
    }
  })
  await page.route('https://supabase.test.invalid/**',options.route??(route=>json(route,[trip()])))
  return {page,context,errors,close:()=>context.close()}
}
const rows = page => page.evaluate(async()=>{
  const db=await new Promise(resolve=>{const r=indexedDB.open('travel-helper',1);r.onsuccess=()=>resolve(r.result)})
  const tx=db.transaction('trip-snapshots','readonly');const r=tx.objectStore('trip-snapshots').getAll()
  const values=await new Promise(resolve=>{r.onsuccess=()=>resolve(r.result)});db.close();return values
})
const copy = (user=A, value=trip()) => ({key:user+':'+value.id,formatVersion:1,userId:user,trip:value,savedAt:'2026-10-07T00:00:00Z'})

test('StrictMode OAuth exchange once, account A cleared even when B read fails',async()=>{
  let exchanges=0
  const f=await fixture({copies:[copy()],route:route=>{
    if(route.request().url().includes('/auth/')) {exchanges++;return json(route,auth(B))}
    return json(route,{message:'offline'},503)
  }})
  try {
    await f.page.goto(origin+'/?code=test-code')
    await f.page.getByRole('heading',{name:'여행 목록'}).waitFor()
    assert.equal(await f.page.getByText('A 여행',{exact:true}).count(),0)
    assert.equal(exchanges,1)
    assert.equal((await rows(f.page)).filter(row=>row.userId===A).length,0)
    assert.deepEqual(f.errors,[])
  } finally {await f.close()}
})

test('delayed account read cannot recreate snapshots or UI after logout',async()=>{
  let release;let held=false
  const f=await fixture({route:async route=>{held=true;await new Promise(resolve=>{release=resolve});await json(route,[trip()])}})
  try {
    await f.page.goto(origin+'/')
    await until(()=>held)
    await f.page.getByRole('button',{name:'로그아웃',exact:true}).click()
    release()
    await f.page.getByRole('button',{name:'Google로 로그인'}).waitFor()
    await f.page.waitForTimeout(150)
    assert.equal((await rows(f.page)).length,0)
    assert.equal(await f.page.getByText('A 여행',{exact:true}).count(),0)
    assert.deepEqual(f.errors,[])
  } finally {await f.close()}
})

test('in-flight IndexedDB replacement is drained before logout deletes it',async()=>{
  const f=await fixture()
  try {
    await f.page.goto(origin+'/');await f.page.getByRole('heading',{name:'여행 목록'}).waitFor()
    await f.page.evaluate(()=>{
      const open=indexedDB.open.bind(indexedDB)
      let first=true
      indexedDB.open=(...args)=>{
        const request=open(...args)
        if(first) {
          first=false
          Object.defineProperty(request,'onsuccess',{set(callback){
            request.addEventListener('success',event=>{
              document.querySelector('.header-actions button')?.click()
              setTimeout(()=>callback.call(request,event),200)
            },{once:true})
          }})
        }
        return request
      }
    })
    await f.page.getByRole('button',{name:/A 여행/}).click()
    await f.page.getByRole('button',{name:'Google로 로그인'}).waitFor()
    await f.page.waitForTimeout(300)
    assert.equal((await rows(f.page)).length,0)
    assert.deepEqual(f.errors,[])
  } finally {await f.close()}
})

test('failed cleanup blocks login across reload and supports retry',async()=>{
  const f=await fixture({copies:[copy()],failDelete:true})
  try {
    await f.page.goto(origin+'/');await f.page.getByRole('heading',{name:'여행 목록'}).waitFor()
    await f.page.getByRole('button',{name:'로그아웃',exact:true}).click()
    await f.page.getByRole('button',{name:'사본 정리 재시도'}).waitFor()
    assert.equal(await f.page.getByRole('button',{name:'Google로 로그인'}).isDisabled(),true)
    await f.page.reload();await f.page.getByRole('button',{name:'사본 정리 재시도'}).waitFor()
    assert.equal(await f.page.getByRole('button',{name:'Google로 로그인'}).isDisabled(),true)
    await f.page.evaluate(()=>localStorage.setItem('test.fail-delete','off'))
    await f.page.getByRole('button',{name:'사본 정리 재시도'}).click()
    await until(async()=>!await f.page.getByRole('button',{name:'Google로 로그인'}).isDisabled())
    assert.equal((await rows(f.page)).length,0)
    assert.deepEqual(f.errors,[])
  } finally {await f.close()}
})

test('unavailable IndexedDB does not block server login, reads or saving',async()=>{
  const f=await fixture({failIDB:true,route:route=>route.request().url().includes('rpc/create_trip')?json(route,N):json(route,[trip(N,'서버 여행')])})
  try {
    await f.page.goto(origin+'/');await f.page.getByRole('heading',{name:'여행 목록'}).waitFor()
    await f.page.getByLabel('새 여행 이름').fill('서버 여행')
    await f.page.getByRole('button',{name:'만들기',exact:true}).click()
    await until(async()=>(await f.page.getByRole('status').textContent()).includes('서버 저장은 완료됐지만'))
    assert.equal(await f.page.getByRole('button',{name:'만들기',exact:true}).isDisabled(),false)
    assert.deepEqual(f.errors,[])
  } finally {await f.close()}
})

test('lost create response blocks resubmission, persists on reload and requires server review',async()=>{
  let creates=0
  const f=await fixture({route:route=>{
    if(route.request().url().includes('rpc/create_trip')){creates++;return route.abort('failed')}
    return json(route,[trip(N,'別のサーバー旅行')])
  }})
  try {
    await f.page.goto(origin+'/');await f.page.getByRole('heading',{name:'여행 목록'}).waitFor()
    await f.page.getByLabel('새 여행 이름').fill('새 여행')
    await f.page.getByRole('button',{name:'만들기',exact:true}).click()
    await f.page.getByText('저장 결과 확인 필요',{exact:true}).waitFor()
    assert.equal(await f.page.getByRole('button',{name:'만들기',exact:true}).isDisabled(),true)
    await f.page.reload();await f.page.getByText('저장 결과 확인 필요',{exact:true}).waitFor()
    assert.equal(creates,1)
    await f.page.getByRole('button',{name:'서버 최신본 확인',exact:true}).click()
    await f.page.getByRole('button',{name:'서버 내용을 확인했습니다'}).click()
    assert.equal(await f.page.getByLabel('새 여행 이름').inputValue(),'')
    assert.equal(creates,1)
    assert.deepEqual(f.errors,[])
  } finally {await f.close()}
})

test('acknowledged create with failed read keeps server success and recovers by ID',async()=>{
  let failRead=false;let creates=0
  const f=await fixture({route:route=>{
    if(route.request().url().includes('rpc/create_trip')) {creates++;failRead=true;return json(route,N)}
    if(failRead)return json(route,{message:'unavailable'},503)
    return json(route,[trip(N,'서버 새 여행')])
  }})
  try {
    await f.page.goto(origin+'/');await f.page.getByRole('heading',{name:'여행 목록'}).waitFor()
    await f.page.getByLabel('새 여행 이름').fill('서버 새 여행')
    await f.page.getByRole('button',{name:'만들기',exact:true}).click()
    await f.page.getByText('서버 저장 완료 · 후속 확인 필요',{exact:true}).waitFor()
    assert.equal(await f.page.getByRole('button',{name:'만들기',exact:true}).isDisabled(),true)
    failRead=false
    await f.page.getByRole('button',{name:'서버 최신본 확인',exact:true}).click()
    await until(async()=>(await f.page.getByText('서버 저장 완료 · 후속 확인 필요',{exact:true}).count())===0)
    assert.equal(creates,1)
    assert.equal(await f.page.getByRole('heading',{name:'서버 새 여행',exact:true}).count(),1)
    assert.deepEqual(f.errors,[])
  } finally {await f.close()}
})

test('refresh token is single-flight; expired/401 authentication becomes read-only',async()=>{
  let refreshes=0;let rejectReads=false
  const f=await fixture({active:session(A,Date.now()+500),copies:[copy()],route:async route=>{
    if(route.request().url().includes('/auth/')) {refreshes++;await new Promise(resolve=>setTimeout(resolve,100));return json(route,auth(A))}
    return rejectReads?json(route,{message:'expired'},401):json(route,[trip()])
  }})
  try {
    await f.page.goto(origin+'/')
    await f.page.evaluate(()=>{window.dispatchEvent(new Event('online'));document.dispatchEvent(new Event('visibilitychange'))})
    await f.page.getByRole('heading',{name:'여행 목록'}).waitFor()
    assert.equal(refreshes,1)
    rejectReads=true
    await f.page.evaluate(()=>window.dispatchEvent(new Event('online')))
    await f.page.getByRole('button',{name:'Google로 로그인'}).waitFor()
    assert.equal(await f.page.getByLabel('새 여행 이름').count(),0)
    await f.page.getByRole('button',{name:/A 여행/}).click()
    await f.page.getByRole('heading',{name:'A 여행',exact:true}).waitFor()
    await f.page.getByRole('button',{name:'로그아웃',exact:true}).click()
    assert.equal((await rows(f.page)).length,0)
    assert.deepEqual(f.errors,[])
  } finally {await f.close()}
})

test('reconnect preserves dirty input; explicit latest updates list and selected revision',async()=>{
  let revision=1;let queries=0
  const f=await fixture({route:route=>{queries++;return json(route,[trip(T,'A 여행',revision)])}})
  try {
    await f.page.goto(origin+'/');await f.page.getByRole('heading',{name:'여행 목록'}).waitFor()
    await f.page.getByRole('button',{name:/A 여행/}).click()
    await f.page.getByLabel('여행 날짜 추가').fill('2026-10-10')
    const before=queries;revision=2
    await f.page.evaluate(()=>window.dispatchEvent(new Event('online')))
    await f.page.getByRole('button',{name:'현재 입력 유지'}).waitFor()
    assert.equal(await f.page.getByLabel('여행 날짜 추가').inputValue(),'2026-10-10')
    assert.ok(queries>before)
    await f.page.getByRole('button',{name:'현재 입력 유지'}).click()
    assert.match(await f.page.locator('.revision-line').textContent(),/revision 1/)
    await f.page.getByRole('button',{name:'최신본 확인',exact:true}).click()
    await f.page.getByRole('button',{name:'최신본 적용'}).click()
    assert.match(await f.page.locator('.revision-line').textContent(),/revision 2/)
    assert.match(await f.page.locator('.trip-item small').textContent(),/revision 2/)
    assert.deepEqual(f.errors,[])
  } finally {await f.close()}
})

test('snapshot schema and atomic replacement preserve old complete copy on aborted write',async()=>{
  const f=await fixture()
  try {
    await f.page.goto(origin+'/');await f.page.getByRole('heading',{name:'여행 목록'}).waitFor()
    await until(async()=>(await rows(f.page)).length===1)
    const result=await f.page.evaluate(async({user,B,value})=>{
      const {saveSnapshot,listSnapshots}=await import('/src/data/offline.ts')
      const existing=await listSnapshots(user)
      const put=IDBObjectStore.prototype.put
      IDBObjectStore.prototype.put=function(...args){const r=put.apply(this,args);this.transaction.abort();return r}
      let failed=false
      try {await saveSnapshot({formatVersion:1,userId:user,trip:{...value,revision:2},savedAt:new Date().toISOString()})} catch {failed=true}
      IDBObjectStore.prototype.put=put
      return {failed,existing,retained:await listSnapshots(user),other:await listSnapshots(B)}
    },{user:A,B,value:trip()})
    assert.equal(result.failed,true)
    assert.equal(result.retained[0].trip.revision,1)
    assert.equal(result.retained[0].formatVersion,1)
    assert.deepEqual(result.retained[0].trip.places,trip().places)
    assert.deepEqual(result.other,[])
    assert.deepEqual(f.errors,[])
  } finally {await f.close()}
})

test('unsupported offline snapshot is not offered; login-start rejection is handled',async()=>{
  const old={...copy()};delete old.formatVersion
  const f=await fixture({active:null,lastUser:A,copies:[old]})
  try {
    await f.page.goto(origin+'/');await f.page.getByRole('button',{name:'Google로 로그인'}).waitFor()
    assert.equal(await f.page.getByText('A 여행',{exact:true}).count(),0)
    await f.page.evaluate(async()=>{
      const {workspace}=await import('/src/data/workspace.ts')
      const digest=crypto.subtle.digest.bind(crypto.subtle)
      crypto.subtle.digest=()=>Promise.reject(new Error('test-login-error'))
      await workspace.login()
      crypto.subtle.digest=digest
    })
    assert.match(await f.page.getByRole('status').textContent(),/test-login-error/)
    assert.deepEqual(f.errors,[])
  } finally {await f.close()}
})

test('missing create ID is uncertain; no automatic repeated create',async()=>{
  let creates=0
  const f=await fixture({route:route=>{
    if(route.request().url().includes('rpc/create_trip')) {creates++;return json(route,null)}
    return json(route,[])
  }})
  try {
    await f.page.goto(origin+'/');await f.page.getByRole('heading',{name:'여행 목록'}).waitFor()
    await f.page.getByLabel('새 여행 이름').fill('생성 결과 없음')
    await f.page.getByRole('button',{name:'만들기',exact:true}).click()
    await f.page.getByText('저장 결과 확인 필요',{exact:true}).waitFor()
    assert.equal(creates,1)
    assert.equal(await f.page.getByRole('button',{name:'만들기',exact:true}).isDisabled(),true)
    assert.deepEqual(f.errors,[])
  } finally {await f.close()}
})

test('acknowledged date write with 204 and failed follow-up read retains success',async()=>{
  let dates=0;let failRead=false
  const updated={...trip(),revision:2,trip_dates:[{id:N,travel_date:'2026-10-10'}]}
  const f=await fixture({route:route=>{
    if(route.request().url().includes('rpc/add_trip_date')) {dates++;failRead=true;return route.fulfill({status:204})}
    if(failRead) return json(route,{message:'unavailable'},503)
    return json(route,[dates?updated:trip()])
  }})
  try {
    await f.page.goto(origin+'/');await f.page.getByRole('heading',{name:'여행 목록'}).waitFor()
    await f.page.getByRole('button',{name:/A 여행/}).click()
    await f.page.getByLabel('여행 날짜 추가').fill('2026-10-10')
    await f.page.getByRole('button',{name:'날짜 추가',exact:true}).click()
    await f.page.getByText('서버 저장 완료 · 후속 확인 필요',{exact:true}).waitFor()
    failRead=false
    await f.page.getByRole('button',{name:'서버 최신본 확인',exact:true}).click()
    await until(async()=>(await f.page.locator('.revision-line').textContent()).includes('revision 2'))
    assert.equal(dates,1)
    assert.equal(await f.page.locator('time[datetime="2026-10-10"]').count(),1)
    assert.deepEqual(f.errors,[])
  } finally {await f.close()}
})

test('expired offline account can read its prepared copy and explicitly clear it',async()=>{
  const f=await fixture({active:session(A,Date.now()+120000),copies:[copy()]})
  try {
    await f.page.clock.install()
    await f.page.goto(origin+'/');await f.page.getByRole('heading',{name:'여행 목록'}).waitFor()
    await f.context.setOffline(true)
    await f.page.clock.fastForward(120001)
    await f.page.getByRole('heading',{name:'저장된 여행 사본'}).waitFor()
    await f.page.getByRole('button',{name:/A 여행/}).click()
    await f.page.getByRole('heading',{name:'A 여행',exact:true}).waitFor()
    assert.equal(await f.page.getByRole('button',{name:'날짜 추가',exact:true}).count(),0)
    await f.page.getByRole('button',{name:'로그아웃',exact:true}).click()
    assert.equal((await rows(f.page)).length,0)
    assert.deepEqual(f.errors,[])
  } finally {await f.close()}
})

test('failed refresh keeps the selected revision and date input, conflict never overwrites',async()=>{
  let fail=false;let mutations=0
  const f=await fixture({route:route=>{
    if(route.request().url().includes('rpc/add_trip_date')) {mutations++;return json(route,{code:'40001',message:'conflict'},500)}
    return fail?json(route,{message:'offline'},503):json(route,[trip()])
  }})
  try {
    await f.page.goto(origin+'/');await f.page.getByRole('heading',{name:'여행 목록'}).waitFor()
    await f.page.getByRole('button',{name:/A 여행/}).click()
    await f.page.getByLabel('여행 날짜 추가').fill('2026-10-10')
    fail=true
    await f.page.getByRole('button',{name:'최신본 확인',exact:true}).click()
    await until(async()=>(await f.page.getByRole('status').textContent()).includes('현재 사본과 입력은 유지'))
    assert.match(await f.page.locator('.revision-line').textContent(),/revision 1/)
    assert.equal(await f.page.getByLabel('여행 날짜 추가').inputValue(),'2026-10-10')
    fail=false
    await f.page.getByRole('button',{name:'날짜 추가',exact:true}).click()
    await until(async()=>(await f.page.getByRole('status').textContent()).includes('다른 기기'))
    assert.equal(mutations,1)
    assert.match(await f.page.locator('.revision-line').textContent(),/revision 1/)
    assert.deepEqual(f.errors,[])
  } finally {await f.close()}
})

test('same-account reauthentication does not delete a prepared offline copy',async()=>{
  const f=await fixture({copies:[copy()],route:route=>route.request().url().includes('/auth/')?json(route,auth(A)):json(route,{message:'offline'},503)})
  try {
    await f.page.goto(origin+'/?code=same-account')
    await f.page.getByRole('heading',{name:'여행 목록'}).waitFor()
    assert.equal((await rows(f.page)).length,1)
    await f.page.getByRole('button',{name:/A 여행/}).click()
    await until(async()=>(await f.page.locator('.revision-line').textContent()).includes('열람 전용'))
    assert.deepEqual(f.errors,[])
  } finally {await f.close()}
})

test('late token refresh cannot restore a session after logout',async()=>{
  let held=false;let release
  const f=await fixture({active:session(A,Date.now()-1),copies:[copy()],route:async route=>{
    if(route.request().url().includes('/auth/')) {held=true;await new Promise(resolve=>{release=resolve});return json(route,auth(A))}
    return json(route,[trip()])
  }})
  try {
    await f.page.goto(origin+'/');await until(()=>held)
    await f.page.getByRole('button',{name:'로그아웃',exact:true}).click()
    release()
    await f.page.getByRole('button',{name:'Google로 로그인'}).waitFor()
    await f.page.waitForTimeout(150)
    assert.equal(await f.page.evaluate(()=>localStorage.getItem('travel-helper.session')),null)
    assert.equal((await rows(f.page)).length,0)
    assert.deepEqual(f.errors,[])
  } finally {await f.close()}
})
