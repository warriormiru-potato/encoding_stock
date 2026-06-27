// 반도체 모의투자 게임 데이터 파일 (data.js)
// 이 파일을 수정하여 가상 기업 목록, 퀴즈 은행, 라운드 시나리오, 긴급 뉴스 목록을 쉽게 추가/수정/삭제할 수 있습니다.
// 
// [가이드라인]
// 1. 기업 추가: COMPANIES 배열에 { id: "아이디", name: "기업명", desc: "설명", basePrice: 기본주가 } 형식으로 추가합니다.
// 2. 퀴즈 추가: QUIZ_BANK 배열에 새로운 퀴즈 객체를 추가합니다. OX형과 4지선다형(CHOICE)을 지원합니다.
//    - OX형: { id: 번호, type: "OX", question: "문제내용", answer: "O" 또는 "X", explain: "해설내용" }
//    - 객관식: { id: 번호, type: "CHOICE", question: "문제내용", options: ["보기1", "보기2", "보기3", "보기4"], answer: 정답인덱스(0부터 시작), explain: "해설내용" }
// 3. 시나리오 추가/수정: SCENARIOS 배열의 각 시나리오와 라운드 힌트, 주가 변동률(changes)을 설정합니다.
// 4. 뉴스 추가: BREAKING_NEWS 배열에 뉴스를 등록합니다. 주가 변동 영향 범위(impact min/max)도 조절 가능합니다.

// 6개 가상 반도체 기업 정의
const COMPANIES = [
  { id: "corefab", name: "코어팹", desc: "파운드리 (위탁 생산)", basePrice: 100000 },
  { id: "nextmemory", name: "넥스트메모리", desc: "메모리 반도체 (DRAM, NAND)", basePrice: 80000 },
  { id: "nanodesign", name: "나노디자인", desc: "팹리스 (설계 전문)", basePrice: 120000 },
  { id: "gwangseong", name: "광성레이저", desc: "장비 (노광 및 제조)", basePrice: 150000 },
  { id: "chemicalwave", name: "케미칼웨이브", desc: "소재 (특수 가스, 웨이퍼)", basePrice: 50000 },
  { id: "packagingworld", name: "패키징월드", desc: "후공정 (패키징, 테스트)", basePrice: 60000 }
];

