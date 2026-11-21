import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const manifest=process.argv[2];
if(!manifest)throw Error('Pass the reviewed exam-scope.json path.');
const file=path.join(root,'index.html'),html=fs.readFileSync(file,'utf8');
const parse=id=>JSON.parse(html.match(new RegExp('<script id="'+id+'"[^>]*>([\\s\\S]*?)</script>'))[1]);
const bank=parse('bank-data'),review=JSON.parse(fs.readFileSync(manifest,'utf8'));
const ids=new Set(bank.q.map(q=>q.i)),entries=review.entries.filter(e=>ids.has(e.id));
if(new Set(entries.map(e=>e.id)).size!==ids.size)throw Error('Every integrated question needs one reviewed scope entry.');
if(entries.some(e=>!['core','related','excluded','pending'].includes(e.status)))throw Error('Invalid scope status.');
const summary=Object.fromEntries(['core','related','excluded','pending'].map(s=>[s,entries.filter(e=>e.status===s).length]));
const scope={revision:review.revision,basis:review.basis,note:review.note,subjects:review.subjects,entries,summary};
const json=JSON.stringify(scope).replace(/</g,'\\u003c');
let updated=html.replace(/(<script id="scope-data" type="application\/json">)[\s\S]*?(<\/script>)/,(_,a,b)=>a+json+b);
if(process.argv[3]){
 const source=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
 const corrections={revision:source.revision,basis:source.basis,entries:source.entries.filter(e=>ids.has(e.id)),verifiedEntries:source.verifiedEntries.filter(e=>ids.has(e.id))};
 const data=JSON.stringify(corrections).replace(/</g,'\\u003c');
 updated=updated.replace(/(<script id="correction-data" type="application\/json">)[\s\S]*?(<\/script>)/,(_,a,b)=>a+data+b);
 console.log(JSON.stringify({correctionsPending:corrections.entries.length,correctionsVerified:corrections.verifiedEntries.length}));
}
if(updated===html)console.log('Scope already current.');
else fs.writeFileSync(file,updated);
console.log(JSON.stringify({revision:scope.revision,total:entries.length,...summary}));
