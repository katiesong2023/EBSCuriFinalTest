// 공통 폴더 SVG를 크롬용 PNG로 변환한다. 패키징은 public/brand 정본을 복사한다.
const fs=require('node:fs/promises');
(async()=>{
 const {chromium}=require(process.env.CURI_PLAYWRIGHT_MODULE || '/Users/yunseo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
 const browser=await chromium.launch({headless:true,executablePath:process.env.CURI_BROWSER_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage(),svg=await fs.readFile('public/brand/ebs-curi-folder.svg','utf8');
  for(const size of [16,32,48,128]){
   const data=await page.evaluate(async({svg,size})=>{
    const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await image.decode();
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size;canvas.getContext('2d').drawImage(image,0,0,size,size);
    return canvas.toDataURL('image/png').split(',')[1];
   },{svg,size});
   await fs.writeFile(`public/brand/icon-${size}.png`,Buffer.from(data,'base64'));
  }
  console.log('폴더 아이콘 PNG 16/32/48/128px 생성');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
