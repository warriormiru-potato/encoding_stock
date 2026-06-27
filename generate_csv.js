const fs = require('fs');
const path = require('path');
const { COMPANIES, QUIZ_BANK, SCENARIOS, BREAKING_NEWS } = require('./data.js');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

// 1. companies.csv
let compCsv = 'id,name,desc,basePrice\n';
COMPANIES.forEach(c => {
  compCsv += `${c.id},${c.name},"${c.desc}",${c.basePrice}\n`;
});
fs.writeFileSync(path.join(dataDir, 'companies.csv'), compCsv, 'utf-8');

// 2. quiz.csv
let quizCsv = 'id,type,question,options,answer,explain\n';
QUIZ_BANK.forEach(q => {
  const options = q.options ? q.options.join('|') : '';
  quizCsv += `${q.id},${q.type},"${q.question}","${options}",${q.answer},"${q.explain}"\n`;
});
fs.writeFileSync(path.join(dataDir, 'quiz.csv'), quizCsv, 'utf-8');

// 3. news.csv
let newsCsv = 'id,type,companyId,text,impactMin,impactMax\n';
BREAKING_NEWS.forEach(n => {
  newsCsv += `${n.id},${n.type},${n.companyId},"${n.text}",${n.impact.min},${n.impact.max}\n`;
});
fs.writeFileSync(path.join(dataDir, 'news.csv'), newsCsv, 'utf-8');

// 4. scenarios.csv
let scCsv = 'scenarioId,scenarioTitle,scenarioDesc,round,hint,corefab,nextmemory,nanodesign,gwangseong,chemicalwave,packagingworld\n';
SCENARIOS.forEach(s => {
  s.rounds.forEach(r => {
    scCsv += `${s.id},"${s.title}","${s.description}",${r.round},"${r.hint}",${r.changes.corefab || 0},${r.changes.nextmemory || 0},${r.changes.nanodesign || 0},${r.changes.gwangseong || 0},${r.changes.chemicalwave || 0},${r.changes.packagingworld || 0}\n`;
  });
});
fs.writeFileSync(path.join(dataDir, 'scenarios.csv'), scCsv, 'utf-8');

console.log("CSV files generated successfully in /data folder.");
