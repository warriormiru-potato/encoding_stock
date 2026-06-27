// 반도체 모의투자 게임 데이터 파일 (data.js)

// 6개 가상 반도체 기업 정의
const COMPANIES = [
  { id: "corefab", name: "코어팹", desc: "파운드리 (위탁 생산)", basePrice: 100000 },
  { id: "nextmemory", name: "넥스트메모리", desc: "메모리 반도체 (DRAM, NAND)", basePrice: 80000 },
  { id: "nanodesign", name: "나노디자인", desc: "팹리스 (설계 전문)", basePrice: 120000 },
  { id: "gwangseong", name: "광성레이저", desc: "장비 (EUV 노광 등)", basePrice: 150000 },
  { id: "chemicalwave", name: "케미칼웨이브", desc: "소재 (식각 가스, PR)", basePrice: 50000 },
  { id: "packagingworld", name: "패키징월드", desc: "후공정 (OSAT, 3D 패키징)", basePrice: 60000 }
];

// 반도체 관련 지식 퀴즈 (게임 당 무작위 출제)
const QUIZ_BANK = [
  {
    id: 1, type: "OX",
    question: "반도체 8대 공정 중 포토공정은 회로 패턴이 담긴 마스크에 빛을 비추어 웨이퍼 상에 회로를 그리는 공정이다.",
    answer: "O",
    explain: "포토공정(Photolithography)은 웨이퍼 위에 회로가 그려진 감광막 패턴을 형성하기 위해 빛을 사용하는 노광 공정입니다."
  },
  {
    id: 2, type: "OX",
    question: "팹리스(Fabless) 기업은 자체 생산 공장(Fab)을 보유하고 있어 대량 생산이 가능하다.",
    answer: "X",
    explain: "팹리스(Fabless)는 생산 공장이 없는 설계 전문 기업을 뜻하며, 생산은 파운드리에 위탁합니다."
  },
  {
    id: 3, type: "CHOICE",
    question: "웨이퍼 위에 쌓인 불필요한 물질을 화학적, 물리적 방법으로 깎아내는 공정은?",
    options: ["산화 공정", "식각 공정", "금속배선 공정", "이온주입 공정"],
    answer: 1, // 0-indexed index 1: 식각 공정
    explain: "식각 공정(Etching)은 필요한 회로 패턴을 제외한 불필요한 부분을 깎아내는 공정입니다."
  },
  {
    id: 4, type: "OX",
    question: "DRAM은 전원이 꺼져도 저장된 데이터가 사라지지 않는 비휘발성 메모리이다.",
    answer: "X",
    explain: "DRAM은 휘발성 메모리로 전원이 차단되면 데이터가 사라집니다. 비휘발성 메모리는 낸드 플래시입니다."
  },
  {
    id: 5, type: "CHOICE",
    question: "여러 개의 DRAM을 수직으로 적층하여 데이터 처리 속도를 혁신적으로 높인 고대역폭 메모리의 명칭은?",
    options: ["LPDDR", "GDDR", "HBM", "SSD"],
    answer: 2,
    explain: "HBM(High Bandwidth Memory)은 여러 DRAM을 수직 적층하여 데이터 전송 대역폭을 크게 늘린 메모리입니다."
  },
  {
    id: 6, type: "OX",
    question: "ASML사가 독점 생산하며 초미세 공정에 필수적인 노광 장비는 EUV(극자외선) 장비이다.",
    answer: "O",
    explain: "극자외선(EUV) 노광 장비는 초미세 회로 구현의 핵심입니다."
  },
  {
    id: 7, type: "CHOICE",
    question: "반도체 패키징 공정에서 여러 칩을 하나로 연결하여 성능을 높이는 고도의 후공정 기술은?",
    options: ["웨이퍼 슬라이싱", "칩렛 및 2.5D/3D 패키징", "이온 주입", "감광액 도포"],
    answer: 1,
    explain: "칩렛(Chiplet)과 첨단 패키징은 각각 개별 설계된 칩을 하나의 패키지로 통합하는 기술입니다."
  },
  {
    id: 8, type: "OX",
    question: "실리콘 관통 전극(TSV) 기술은 와이어를 사용하지 않고 칩에 미세한 구멍을 뚫어 칩을 물리적/전기적으로 연결하는 기술이다.",
    answer: "O",
    explain: "TSV는 HBM 등 3D 적층 구조의 핵심 기술입니다."
  },
  {
    id: 9, type: "CHOICE",
    question: "웨이퍼 표면에 전도성을 갖는 이온 물질을 주입하여 반도체 특성을 부여하는 공정은?",
    options: ["산화 공정", "포토 공정", "이온주입 공정", "세정 공정"],
    answer: 2,
    explain: "이온주입 공정(Ion Implantation)은 웨이퍼에 불순물을 주입하여 전기적 특성을 갖게 만듭니다."
  },
  {
    id: 10, type: "OX",
    question: "반도체 설계자산(IP) 기업의 대표 주자로, 모바일 AP 설계 인프라를 독점하다시피 한 기업은 ARM이다.",
    answer: "O",
    explain: "ARM은 스마트폰 AP 아키텍처 분야를 지배하는 대표적인 반도체 IP 기업입니다."
  },
  {
    id: 11, type: "CHOICE",
    question: "순수 실리콘 웨이퍼 표면에 산소나 수증기를 접촉시켜 균일한 보호막을 형성하는 기초 공정은?",
    options: ["산화 공정", "금속배선 공정", "EDS 공정", "패키징 공정"],
    answer: 0,
    explain: "산화 공정(Oxidation)은 웨이퍼 표면에 이산화실리콘(SiO2) 보호막을 형성합니다."
  },
  {
    id: 12, type: "OX",
    question: "파운드리 기업은 설계 도면을 직접 그리며 자사 브랜드 제품의 영업을 주력으로 한다.",
    answer: "X",
    explain: "파운드리는 타 기업이 설계한 도면을 바탕으로 위탁 생산만을 전문적으로 수행합니다."
  },
  {
    id: 13, type: "CHOICE",
    question: "모래에서 추출한 규소를 고온 정제하여 원기둥 모양의 결정으로 만든 원자재는?",
    options: ["에피 웨이퍼", "잉곳 (Ingot)", "가스켓", "리드 프레임"],
    answer: 1,
    explain: "실리콘 잉곳(Silicon Ingot)을 얇게 썰어 웨이퍼를 만듭니다."
  },
  {
    id: 14, type: "OX",
    question: "클린룸의 클래스(Class) 수치가 낮을수록 공기 중 먼지 개수가 적어 더 깨끗한 환경을 의미한다.",
    answer: "O",
    explain: "수치가 낮을수록 초정밀하고 깨끗한 클린룸입니다."
  },
  {
    id: 15, type: "CHOICE",
    question: "웨이퍼에 아주 얇고 균일하게 박막을 덮어 전기적 특성을 부여하는 공정은?",
    options: ["증착 공정", "노광 공정", "연마 공정", "패키징 공정"],
    answer: 0,
    explain: "증착 공정(Deposition)은 미세한 분자 단위의 박막을 입히는 공정입니다."
  },
  {
    id: 16, type: "OX",
    question: "NAND Flash 메모리는 전원이 꺼지면 저장된 데이터가 모두 리셋되는 휘발성이다.",
    answer: "X",
    explain: "NAND Flash는 전원 차단 후에도 데이터가 보존되는 비휘발성 메모리입니다."
  },
  {
    id: 17, type: "CHOICE",
    question: "동작 속도를 향상시키기 위해 게이트의 3면을 채널이 감싸는 입체적 트랜지스터 구조는?",
    options: ["Planar FET", "FinFET", "GAA", "MBCFET"],
    answer: 1,
    explain: "FinFET은 채널이 지느러미 모양으로 솟아올라 3면으로 게이트를 감싸는 구조입니다."
  },
  {
    id: 18, type: "OX",
    question: "GAA(Gate-All-Around) 구조는 채널의 4면 전체를 게이트가 감싸 제어력을 극대화한 구조다.",
    answer: "O",
    explain: "GAA 구조는 미세공정에서 누설 전류를 가장 잘 통제할 수 있는 차세대 기술입니다."
  },
  {
    id: 19, type: "CHOICE",
    question: "설계부터 생산, 마케팅까지 모든 영역을 수행하는 종합 반도체 기업의 약칭은?",
    options: ["Foundry", "Fabless", "IDM", "OSAT"],
    answer: 2,
    explain: "IDM(Integrated Device Manufacturer)은 종합 반도체 기업을 뜻합니다."
  },
  {
    id: 20, type: "OX",
    question: "반도체 테스트 중 EDS 테스트는 패키징이 끝난 최종 완제품 상태에서 진행한다.",
    answer: "X",
    explain: "EDS 테스트는 패키징 전 웨이퍼 상태에서 개별 칩의 불량 여부를 판별합니다."
  }
];

