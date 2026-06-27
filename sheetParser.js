const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { GAME_CONFIG } = require('./config');

async function fetchCsv(url, fallbackPath) {
  if (url && url.trim() !== "") {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.text();
      } else {
        console.warn(`Failed to fetch from Google Sheets (${url}), falling back to local file.`);
      }
    } catch (e) {
      console.warn(`Network error fetching Google Sheets (${url}), falling back to local file.`);
    }
  }
  // Fallback to local
  return fs.readFileSync(path.join(__dirname, fallbackPath), 'utf-8');
}

async function loadGameData() {
  const companiesCsv = await fetchCsv(GAME_CONFIG.GOOGLE_SHEETS.COMPANIES_URL, 'data/companies.csv');
  const quizCsv = await fetchCsv(GAME_CONFIG.GOOGLE_SHEETS.QUIZ_URL, 'data/quiz.csv');
  const newsCsv = await fetchCsv(GAME_CONFIG.GOOGLE_SHEETS.NEWS_URL, 'data/news.csv');
  const scCsv = await fetchCsv(GAME_CONFIG.GOOGLE_SHEETS.SCENARIOS_URL, 'data/scenarios.csv');

  // Parse Companies
  const rawCompanies = parse(companiesCsv, { columns: true, skip_empty_lines: true });
  const COMPANIES = rawCompanies.map(c => ({
    id: c.id,
    name: c.name,
    desc: c.desc,
    basePrice: parseInt(c.basePrice, 10)
  }));

  // Parse Quiz
  const rawQuiz = parse(quizCsv, { columns: true, skip_empty_lines: true });
  const QUIZ_BANK = rawQuiz.map(q => ({
    id: parseInt(q.id, 10),
    type: q.type,
    question: q.question,
    options: q.options ? q.options.split('|') : undefined,
    answer: q.type === 'OX' ? q.answer : parseInt(q.answer, 10),
    explain: q.explain
  }));

  // Parse News
  const rawNews = parse(newsCsv, { columns: true, skip_empty_lines: true });
  const BREAKING_NEWS = rawNews.map(n => ({
    id: parseInt(n.id, 10),
    type: n.type,
    companyId: n.companyId,
    text: n.text,
    impact: { min: parseInt(n.impactMin, 10), max: parseInt(n.impactMax, 10) }
  }));

  // Parse Scenarios
  const rawScenarios = parse(scCsv, { columns: true, skip_empty_lines: true });
  const scMap = {};
  rawScenarios.forEach(r => {
    const sId = parseInt(r.scenarioId, 10);
    if (!scMap[sId]) {
      scMap[sId] = {
        id: sId,
        title: r.scenarioTitle,
        description: r.scenarioDesc,
        rounds: []
      };
    }
    
    const changes = {};
    Object.keys(r).forEach(k => {
      if (!['scenarioId', 'scenarioTitle', 'scenarioDesc', 'round', 'hint'].includes(k)) {
        if (r[k]) changes[k] = parseInt(r[k], 10);
      }
    });

    scMap[sId].rounds.push({
      round: parseInt(r.round, 10),
      hint: r.hint,
      changes: changes
    });
  });
  
  const SCENARIOS = Object.values(scMap);

  return { COMPANIES, QUIZ_BANK, BREAKING_NEWS, SCENARIOS };
}

module.exports = { loadGameData };
