// 통합앱에 들어가는 게임 목록. 새 게임은 games/<id>/host.js, play.js 를 만들고 여기에 추가합니다.
// 모듈 인터페이스: export function mount(el, ctx) → unmount 함수(선택)를 돌려줌
// ctx = { db, fs, gameId, eventId, player: {id, nick} (참가자 화면만), mock }
export const GAMES = [
  { id: "invest", title: "반도체왕 임삼성", sub: "DRAM, NAND, 금, 비트코인에 투자해 투자왕 되기", emoji: "💾📈🪙" },
  { id: "emoji", title: "이게 제 이모지야👽", sub: "이모지 보고 속담·노래 가사·유행어·넌센스 맞히기", emoji: "🐋⚔️🦐" },
  { id: "similar", title: "H2맨틀", sub: "비밀 단어와 얼마나 가까운지 유사도로 추리하기", emoji: "🌡️🔤" },
];
export const EVENT_ID = "main";

// 진행 순서: 운영 화면 게임 목록, 메인 순위, 우승자 발표가 모두 이 순서를 따릅니다.
export const ORDER = ["similar", "emoji", "invest"];
GAMES.sort((a, b) => (ORDER.indexOf(a.id) + 1 || 99) - (ORDER.indexOf(b.id) + 1 || 99));
