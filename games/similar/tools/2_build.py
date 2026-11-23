# 2단계: 기존 words.json(기본 명사) + 후보로 data/words.json {core, words} 와 data/vec.bin(int8) 생성. 기존 단어 벡터는 그대로 둠
# 준비: pip install spacy numpy
import json,numpy as np
from spacy.vectors import Vectors
v=Vectors(); v.from_disk('dl/ko_core_news_lg/ko_core_news_lg-3.8.0/vocab')
old=json.load(open('/home/user/repo/games/similar/data/words.json'))
oq=np.fromfile('/home/user/repo/games/similar/data/vec.bin',dtype=np.int8).reshape(-1,300)
c=json.load(open('cand.json'))
manual="군밤 인공지능 선물상자 토끼띠 용띠 말띠 뱀띠 쥐띠 소띠 범띠 양띠 닭띠 개띠 돼지띠 원숭이띠 송년회 신년회 종무식 시무식 연말정산 성과급 상여금 워크숍 야유회 회식비 법인카드 칼퇴 칼퇴근 반차 월차 재택근무 단톡방 사내연애 팀장님 부장님 사장님 이사님 신입사원 산타할아버지 크리스마스트리 눈싸움 눈썰매 스키장 핫팩 호빵 군고구마 귤껍질 뱅쇼 연말연시 해돋이 떡국 세뱃돈 복주머니".split()
seen=set(old); extra=[]
def add(w):
    if w not in seen: seen.add(w); extra.append(w)
for w in manual: add(w)
for w,n in c['nouns']: add(w)
for w,n in c['preds']: add(w)
for w,n in c['comp']:
    if n>=2: add(w)
words=old+extra
print(len(old),len(extra),len(words))
X=v.get_batch(words)
X=np.asarray(X.get() if hasattr(X,'get') else X,dtype=np.float32)
# 예전 vec.bin과 같은 벡터인지 확인
a=X[:len(old)]; 
cos=lambda p,q:(p*q).sum(1)/np.linalg.norm(p,axis=1)/np.linalg.norm(q,axis=1)
print('old-vs-floret cos mean', cos(a,oq.astype(np.float32)).mean(), 'min', cos(a,oq.astype(np.float32)).min())
sc=127/np.abs(X).max(1,keepdims=True)
q=np.clip(np.round(X*sc),-127,127).astype(np.int8)
q[:len(old)]=oq   # 기존 단어는 예전 값을 그대로 (점수 변화 없게)
q.tofile('out_vec.bin')
json.dump({'core':len(old),'words':words},open('out_words.json','w'),ensure_ascii=False,separators=(',',':'))