// 기초 수준의 반도체 관련 지식 퀴즈 (게임 당 무작위 출제)
const QUIZ_BANK = [
  { id: 1, type: "OX", question: "반도체는 전기가 잘 통하는 도체와 안 통하는 부도체의 중간 성질을 가진 물질이다.", answer: "O", explain: "필요에 따라 전기를 통하게 하거나 통하지 않게 조절할 수 있는 것이 반도체입니다." },
  { id: 2, type: "OX", question: "스마트폰이나 컴퓨터에서 기억(저장)을 담당하는 반도체는 '시스템 반도체'다.", answer: "X", explain: "정보를 기억하고 저장하는 것은 '메모리 반도체'이며, 연산과 제어를 담당하는 것이 '시스템 반도체'입니다." },
  { id: 3, type: "CHOICE", question: "다음 중 전원이 꺼져도 저장된 데이터가 지워지지 않아 USB나 SSD 등에 사용되는 메모리 반도체는?", options: ["DRAM", "SRAM", "낸드 플래시", "시스템 반도체"], answer: 2, explain: "낸드 플래시(NAND Flash)는 전원이 꺼져도 정보가 유지되는 비휘발성 메모리입니다." },
  { id: 4, type: "CHOICE", question: "반도체를 만드는 둥근 판으로, 주로 모래에서 추출한 규소(실리콘)로 만드는 이것의 이름은?", options: ["웨이퍼", "다이오드", "플라스틱", "마더보드"], answer: 0, explain: "웨이퍼(Wafer)는 반도체 집적회로를 만드는 둥근 실리콘 기판입니다." },
  { id: 5, type: "OX", question: "반도체 공장을 의미하는 '팹(Fab)'은 Fabrication의 약자이다.", answer: "O", explain: "팹(Fab)은 반도체 제조 공장을 뜻하는 단어입니다." },
  { id: 6, type: "CHOICE", question: "자체 공장 없이 반도체 회로 '설계'만을 전문으로 하는 기업 형태는?", options: ["파운드리", "팹리스", "IDM(종합반도체)", "OSAT"], answer: 1, explain: "팹리스(Fabless)는 공장(Fab)이 없는(less) 설계 전문 기업입니다." },
  { id: 7, type: "CHOICE", question: "설계 도면을 받아서 반도체를 대신 '생산(위탁 생산)'해주는 기업 형태는?", options: ["파운드리", "팹리스", "디자인하우스", "장비업체"], answer: 0, explain: "파운드리(Foundry)는 위탁 생산만을 전문으로 하는 기업입니다." },
  { id: 8, type: "OX", question: "반도체 제조 과정에서 먼지가 전혀 없는 청정한 방을 '클린룸'이라고 부른다.", answer: "O", explain: "아주 작은 먼지 하나도 반도체에 치명적이므로 먼지가 통제된 클린룸에서 제조합니다." },
  { id: 9, type: "CHOICE", question: "컴퓨터의 뇌 역할을 하는 중앙처리장치로, 대표적인 시스템 반도체인 이것의 약자는?", options: ["CPU", "RAM", "SSD", "HDD"], answer: 0, explain: "CPU(Central Processing Unit)는 컴퓨터의 핵심 연산 장치입니다." },
  { id: 10, type: "OX", question: "DRAM은 작업 속도는 빠르지만 전원을 끄면 저장된 내용이 모두 지워지는 메모리다.", answer: "O", explain: "DRAM은 전원이 공급될 때만 데이터가 유지되는 휘발성 메모리로 주기억장치에 쓰입니다." },
  { id: 11, type: "CHOICE", question: "스마트폰의 두뇌 역할을 하는 반도체 칩을 부르는 명칭은?", options: ["AP (모바일 AP)", "DRAM", "NAND", "LED"], answer: 0, explain: "모바일 AP(Application Processor)는 스마트폰의 CPU, GPU 등을 하나로 모은 시스템 반도체입니다." },
  { id: 12, type: "OX", question: "삼성전자와 인텔처럼 설계부터 생산, 판매까지 모두 직접 하는 기업을 '종합 반도체 기업(IDM)'이라 한다.", answer: "O", explain: "IDM(Integrated Device Manufacturer)은 반도체 산업의 모든 과정을 스스로 하는 기업입니다." },
  { id: 13, type: "CHOICE", question: "빛을 이용해 웨이퍼 위에 반도체 회로 밑그림을 찍어내는 반도체의 핵심 공정은?", options: ["식각 공정", "포토 공정", "세정 공정", "패키징 공정"], answer: 1, explain: "포토 공정(Photolithography)은 사진을 현상하듯 빛을 이용해 회로를 그리는 공정입니다." },
  { id: 14, type: "OX", question: "최근 인공지능(AI) 열풍으로 인해 그래픽 처리 장치인 GPU의 수요가 크게 늘고 있다.", answer: "O", explain: "GPU는 한 번에 많은 데이터를 동시에 처리(병렬 처리)할 수 있어 AI 연산에 필수적입니다." },
  { id: 15, type: "CHOICE", question: "AI 반도체를 돕기 위해 여러 개의 DRAM을 수직으로 쌓아 올려 데이터 처리 속도를 크게 높인 메모리는?", options: ["HBM", "USB", "SD카드", "ROM"], answer: 0, explain: "HBM(고대역폭 메모리)은 D램을 수직으로 쌓아 처리 속도를 비약적으로 높인 차세대 메모리입니다." },
  { id: 16, type: "OX", question: "반도체를 만들 때 회로의 선폭이 가늘고 미세해질수록 한 개의 웨이퍼에서 더 많은 칩을 만들 수 있어 유리하다.", answer: "O", explain: "선폭이 좁아지면(미세 공정) 칩 크기가 작아져 생산성이 올라가고 전력 소모도 줄어듭니다." },
  { id: 17, type: "CHOICE", question: "다 만들어진 반도체 칩을 외부 충격이나 습기로부터 보호하기 위해 포장하는 공정은?", options: ["포토 공정", "식각 공정", "패키징 공정", "설계 공정"], answer: 2, explain: "패키징(Packaging) 공정은 반도체 칩을 포장하고 기판과 연결하는 후공정입니다." },
  { id: 18, type: "OX", question: "빛을 내는 반도체인 LED도 넓은 의미에서 반도체의 한 종류이다.", answer: "O", explain: "LED(발광 다이오드)는 전기를 빛으로 바꿔주는 화합물 반도체입니다." },
  { id: 19, type: "CHOICE", question: "웨이퍼 위에 불필요한 부분을 깎아내는(조각하는) 공정의 이름은?", options: ["식각 공정", "세정 공정", "연마 공정", "증착 공정"], answer: 0, explain: "식각 공정(Etching)은 회로 패턴을 제외한 나머지 부분을 화학적/물리적으로 깎아내는 공정입니다." },
  { id: 20, type: "OX", question: "전기차에는 일반 내연기관 자동차보다 훨씬 적은 수의 반도체가 들어간다.", answer: "X", explain: "전기차와 자율주행차에는 배터리 제어, 센서 등 수많은 전자 장비가 들어가 일반 차보다 훨씬 많은 반도체가 필요합니다." },
  { id: 21, type: "CHOICE", question: "반도체 제조에서 불량품 없이 제대로 완성된 정상 제품의 비율을 무엇이라 부르는가?", options: ["수율", "효율", "가동률", "재고율"], answer: 0, explain: "수율(Yield)은 전체 생산품 중 합격품의 비율로, 반도체 회사의 기술력을 상징합니다." },
  { id: 22, type: "OX", question: "인공지능 칩(AI 가속기) 시장에서 세계 1위를 차지하고 있는 대표적인 팹리스 기업은 엔비디아(NVIDIA)다.", answer: "O", explain: "엔비디아는 GPU 기반의 AI 반도체 설계를 독점하다시피 하고 있는 팹리스입니다." },
  { id: 23, type: "CHOICE", question: "반도체의 미세 공정을 이야기할 때 단위로 쓰이는 '나노(Nano)'는 1미터의 몇 분의 1일까?", options: ["백만 분의 1", "천만 분의 1", "1억 분의 1", "10억 분의 1"], answer: 3, explain: "1나노미터(nm)는 10억 분의 1미터로, 머리카락 굵기의 10만 분의 1 정도입니다." },
  { id: 24, type: "OX", question: "실리콘 밸리라는 이름은 반도체의 주 원료인 실리콘(규소)에서 유래했다.", answer: "O", explain: "반도체 산업이 미국 캘리포니아에 밀집하면서, 그 원료인 실리콘의 이름을 따서 실리콘 밸리가 되었습니다." },
  { id: 25, type: "CHOICE", question: "반도체가 과열되면 성능이 떨어지는 현상을 막기 위해 열을 식혀주는 부품/시스템을 무엇이라 부르는가?", options: ["쿨링(방열) 시스템", "배터리", "안테나", "디스플레이"], answer: 0, explain: "스마트폰이나 PC 모두 칩의 열을 식히는 쿨링(방열) 솔루션이 매우 중요합니다." }
];

