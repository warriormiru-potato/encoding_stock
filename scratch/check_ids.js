const { loadGameData } = require('../sheetParser');
loadGameData().then(data => {
  console.log("COMPANIES:", data.COMPANIES);
  console.log("SCENARIOS keys:", Object.keys(data.SCENARIOS[0].rounds[0].changes));
}).catch(err => {
  console.error(err);
});
