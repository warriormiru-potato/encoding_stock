// config.js - 게임의 시스템 설정 및 UI 문구 정의 파일
// 사용자가 직접 이 파일을 편집하여 게임의 기본 소지금, 시간 제한, 그리고 각종 텍스트를 손쉽게 바꿀 수 있습니다.

const GAME_CONFIG = {
  // 1. 게임 시스템 설정
  SYSTEM: {
    DEFAULT_CASH: 2500000,             // 게임 시작 시 각 플레이어가 받는 기본 현금 (원)
    ROUND_TIME: 180,                   // 라운드 당 제한 시간 (초) - 180초 = 3분
    MAX_PLAYERS: 10,                    // 게임 방 하나에 들어올 수 있는 최대 플레이어 수 (2~4인 추천)
    DEFAULT_ADMIN_PASSWORD: "tjwjddnjs" // 어드민(방장) 비밀번호 (서버 환경변수 ADMIN_PASSWORD가 없을 때의 기본값)
  },

  // 구글 스프레드시트 CSV 연동 주소 (비워두면 기본 데이터 사용)
  GOOGLE_SHEETS: {
    COMPANIES_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ5pRXGD59eJodpVptQWYP1L1LE_I2QkQf6ebf-wFX1YNsK3LVrpnui13wNaL0teOLfg4_ZT1yqT1PI/pub?gid=859151601&single=true&output=csv", // 주식 종목 CSV 주소
    QUIZ_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ5pRXGD59eJodpVptQWYP1L1LE_I2QkQf6ebf-wFX1YNsK3LVrpnui13wNaL0teOLfg4_ZT1yqT1PI/pub?gid=491529611&single=true&output=csv",      // 퀴즈 목록 CSV 주소
    NEWS_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ5pRXGD59eJodpVptQWYP1L1LE_I2QkQf6ebf-wFX1YNsK3LVrpnui13wNaL0teOLfg4_ZT1yqT1PI/pub?gid=1492428467&single=true&output=csv",      // 뉴스 특보 CSV 주소
    SCENARIOS_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ5pRXGD59eJodpVptQWYP1L1LE_I2QkQf6ebf-wFX1YNsK3LVrpnui13wNaL0teOLfg4_ZT1yqT1PI/pub?gid=780987288&single=true&output=csv"  // 라운드 시나리오 CSV 주소
  },

  // 2. 게임 UI 텍스트 및 메시지 설정 (문구 변경 가능)
  TEXTS: {
    // 로비 및 대기실 관련
    GAME_TITLE: "자운고 주식의신",
    CONNECTION_PENDING: "서버에 연결 중...",
    CONNECTION_SUCCESS: "서버 연결 완료!",
    LOBBY_WAITING_GUEST: "방장이 게임을 시작하기를 기다리고 있습니다...",
    KICKED_ALERT: "방장에 의해 강퇴되었습니다.",

    // 알림 및 경고 메시지
    ENTER_PASSWORD_ALERT: "방을 생성하려면 관리자 비밀번호를 입력해주세요.",
    WRONG_PASSWORD_ALERT: "어드민 비밀번호가 일치하지 않아 방을 생성할 수 없습니다.",
    INVALID_ROOM_CODE_ALERT: "4자리 방 코드를 입력하세요.",

    // 게임 본 화면 관련
    NEXT_ROUND_WAITING: "방장이 다음 라운드를 시작할 때까지 대기해주세요...",
    FINAL_RANKING_TITLE: " 게임 종료! 최종 랭킹 "
  }
};

// Node.js(서버) 환경과 브라우저(클라이언트) 환경 동시 지원
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GAME_CONFIG };
} else {
  window.GAME_CONFIG = GAME_CONFIG;
}