// 게임 시나리오 데이터 (총 15개 중 6개)
const SCENARIOS = [
  {
    id: 1, title: "AI 가속기 광풍과 초고성능 HBM의 출현",
    description: "생성형 AI 서비스의 폭발적인 성장으로 AI 데이터센터용 특화 반도체 수요가 증가하고 있습니다.",
    rounds: [
      { round: 1, hint: "독점 힌트: AI 팹리스들의 주문 폭주로 파운드리 라인이 가득 찼으며, 팹리스의 가치가 급상승 중입니다.", changes: { corefab: 25, nextmemory: 5, nanodesign: 30, gwangseong: 10, chemicalwave: 0, packagingworld: 15 } },
      { round: 2, hint: "독점 힌트: 신형 AI 칩에 탑재될 HBM3E 공급이 부족해 메모리 기업이 역대급 실적을 발표할 예정입니다.", changes: { corefab: 10, nextmemory: 40, nanodesign: 10, gwangseong: 15, chemicalwave: 5, packagingworld: 35 } },
      { round: 3, hint: "독점 힌트: HBM 패키징 라인 증설을 위해 메이저 메모리사가 관련 장비를 싹쓸이 매입하고 있습니다.", changes: { corefab: 5, nextmemory: 15, nanodesign: 5, gwangseong: 30, chemicalwave: 15, packagingworld: 10 } }
    ]
  },
  {
    id: 2, title: "미-중 무역 갈등과 소부장 국산화 붐",
    description: "강대국 간 반도체 원자재 수출 제재가 격화되며 위기와 기회가 공존하고 있습니다.",
    rounds: [
      { round: 1, hint: "독점 힌트: 특수 가스 수입 규제로 생산 타격이 우려되나, 국산화 소재 기업에 대규모 투자가 유입 중입니다.", changes: { corefab: -20, nextmemory: -15, nanodesign: -5, gwangseong: -5, chemicalwave: 45, packagingworld: -10 } },
      { round: 2, hint: "독점 힌트: 국내 파운드리가 결국 자국산 에칭 가스를 공식 채택하기로 결정했습니다. 소재사 실적이 뜁니다.", changes: { corefab: 5, nextmemory: 10, nanodesign: 5, gwangseong: 0, chemicalwave: 35, packagingworld: 5 } },
      { round: 3, hint: "독점 힌트: 생산 정상화로 대기 중이던 신공정 물량 출하가 몰려 후공정 클러스터가 초과 가동 중입니다.", changes: { corefab: 15, nextmemory: 15, nanodesign: 10, gwangseong: 10, chemicalwave: -10, packagingworld: 25 } }
    ]
  },
  {
    id: 3, title: "스마트기기 침체와 메모리 연합 감산",
    description: "스마트폰과 PC 판매 부진으로 재고가 쌓여 반도체 가격이 얼어붙었습니다.",
    rounds: [
      { round: 1, hint: "독점 힌트: 재고 증가로 D램 가격이 10년 만에 최저치를 기록하며 제조사와 후공정 업계가 직격탄을 맞습니다.", changes: { corefab: -10, nextmemory: -30, nanodesign: -15, gwangseong: -10, chemicalwave: -10, packagingworld: -20 } },
      { round: 2, hint: "독점 힌트: 대형 제조사들이 역대 최대 규모인 25% 공조 감산에 돌입해 가격 정상화를 노리고 있습니다.", changes: { corefab: -5, nextmemory: 20, nanodesign: -5, gwangseong: -30, chemicalwave: -15, packagingworld: -5 } },
      { round: 3, hint: "독점 힌트: 감산 효과로 재고 소진이 완료되며 현물 가격이 15% 이상 폭등하는 기염을 토하고 있습니다.", changes: { corefab: 15, nextmemory: 35, nanodesign: 10, gwangseong: 5, chemicalwave: 15, packagingworld: 15 } }
    ]
  },
  {
    id: 4, title: "자동차 전기차 전환과 차량용 반도체 공급 대란",
    description: "차량에 탑재되는 반도체 개수가 폭증하며 전 세계적인 칩 부족 사태가 벌어집니다.",
    rounds: [
      { round: 1, hint: "독점 힌트: 완성차 라인이 멈출 위기에 처해 파운드리 단가를 2배 올려서라도 물량을 확보하려는 움직임이 포착됩니다.", changes: { corefab: 30, nextmemory: 5, nanodesign: 20, gwangseong: 5, chemicalwave: 5, packagingworld: 10 } },
      { round: 2, hint: "독점 힌트: 차량용 반도체의 엄격한 안전 기준을 충족하기 위한 후공정 전수 테스트 계약이 2년 장기로 체결됩니다.", changes: { corefab: 10, nextmemory: 5, nanodesign: 10, gwangseong: 5, chemicalwave: 5, packagingworld: 30 } },
      { round: 3, hint: "독점 힌트: 레거시 파운드리가 풀가동되면서 구형 제조 장비 재고가 완판되는 이례적 현상이 발생했습니다.", changes: { corefab: 15, nextmemory: 5, nanodesign: 5, gwangseong: 25, chemicalwave: 15, packagingworld: 10 } }
    ]
  },
  {
    id: 5, title: "첨단 패키징 병목과 칩렛 혁명",
    description: "단일 칩 크기의 한계를 넘기 위해 여러 칩을 하나로 엮는 첨단 패키징이 전장으로 떠오릅니다.",
    rounds: [
      { round: 1, hint: "독점 힌트: 패키징 능력이 부족해 병목이 생겼으며, 독점 기술을 가진 후공정 기업 가치가 폭등 중입니다.", changes: { corefab: 5, nextmemory: 5, nanodesign: 10, gwangseong: 0, chemicalwave: 5, packagingworld: 40 } },
      { round: 2, hint: "독점 힌트: 칩을 잇는 고성능 본딩 장비 발주가 대규모로 쏟아집니다. 장비사 실적이 급상승합니다.", changes: { corefab: 10, nextmemory: 10, nanodesign: 15, gwangseong: 30, chemicalwave: 10, packagingworld: 20 } },
      { round: 3, hint: "독점 힌트: 표준화 덕분에 팹리스들이 다양한 기능을 모듈화한 신제품 칩 설계를 앞다투어 출시하고 있습니다.", changes: { corefab: 15, nextmemory: 10, nanodesign: 30, gwangseong: 5, chemicalwave: 15, packagingworld: 15 } }
    ]
  },
  {
    id: 6, title: "유기물(Glass) 기판 혁명",
    description: "기존 실리콘 기판의 한계를 뛰어넘는 새로운 기판 기술이 반도체 생태계를 바꿉니다.",
    rounds: [
      { round: 1, hint: "독점 힌트: 메이저 제조사들이 차세대 패키징에 유리를 전격 도입하기로 합의했습니다. 관련 후공정사가 수혜를 입습니다.", changes: { corefab: 5, nextmemory: 5, nanodesign: 10, gwangseong: 5, chemicalwave: 15, packagingworld: 35 } },
      { round: 2, hint: "독점 힌트: 유리에 마이크로 홀을 정밀하게 뚫는 특수 레이저 장비가 글로벌 표준으로 지정되며 납품 계약을 맺었습니다.", changes: { corefab: 10, nextmemory: 10, nanodesign: 10, gwangseong: 30, chemicalwave: 10, packagingworld: 20 } },
      { round: 3, hint: "독점 힌트: 유리 기판을 활용한 AI 칩 테스트 결과, 전력소모가 획기적으로 개선되어 양산이 앞당겨집니다.", changes: { corefab: 15, nextmemory: 10, nanodesign: 20, gwangseong: 5, chemicalwave: 15, packagingworld: 35 } }
    ]
  }
];

