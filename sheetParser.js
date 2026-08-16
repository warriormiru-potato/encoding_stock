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

// JSON (JSON API / Google Apps Script / GViz JSON) 및 CSV 자동 감지 파서
function parseRawData(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];
  const trimmed = rawText.trim();

  // 1. 표준 JSON 응답 ({...} 또는 [...])
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.data)) return parsed.data;
      if (parsed && Array.isArray(parsed.items)) return parsed.items;
      if (parsed && Array.isArray(parsed.rows)) return parsed.rows;
    } catch (e) {
      console.warn("JSON 파싱 실패, CSV 파서로 전환합니다.");
    }
  }

  // 2. Google Visualization API gviz/tq JSON 응답
  if (trimmed.includes('google.visualization.Query.setResponse')) {
    try {
      const jsonStr = trimmed.substring(trimmed.indexOf('{'), trimmed.lastIndexOf('}') + 1);
      const gvizData = JSON.parse(jsonStr);
      if (gvizData && gvizData.table) {
        const cols = gvizData.table.cols.map(c => c.label || c.id);
        return gvizData.table.rows.map(r => {
          const obj = {};
          if (r.c) {
            r.c.forEach((cell, idx) => {
              const colName = cols[idx];
              if (colName) obj[colName] = cell ? cell.v : "";
            });
          }
          return obj;
        });
      }
    } catch (e) {
      console.warn("GViz JSON 파싱 실패, CSV 파서로 전환합니다.");
    }
  }

  // 3. 기본 CSV 파싱
  return parse(trimmed, { columns: true, skip_empty_lines: true });
}

async function loadGameData() {
  const companiesCsv = await fetchCsv(GAME_CONFIG.GOOGLE_SHEETS.COMPANIES_URL, 'data/companies.csv');
  const quizCsv = await fetchCsv(GAME_CONFIG.GOOGLE_SHEETS.QUIZ_URL, 'data/quiz.csv');
  const newsCsv = await fetchCsv(GAME_CONFIG.GOOGLE_SHEETS.NEWS_URL, 'data/news.csv');
  const scCsv = await fetchCsv(GAME_CONFIG.GOOGLE_SHEETS.SCENARIOS_URL, 'data/scenarios.csv');
  const itemsCsv = await fetchCsv(GAME_CONFIG.GOOGLE_SHEETS.ITEMS_URL, 'data/items.csv');

  // Parse Companies (JSON or CSV)
  const rawCompanies = parseRawData(companiesCsv);
  const COMPANIES = rawCompanies.map(c => ({
    id: c.id,
    name: c.name,
    desc: c.desc,
    basePrice: parseInt(c.basePrice, 10),
    maxBuyR1: parseInt(c.maxBuyR1, 10) || 9999,
    maxBuyR2: parseInt(c.maxBuyR2, 10) || 9999,
    maxBuyR3: parseInt(c.maxBuyR3, 10) || 9999,
    maxBuyR4: parseInt(c.maxBuyR4, 10) || 9999,
    maxBuyR5: parseInt(c.maxBuyR5, 10) || 9999
  }));

  // Parse Items
  const rawItems = parseRawData(itemsCsv);
  const ITEMS = rawItems.map(item => ({
    id: item.id,
    name: item.name,
    desc: item.desc
  }));

  // Parse Quiz
  const rawQuiz = parseRawData(quizCsv);
  const QUIZ_BANK = rawQuiz.map(q => ({
    id: parseInt(q.id, 10),
    type: q.type,
    question: q.question,
    options: (typeof q.options === 'string') ? q.options.split('|') : q.options,
    answer: q.type === 'OX' ? q.answer : parseInt(q.answer, 10),
    explain: q.explain
  }));

  // Parse News
  const rawNews = parseRawData(newsCsv);
  const BREAKING_NEWS = rawNews.map(n => ({
    id: parseInt(n.id, 10),
    type: n.type,
    companyId: n.companyId,
    text: n.text,
    impact: { min: parseInt(n.impactMin, 10), max: parseInt(n.impactMax, 10) }
  }));

  // Parse Scenarios
  const rawScenarios = parseRawData(scCsv);
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

    const companyIdMap = {};
    COMPANIES.forEach(c => {
      if (c.id) companyIdMap[c.id.toLowerCase()] = c.id;
    });

    const changes = {};
    Object.keys(r).forEach(k => {
      if (k && k.trim() !== "") {
        const kLower = k.trim().toLowerCase();
        if (companyIdMap[kLower] && r[k] !== undefined && r[k] !== "") {
          changes[companyIdMap[kLower]] = parseInt(r[k], 10);
        }
      }
    });

    // company-specific hints: hint_companyid (e.g. hint_jswtech)
    const companyHints = {};
    Object.keys(r).forEach(k => {
      if (k && k.trim().toLowerCase().startsWith('hint_')) {
        const compIdLower = k.trim().substring(5).toLowerCase();
        if (companyIdMap[compIdLower]) {
          companyHints[companyIdMap[compIdLower]] = r[k];
        }
      }
    });

    scMap[sId].rounds.push({
      round: parseInt(r.round, 10),
      companyHints: companyHints,
      changes: changes
    });
  });

  const SCENARIOS = Object.values(scMap);

  return { COMPANIES, QUIZ_BANK, BREAKING_NEWS, SCENARIOS, ITEMS };
}

module.exports = { loadGameData };
