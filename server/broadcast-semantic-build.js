const fs = require('node:fs/promises');
const { DatabaseSync } = require('node:sqlite');
const { loadDiscoveryCatalog } = require('./discovery-catalog');
const { indexFile, sourceKey, specKey } = require('./broadcast-semantic-index');
const { createLocalEmbedder } = require('./local-embedding');
const { sourceSentences } = require('./source-explanation');
const { assessSourceText } = require('./source-text-quality');
async function main() {
  const catalog = await loadDiscoveryCatalog();
  const items = [...new Map([...catalog.resources,...catalog.searchVariants].map(item=>[item.id,item])).values()];
  const temporary = indexFile+'.building';
  const db = new DatabaseSync(temporary);
  db.exec('CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE IF NOT EXISTS passages(resource_id TEXT,source_key TEXT,field TEXT,start INTEGER,end INTEGER,quote TEXT,vector BLOB,PRIMARY KEY(resource_id,field,start))');
  if (db.prepare('SELECT value FROM metadata WHERE key=?').get('spec')?.value !== specKey) db.exec('DELETE FROM passages');
  db.prepare('INSERT OR REPLACE INTO metadata VALUES (?,?)').run('spec',specKey);
  const upsert = db.prepare('INSERT OR REPLACE INTO passages VALUES(?,?,?,?,?,?,?)');
  const existing = new Map(db.prepare('SELECT resource_id,source_key,field,start FROM passages').all().map(row=>[`${row.resource_id}:${row.field}:${row.start}`,row.source_key]));
  const embedder = createLocalEmbedder();
  const started = Date.now();let embedded=0,reused=0,tokens=0,truncated=0;
  try {
    for (let i=0; i<items.length; i++) {
      const item=items[i], key=sourceKey(item), passages=[{field:'title',start:0,end:item.title.length,quote:item.title}];
      if(assessSourceText(item.title,item.summary).detailedMappingAllowed) {
        let chunk;
        for(const sentence of sourceSentences(item.summary)) {
          // 원문 위치를 보존해 문장 묶음을 준비한다. 지나치게 긴 문장은 별도 보류한다.
          if(sentence.quote.length>700)continue;
          if(chunk && sentence.end-chunk.start>450){passages.push(chunk);chunk=null;}
          chunk=chunk?{...chunk,end:sentence.end,quote:item.summary.slice(chunk.start,sentence.end)}:{...sentence};
        }
        if(chunk)passages.push(chunk);
      }
      for(const passage of passages) {
        if(existing.get(`${item.id}:${passage.field}:${passage.start}`)===key){reused++;continue;}
        const result=await embedder.embed(`passage: ${passage.field==='title'?'':item.title+'\n'}${passage.quote}`);
        if(result.truncated){truncated++;continue;}
        const vector=new Float32Array(result.vector);tokens+=result.inputTokens;
        upsert.run(item.id,key,passage.field,passage.start,passage.end,passage.quote,new Uint8Array(vector.buffer));embedded++;
      }
      if((i+1)%1000===0)console.log(JSON.stringify({processed:i+1,total:items.length,embedded,reused,seconds:Math.round((Date.now()-started)/1000)}));
    }
    const current=new Map(items.map(item=>[item.id,sourceKey(item)]));
    for(const row of db.prepare('SELECT DISTINCT resource_id,source_key FROM passages').all())if(current.get(row.resource_id)!==row.source_key)db.prepare('DELETE FROM passages WHERE resource_id=? AND source_key=?').run(row.resource_id,row.source_key);
    const report={generatedAt:new Date().toISOString(),resources:items.length,passages:db.prepare('SELECT count(*) n FROM passages').get().n,embedded,reused,tokens,truncated,elapsedMs:Date.now()-started,peakRssBytes:process.resourceUsage().maxRSS*1024,paidApiCalls:0,specKey};
    db.close();await fs.rename(temporary,indexFile);await fs.writeFile(process.argv[2]||'docs/r07-19-semantic-build.json',JSON.stringify(report,null,2)+'\n');console.log(report);
  } finally {await embedder.close();if(db.isOpen)db.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
