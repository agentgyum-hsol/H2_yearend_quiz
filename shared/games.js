// 통합앱에 들어가는 게임 목록. 새 게임은 games/<id>/host.js, play.js 를 만들고 여기에 추가합니다.
// 모듈 인터페이스: export function mount(el, ctx) → unmount 함수(선택)를 돌려줌
// ctx = { db, fs, gameId, eventId, player: {id, nick} (참가자 화면만), mock }
export const GAMES = [
  { id: "invest", title: "반도체왕 임삼성", sub: "DRAM, NAND, 금, 비트코인에 투자해 투자왕 되기", emoji: "💾📈🪙" },
  { id: "emoji", title: "이게 내 이모지야", sub: "이모지 보고 속담 맞히기", emoji: "🐋⚔️🦐" },
];
export const EVENT_ID = "main";