// Node.js(서버) 환경과 브라우저(클라이언트) 환경 동시 지원
const BREAKING_NEWS = [
  { id: 1, type: "good", companyId: "corefab", text: "[단독] 코어팹, 글로벌 빅테크와 10조 원 규모 파운드리 독점 계약 체결!", impact: { min: 15, max: 25 } },
  { id: 2, type: "bad", companyId: "corefab", text: "[속보] 코어팹 핵심 공정 라인에서 화재 발생... 2개월간 가동 중단 위기", impact: { min: -25, max: -15 } },
  { id: 3, type: "good", companyId: "nextmemory", text: "[속보] 넥스트메모리, 경쟁사 대비 2배 빠른 차세대 HBM 세계 최초 양산 성공!", impact: { min: 15, max: 30 } },
  { id: 4, type: "bad", companyId: "nextmemory", text: "[단독] 넥스트메모리, 납품한 메모리에서 대규모 불량 발견... 전량 리콜 사태", impact: { min: -30, max: -15 } },
  { id: 5, type: "good", companyId: "nanodesign", text: "[속보] 나노디자인이 설계한 새로운 AI 가속기 칩 성능, 벤치마크 압도적 1위 달성!", impact: { min: 20, max: 35 } },
  { id: 6, type: "bad", companyId: "nanodesign", text: "[단독] 나노디자인, 핵심 설계 인력 50명 경쟁사로 단체 이직... 기술 유출 우려", impact: { min: -20, max: -10 } },
  { id: 7, type: "good", companyId: "gwangseong", text: "[속보] 광성레이저, EUV 대체 가능한 차세대 노광 장비 시제품 개발 성공!", impact: { min: 15, max: 25 } },
  { id: 8, type: "bad", companyId: "gwangseong", text: "[단독] 광성레이저, 핵심 부품 조달 실패로 장비 출하 6개월 지연 불가피", impact: { min: -25, max: -15 } },
  { id: 9, type: "good", companyId: "chemicalwave", text: "[속보] 케미칼웨이브, 원가 1/3 수준의 혁신적 식각액 특허 등록 완료!", impact: { min: 15, max: 25 } },
  { id: 10, type: "bad", companyId: "chemicalwave", text: "[단독] 케미칼웨이브 공장에서 독성 가스 누출 사고 발생... 무기한 조업 정지", impact: { min: -30, max: -20 } },
  { id: 11, type: "good", companyId: "packagingworld", text: "[속보] 패키징월드, 꿈의 3D 칩렛 패키징 기술 수율 90% 돌파 소식!", impact: { min: 15, max: 30 } },
  { id: 12, type: "bad", companyId: "packagingworld", text: "[단독] 패키징월드, 납기 지연으로 메이저 고객사와 수천억 원대 소송 휘말려", impact: { min: -25, max: -15 } },
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { COMPANIES, QUIZ_BANK, SCENARIOS, BREAKING_NEWS };
} else {
  window.COMPANIES = COMPANIES;
  window.QUIZ_BANK = QUIZ_BANK;
  window.SCENARIOS = SCENARIOS;
  window.BREAKING_NEWS = BREAKING_NEWS;
}

