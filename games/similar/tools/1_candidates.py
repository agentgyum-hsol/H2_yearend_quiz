# 1단계: spaCy ko_core_news_lg 의 strings.json 에서 Kiwi 형태소 분석으로 명사·동사·형용사·합성어 후보를 뽑아 cand.json 으로 저장
# 준비: pip install kiwipiepy, ko_core_news_lg 휠을 풀어 dl/ 아래에 둠
import json,re,collections
from kiwipiepy import Kiwi
kiwi=Kiwi()
s=json.load(open('dl/ko_core_news_lg/ko_core_news_lg-3.8.0/vocab/strings.json'))
h=[x for x in s if re.fullmatch('[가-힣]{1,7}',x)]
nouns=collections.Counter(); preds=collections.Counter(); comp=collections.Counter()
H=lambda f,a,b: re.fullmatch('[가-힣]{%d,%d}'%(a,b),f)
for i,res in enumerate(kiwi.analyze(h, top_n=1)):
    toks=res[0][0]
    for j,t in enumerate(toks):
        tag=t.tag.split('-')[0]
        nxt=toks[j+1] if j+1<len(toks) else None
        if tag in ('NNG','NNP') and (H(t.form,2,5) or (tag=='NNG' and H(t.form,1,1))):
            nouns[t.form]+=1
        if tag in ('VV','VA') and H(t.form,1,4):
            preds[t.form+'다']+=1
        if tag in ('XR','NNG') and H(t.form,1,4) and nxt and nxt.tag.split('-')[0] in ('XSA','XSV') and nxt.form=='하':
            preds[t.form+'하다']+=1
    # 명사+명사 합성어 (조사 앞까지가 문자열 그대로)
    nn=[t for t in toks if t.tag in('NNG','NNP')]
    if len(toks)>=2 and toks[0].tag in('NNG','NNP') and toks[1].tag in('NNG','NNP') and toks[1].start==toks[0].start+toks[0].len:
        f=h[i][:toks[1].start+toks[1].len]
        if H(f,3,5) and all(x.tag[0] in 'NJ' for x in toks[2:]): comp[f]+=1
json.dump({'nouns':nouns.most_common(),'preds':preds.most_common(),'comp':comp.most_common()},open('cand.json','w'),ensure_ascii=False)
print(len(nouns),len(preds),len(comp))
print([w for w,c in comp.most_common(40)], [w for w,c in comp.most_common()][-30:])
