const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const output = path.resolve(__dirname, '../../.test-output/evaluation');
const fixtures = path.join(output, 'fixtures');
const name = process.argv[2] || 'latest';
const compact = value => String(value).replace(/\s+/g, ' ').trim().toLowerCase();

async function main() {
  const run = await fs.mkdtemp(path.join(output, 'api-'));
  Object.assign(process.env, { DB_FILE:path.join(run,'test.db'), UPLOAD_DIR:path.join(run,'uploads'), PROCESSED_DIR:path.join(run,'processed'), OLLAMA_MODEL:'', JWT_SECRET:crypto.randomBytes(32).toString('hex') });
  await require('../../dist/database/db').getDb();
  const app = require('../../dist/app').default;
  const server = await new Promise(resolve => { const s=app.listen(0,'127.0.0.1',()=>resolve(s)); });
  const base = 'http://127.0.0.1:'+server.address().port+'/api';
  let token;
  const request = async (endpoint, options={}) => {
    const res=await fetch(base+endpoint,{...options,headers:{...(token?{Authorization:'Bearer '+token}:{}),...options.headers}});
    if(!res.ok) throw new Error(endpoint+' HTTP '+res.status+' '+await res.text());
    return res;
  };
  const post=body=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const report={scope:'Synthetic layout benchmark, not population accuracy',date:'2026-10-09',documents:[],summary:{}};
  try {
    await request('/auth/register',post({email:'evaluation@example.test',password:'EvaluationOnly123!',fullName:'Synthetic Evaluation'}));
    token=(await (await request('/auth/login',post({email:'evaluation@example.test',password:'EvaluationOnly123!'}))).json()).token;
    const manifest=JSON.parse(await fs.readFile(path.join(fixtures,'manifest.json'),'utf8'));
    for(const expected of manifest.documents){
      const bytes=await fs.readFile(path.join(fixtures,expected.file));
      const form=new FormData();form.append('file',new Blob([bytes],{type:'application/pdf'}),expected.file);
      const id=(await (await request('/documents/upload',{method:'POST',body:form})).json()).document.id;
      let doc;
      for(let i=0;i<600;i++) {doc=(await (await request('/documents/'+id)).json()).document;if(['Completed','Failed'].includes(doc.status))break;await new Promise(resolve=>setTimeout(resolve,100));}
      const result={file:expected.file,status:doc.status,failureReason:doc.failureReason,classification:{expected:expected.type,actual:doc.documentType,pass:expected.type===doc.documentType},pageCount:{expected:expected.pageCount,actual:doc.pagesCount,pass:expected.pageCount===doc.pagesCount},methods:{expected:expected.methods,actual:doc.pages?.map(p=>p.extractionMethod),pass:JSON.stringify(expected.methods)===JSON.stringify(doc.pages?.map(p=>p.extractionMethod))},fields:[],items:[],questions:[],actualFields:doc.extractedFields,pages:doc.pages};
      for(const field of expected.fields){
        const actual=(doc.extractedFields||[]).filter(f=>f.label===field.label&&f.page===field.page);
        const match=actual.find(f=>compact(f.value)===compact(field.value));
        const source=match&&doc.pages.find(p=>p.page===match.page);
        result.fields.push({...field,pass:!!match&&!!source?.text.includes(match.snippet),actual:actual.map(f=>f.value),error:!actual.length?'missing':!match?'incorrect':!source?.text.includes(match.snippet)?'invalid provenance':null});
      }
      for(const item of expected.items){const match=doc.lineItems?.find(i=>i.description===item.description&&i.page===item.page);result.items.push({...item,pass:!!match&&['quantity','unitPrice','amount'].every(k=>compact(match[k])===compact(item[k])),actual:match});}
      if(doc.status==='Completed')for(const expectedQuestion of expected.questions){
        const answer=(await (await request('/documents/'+id+'/questions',post({question:expectedQuestion.question}))).json()).message;
        const refused=answer.text===require('../../dist/processing/document.answerer').NOT_FOUND;
        const correctness=expectedQuestion.refusal?refused:!refused&&expectedQuestion.values.every(v=>compact(answer.text).includes(compact(v)))&&(expectedQuestion.passage||!answer.text.startsWith('Relevant document passages:'));
        const validSources=(answer.citations||[]).every(c=>c.source===expected.file&&c.snippet?.trim()&&doc.pages.some(p=>p.page===c.page&&p.text.includes(c.snippet)));
        const citationCorrectness=expectedQuestion.refusal?refused&&!answer.citations?.length:!!answer.citations?.length&&validSources&&expectedQuestion.pages.every(p=>answer.citations.some(c=>c.page===p))&&answer.citations.every(c=>expectedQuestion.pages.includes(c.page))&&expectedQuestion.values.every(v=>answer.citations.some(c=>compact(c.snippet).includes(compact(v)))||/^\d+$/.test(v)&&/distinct .* numbers/.test(answer.text));
        result.questions.push({...expectedQuestion,text:answer.text,citations:answer.citations,answerPass:correctness,citationPass:citationCorrectness,pass:correctness&&citationCorrectness});
      }
      report.documents.push(result);
      console.log(expected.file+': '+result.fields.filter(f=>f.pass).length+'/'+result.fields.length+' fields; '+result.questions.filter(q=>q.pass).length+'/'+expected.questions.length+' Q&A');
    }
    const fields=report.documents.flatMap(d=>d.fields),questions=report.documents.flatMap(d=>d.questions),items=report.documents.flatMap(d=>d.items);
    const positives=questions.filter(q=>!q.refusal),negatives=questions.filter(q=>q.refusal);
    report.summary={documents:report.documents.length,completed:report.documents.filter(d=>d.status==='Completed').length,classification:report.documents.filter(d=>d.classification.pass).length,fields:{correct:fields.filter(f=>f.pass).length,total:fields.length,missing:fields.filter(f=>f.error==='missing').length,incorrect:fields.filter(f=>f.error==='incorrect').length},items:{correct:items.filter(i=>i.pass).length,total:items.length},answers:{correct:questions.filter(q=>q.answerPass).length,total:questions.length},citations:{correct:positives.filter(q=>q.citationPass).length,total:positives.length},refusals:{correct:negatives.filter(q=>q.pass).length,total:negatives.length},fullyCorrect:{correct:questions.filter(q=>q.pass).length,total:questions.length}};
    await fs.writeFile(path.join(output,name+'.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report.summary,null,2));
    if(name!=='baseline'&&(report.summary.fullyCorrect.correct!==questions.length || fields.some(f=>!f.pass) || items.some(i=>!i.pass) || report.documents.some(d=>d.status!=='Completed'||!d.classification.pass||!d.pageCount.pass||!d.methods.pass)))process.exitCode=1;
  }finally{await new Promise(resolve=>server.close(resolve));await (await require('../../dist/database/db').getDb()).close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
