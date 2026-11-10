import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {writeFile} from 'node:fs/promises';

const [browser,url,widthText,heightText,profile,screenshot]=process.argv.slice(2);
const width=Number(widthText),height=Number(heightText);
const chrome=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
  '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`,
  `--window-size=${width},${height}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
let stderr='',socket,nextId=0;const pending=new Map();
chrome.stderr.on('data',chunk=>{stderr+=chunk.toString();});
chrome.on('error',error=>{stderr+=error.message;});
const deadline=Date.now()+35000;
const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{
  const id=++nextId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
});
try{
  let endpoint;
  while(!(endpoint=stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1])){
    if(chrome.exitCode!==null||Date.now()>deadline)throw new Error('Chrome did not start: '+stderr.slice(-1000));await delay(30);
  }
  socket=new WebSocket(endpoint);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data),waiter=pending.get(message.id);if(!waiter)return;
    pending.delete(message.id);message.error?waiter.reject(new Error(JSON.stringify(message.error))):waiter.resolve(message.result);
  });
  const {targetId}=await send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<480},sessionId);
  await send('Page.enable',{},sessionId);await send('Page.navigate',{url},sessionId);
  let report;
  while(Date.now()<deadline){
    const output=await send('Runtime.evaluate',{expression:'({result:document.body?.dataset.result,error:document.body?.dataset.error,checks:document.body?.dataset.checks,width:innerWidth})',returnByValue:true},sessionId);
    report=output.result?.value;if(report?.result)break;await delay(40);
  }
  if(report?.result!=='pass')throw new Error(JSON.stringify(report));
  if(screenshot){const image=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},sessionId);await writeFile(screenshot,Buffer.from(image.data,'base64'));}
  process.stdout.write(JSON.stringify(report));await send('Target.closeTarget',{targetId});
}catch(error){process.stderr.write(error.stack+'\n');process.exitCode=1;}
finally{socket?.close();chrome.kill('SIGTERM');}
