// 재요청 없이, 이미 보관한 공식 응답의 제공 방식 표기를 기존 목록과 대조한다.
const fs = require('node:fs/promises');
const { openBroadcastStore } = require('./broadcast-store');
const { applyOfficialDetail, sameTitle, sameEpisode } = require('./source-enrichment');
async function main() {
  const file='docs/r12-description-repair-fetch.json';
  const report=JSON.parse(await fs.readFile(file,'utf8'));
  if(report.processed!==report.targets)throw Error('공식 대조 종료 후 실행합니다.');
  const db=openBroadcastStore();
  let recovered=0;
  try {
    for(let i=0;i<report.rows.length;i++) {
      const result=report.rows[i];
      if(result.status!=='MISMATCH')continue;
      const row=db.prepare('SELECT * FROM episodes WHERE id=?').get(result.id);
      const record=db.prepare('SELECT record FROM source_enrichments WHERE source_id=? ORDER BY checked_at DESC LIMIT 1').get(row.id);
      if(!record)continue;
      const event=JSON.parse(record.record),detail=event.detail;
      if(!sameTitle(row,detail.title)||!sameEpisode(row.url,detail.url)||!sameEpisode(row.url,detail.finalUrl))continue;
      const updated=applyOfficialDetail(db,row.id,detail,{checkedAt:event.checkedAt,expectedHash:row.content_hash});
      const replacement={...result,...updated,cachedOfficialResponse:true,previousStatus:result.status};
      report.rows[i]=replacement;
      await fs.appendFile('docs/r12-description-repair-fetch.jsonl',JSON.stringify(replacement)+'\n');
      recovered++;
    }
  } finally { db.close(); }
  report.deliveryVariantRecovered=report.rows.filter(row=>row.cachedOfficialResponse).length;
  report.counts={};for(const row of report.rows)report.counts[row.status]=(report.counts[row.status]||0)+1;
  await fs.writeFile(file,JSON.stringify(report,null,2)+'\n');
  console.log({recovered,counts:report.counts,paidApiCalls:0,additionalHttpRequests:0});
}
main().catch(error=>{console.error(error);process.exitCode=1});
