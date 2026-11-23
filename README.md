# 송년회 퀴즈

송년회에서 쓰는 휴대폰 참여형 퀴즈 앱입니다. 운영자가 프로젝터에 운영 화면을 띄우고, 참가자(약 50명)는 QR을 찍어 휴대폰으로 참여합니다. 게임마다 개인 우승자를 가립니다.

- **반도체왕 임삼성**: DRAM, NAND, 금, 비트코인에 투자해 투자왕 되기 (`games/invest`)
- **이게 내 이모지야**: 이모지 보고 속담 맞히기, 20문제 (`games/emoji`)

빌드 과정 없는 순수 HTML/JS입니다. 실시간 동기화는 Firebase Firestore, 호스팅은 GitHub Pages를 씁니다.

## 화면

| 주소 | 누가 | 하는 일 |
|---|---|---|
| `host/` | 운영자 (프로젝터) | 참가 QR 표시, 입장 인원 확인, 진행할 게임 선택, 게임 진행 |
| `play/` | 참가자 (휴대폰) | 닉네임 입장, 운영자가 고른 게임 화면으로 자동 전환 |

## 로컬에서 해 보기 (Firebase 없이)

```sh
python3 -m http.server 8000
```

`http://localhost:8000/host/?mock=1` 을 열고, 같은 브라우저의 다른 탭에서 `http://localhost:8000/play/?mock=1` 을 여러 개 열면 됩니다. 모의 DB는 같은 브라우저의 탭끼리만 연결됩니다. 여러 탭이 거의 동시에 쓰면 가끔 한쪽 쓰기가 사라지는데, 모의 DB의 한계이고 실제 Firestore에서는 생기지 않습니다. `config.js` 가 비어 있으면 `?mock=1` 없이도 모의 DB로 동작합니다.

## 실제 행사용 설정 (한 번만)

1. [Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트를 만듭니다 (Google 애널리틱스는 꺼도 됩니다). 무료 Spark 요금제로 충분합니다.
2. **빌드 > Firestore Database > 데이터베이스 만들기**: 위치는 `asia-northeast3 (서울)`, 프로덕션 모드로 시작.
3. **Firestore > 규칙** 탭에 이 저장소의 `firestore.rules` 내용을 붙여 넣고 게시.
4. **빌드 > Authentication > 시작하기 > 로그인 방법 > 익명** 을 사용 설정.
5. **프로젝트 설정 > 내 앱 > 웹 앱 추가(</>)** 후 나오는 `firebaseConfig` 의 `apiKey`, `authDomain`, `projectId`, `appId` 를 `config.js` 에 붙여 넣습니다. 이 값은 공개되어도 되는 값입니다.
6. GitHub 저장소 **Settings > Pages** 에서 Source 를 `Deploy from a branch`, 브랜치 `main`, 폴더 `/ (root)` 로 저장합니다. 몇 분 뒤 `https://<계정>.github.io/<저장소>/host/` 로 운영 화면이 열립니다.
7. **Authentication > 설정 > 승인된 도메인** 에 `<계정>.github.io` 를 추가합니다.

## 행사 당일 진행

1. 운영 노트북에서 `host/` 를 열어 프로젝터에 띄웁니다. 참가자는 화면의 QR을 찍고 닉네임을 정합니다.
2. 게임 카드를 누르면 모든 참가자 화면이 그 게임으로 바뀝니다. 끝나면 **← 게임 선택** 으로 돌아와 다음 게임을 엽니다.
3. 리허설 뒤에는 각 게임의 **게임 초기화**, 로비의 **참가자 명단 비우기** 로 지웁니다 (두 번 눌러야 실행).

### 이모지 퀴즈 진행 키

| 키 | 동작 |
|---|---|
| Enter | 문제 시작 / 정답 공개 / 다음 문제 |
| H | 초성 힌트 공개 |

채점: 정답 100점 + 빨리 낼수록 최대 50점. 초성 힌트가 나온 뒤 제출하면 기본 50점. 띄어쓰기·문장부호는 무시하고 한두 글자 오타는 정답으로 봅니다. 판정이 틀렸으면 정답 공개 화면에서 O/X 를 눌러 바꿀 수 있습니다. 점수가 같으면 맞힌 개수, 그다음 맞힌 문제들을 내는 데 걸린 시간이 짧은 사람이 앞섭니다.

문제는 `games/emoji/questions.js` 에서 고칩니다.

## 게임 모듈 만들기

`games/<id>/host.js` 와 `games/<id>/play.js` 가 `export function mount(el, ctx)` 를 내보내고, 정리 함수를 돌려줍니다. `shared/games.js` 의 목록에 추가하면 운영 화면에 나옵니다.

```js
ctx = {
  db, fs,            // fs: doc, collection, query, where, orderBy, limit, getDoc, getDocs,
                     //     setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch, serverTimestamp, increment
  gameId, eventId, mock,
  player: { id, nick },   // 참가자 화면만
  joinUrl,                // 운영 화면만
}
```

공통 데이터: `rooms/current {gameId}` (지금 열린 게임), `players/{uid} {nick, joinedAt}`. 게임별 데이터는 `rooms/<id>` 아래에 둡니다.

## 보안 메모

하루짜리 사내 행사용이라 운영자 계정을 따로 두지 않았습니다. 로그인한 누구나 게임 진행 상태를 바꿀 수 있고, 이모지 답안과 닉네임은 본인만 쓸 수 있습니다. 행사가 끝나면 Firestore 데이터를 지우거나 프로젝트를 삭제하세요.