// 게임 시나리오 데이터 (총 15개 중 주요 시나리오 10개 우선 구현)
const SCENARIOS = [
  {
    id: 1,
    title: "AI 가속기 광풍과 초고성능 HBM의 출현",
    description: "생성형 AI 서비스의 폭발적인 성장으로 AI 데이터센터용 특화 반도체 수요가 증가하고 있습니다.",
    rounds: [
      {
        round: 1,
        hint: "독점 힌트: AI 팹리스들의 주문 폭주로 파운드리 라인이 가득 찼으며, 팹리스의 IP 가치가 급상승 중입니다.",
        changes: { corefab: 25, nextmemory: 5, nanodesign: 30, gwangseong: 10, chemicalwave: 0, packagingworld: 15 }
      },
      {
        round: 2,
        hint: "독점 힌트: 신형 AI 칩에 탑재될 HBM3E 공급이 부족해 메모리 기업이 역대급 실적을 발표할 예정입니다.",
        changes: { corefab: 10, nextmemory: 40, nanodesign: 10, gwangseong: 15, chemicalwave: 5, packagingworld: 35 }
      },
      {
        round: 3,
        hint: "독점 힌트: HBM 패키징 라인 증설을 위해 메이저 메모리사가 노광/에칭 장비를 싹쓸이 매입하고 있습니다.",
        changes: { corefab: 5, nextmemory: 15, nanodesign: 5, gwangseong: 30, chemicalwave: 15, packagingworld: 10 }
      }
    ]
  },
  {
    id: 2,
    title: "미-중 무역 갈등과 소부장 국산화 붐",
    description: "강대국 간 반도체 원자재 수출 제재가 격화되며 위기와 기회가 공존하고 있습니다.",
    rounds: [
      {
        round: 1,
        hint: "독점 힌트: 특수 가스 수입 규제로 생산 타격이 우려되나, 국산화 소재 기업에 대규모 투자가 유입 중입니다.",
        changes: { corefab: -20, nextmemory: -15, nanodesign: -5, gwangseong: -5, chemicalwave: 45, packagingworld: -10 }
      },
      {
        round: 2,
        hint: "독점 힌트: 국내 파운드리가 결국 자국산 에칭 가스를 공식 채택하기로 결정했습니다. 소재사 실적이 뜁니다.",
        changes: { corefab: 5, nextmemory: 10, nanodesign: 5, gwangseong: 0, chemicalwave: 35, packagingworld: 5 }
      },
      {
        round: 3,
        hint: "독점 힌트: 생산 정상화로 대기 중이던 신공정 물량 출하가 몰려 후공정 클러스터가 초과 가동 중입니다.",
        changes: { corefab: 15, nextmemory: 15, nanodesign: 10, gwangseong: 10, chemicalwave: -10, packagingworld: 25 }
      }
    ]
  },
  {
    id: 3,
    title: "스마트기기 침체와 메모리 연합 감산",
    description: "스마트폰과 PC 판매 부진으로 재고가 쌓여 반도체 가격이 얼어붙었습니다.",
    rounds: [
      {
        round: 1,
        hint: "독점 힌트: 재고 증가로 D램 가격이 10년 만에 최저치를 기록하며 제조사와 후공정 업계가 직격탄을 맞습니다.",
        changes: { corefab: -10, nextmemory: -30, nanodesign: -15, gwangseong: -10, chemicalwave: -10, packagingworld: -20 }
      },
      {
        round: 2,
        hint: "독점 힌트: 대형 제조사들이 역대 최대 규모인 25% 공조 감산에 돌입해 가격 정상화를 노리고 있습니다. 신규 장비 발주는 취소됩니다.",
        changes: { corefab: -5, nextmemory: 20, nanodesign: -5, gwangseong: -30, chemicalwave: -15, packagingworld: -5 }
      },
      {
        round: 3,
        hint: "독점 힌트: 감산 효과로 재고 소진이 완료되며 현물 가격이 15% 이상 폭등하는 기염을 토하고 있습니다.",
        changes: { corefab: 15, nextmemory: 35, nanodesign: 10, gwangseong: 5, chemicalwave: 15, packagingworld: 15 }
      }
    ]
  },
  {
    id: 4,
    title: "자동차 전기차 전환과 차량용 MCU 공급 대란",
    description: "차량에 탑재되는 반도체 개수가 폭증하며 전 세계적인 칩 부족 사태가 벌어집니다.",
    rounds: [
      {
        round: 1,
        hint: "독점 힌트: 완성차 라인이 멈출 위기에 처해 파운드리 단가를 2배 올려서라도 물량을 확보하려는 움직임이 포착됩니다.",
        changes: { corefab: 30, nextmemory: 5, nanodesign: 20, gwangseong: 5, chemicalwave: 5, packagingworld: 10 }
      },
      {
        round: 2,
        hint: "독점 힌트: 차량용 반도체의 엄격한 안전 기준을 충족하기 위한 후공정 전수 테스트 계약이 2년 단위 장기로 체결됩니다.",
        changes: { corefab: 10, nextmemory: 5, nanodesign: 10, gwangseong: 5, chemicalwave: 5, packagingworld: 30 }
      },
      {
        round: 3,
        hint: "독점 힌트: 레거시 파운드리가 풀가동되면서 오히려 구형 노광/식각 장비 재고가 완판되는 현상이 발생했습니다.",
        changes: { corefab: 15, nextmemory: 5, nanodesign: 5, gwangseong: 25, chemicalwave: 15, packagingworld: 10 }
      }
    ]
  },
  {
    id: 5,
    title: "첨단 패키징(CoWoS) 병목과 칩렛 혁명",
    description: "단일 칩 크기의 한계를 넘기 위해 여러 칩을 하나로 엮는 첨단 패키징이 전장으로 떠오릅니다.",
    rounds: [
      {
        round: 1,
        hint: "독점 힌트: 2.5D 인터포저 패키징 캐파가 부족해 병목이 생겼으며, 독점 기술을 가진 후공정 기업 가치가 폭등 중입니다.",
        changes: { corefab: 5, nextmemory: 5, nanodesign: 10, gwangseong: 0, chemicalwave: 5, packagingworld: 40 }
      },
      {
        round: 2,
        hint: "독점 힌트: 고성능 칩렛 지원을 위한 유기 인터포저와 하이브리드 본딩 장비 발주가 대규모로 쏟아집니다.",
        changes: { corefab: 10, nextmemory: 10, nanodesign: 15, gwangseong: 30, chemicalwave: 10, packagingworld: 20 }
      },
      {
        round: 3,
        hint: "독점 힌트: 칩렛 구조의 표준화로 팹리스들이 다양한 기능을 모듈화한 신제품 칩 설계를 앞다투어 출시하고 있습니다.",
        changes: { corefab: 15, nextmemory: 10, nanodesign: 30, gwangseong: 5, chemicalwave: 15, packagingworld: 15 }
      }
    ]
  },
  {
    id: 6,
    title: "유기물(Glass) 기판 혁명",
    description: "기존 실리콘 기판의 한계를 뛰어넘는 유리 기판 기술이 반도체 생태계를 바꿉니다.",
    rounds: [
      {
        round: 1,
        hint: "독점 힌트: 메이저 제조사들이 차세대 패키징에 유리를 전격 도입하기로 합의했습니다. 관련 후공정사가 수혜를 입습니다.",
        changes: { corefab: 5, nextmemory: 5, nanodesign: 10, gwangseong: 5, chemicalwave: 15, packagingworld: 35 }
      },
      {
        round: 2,
        hint: "독점 힌트: 유리에 마이크로 홀을 정밀하게 뚫는 특수 레이저 장비가 글로벌 표준으로 지정되며 대규모 납품 계약을 맺었습니다.",
        changes: { corefab: 10, nextmemory: 10, nanodesign: 10, gwangseong: 30, chemicalwave: 10, packagingworld: 20 }
      },
      {
        round: 3,
        hint: "독점 힌트: 유리 기판을 활용한 AI 칩 벤치마크 테스트 결과, 전력소모와 신호손실이 획기적으로 개선되어 양산이 앞당겨집니다.",
        changes: { corefab: 15, nextmemory: 10, nanodesign: 20, gwangseong: 5, chemicalwave: 15, packagingworld: 35 }
      }
    ]
  }
];

// 브라우저 환경에서 전역 변수로 노출되도록 설정
window.COMPANIES = COMPANIES;
window.QUIZ_BANK = QUIZ_BANK;
window.SCENARIOS = SCENARIOS;

