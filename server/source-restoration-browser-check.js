const assert=require('node:assert/strict'),fs=require('node:fs/promises');
async function main(){
 const base='http://localhost:3000';const cases=[],queries=[];
 for(const q of ['제시 피난 생활','천연벽지 제작','자석']){const response=await fetch(base+'/api/curi/discover?'+new URLSearchParams({workspace:'teacher',q}));assert.equal(response.status,200);const data=await response.json();assert.ok(data.total>0);queries.push({q,total:data.total,results:data.results.map(item=>({id:item.id,title:item.title,summary:item.summary,sourceSupplements:item.sourceSupplements,searchExplanation:item.searchExplanation}))});}
 const magnet=queries[2];assert.equal(magnet.total,2);assert.ok(magnet.results.every(item=>item.searchExplanation.supplementEvidence.length>0));cases.push('실제3000: 새 소개문2검색·공식 자막 자석2회차 검색');
 for(const item of magnet.results)for(const quote of item.searchExplanation.supplementEvidence){const source=item.sourceSupplements.find(s=>s.id===quote.supplementId);assert.equal(source.text.slice(quote.start,quote.end),quote.quote);}cases.push('자기 회차 보조 원문 인용 slice 대조');
 const {chromium}=await import(process.env.CURI_PLAYWRIGHT_MODULE);const browser=await chromium.launch({headless:true,executablePath:process.env.CURI_BROWSER_EXECUTABLE});
 try{const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
 await page.goto(base+'/?q='+encodeURIComponent('자석'));await page.waitForFunction(()=>document.querySelector('#result-cards')?.getAttribute('aria-busy')==='false');
 await page.locator('#result-cards .semantic-details > summary').first().click();await page.locator('#result-cards .source-supplement > summary').first().click();const text=await page.locator('#result-cards').innerText();assert.match(text,/공식 보조 원문/);assert.ok(await page.locator('#result-cards .selection-reason blockquote').count()>0);assert.match(text,/크레파스|두 가지 극/);assert.match(text,/미확인/);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await page.screenshot({path:'docs/r07-21-magnet-mobile.png',fullPage:true});cases.push('390px 실화면: 자막 인용·붙지 않는 물체 근거·영상 미확인·오류/넘침0');
 await page.locator('[data-save]').first().click();await page.reload();await page.waitForFunction(()=>document.querySelector('#result-cards')?.getAttribute('aria-busy')==='false');assert.ok(Number(await page.locator('#shelf-count').innerText())>0);cases.push('기존 개인 저장·새로고침 유지');
 await fs.writeFile('docs/r07-21-running-browser-check.json',JSON.stringify({generatedAt:new Date().toISOString(),queries,cases,pageErrors:errors,paidApiCalls:0,playback:'NOT_CHECKED'},null,2)+'\n');console.log(cases.length,'live HTTP/browser checks passed');
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
