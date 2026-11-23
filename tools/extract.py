"""Excel(기출 어휘 분석) -> data/words.js 변환 스크립트.
사용법: python3 tools/extract.py <엑셀파일> [출력경로]"""
import sys, os, json, re, openpyxl

src = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else 'data/words.js'
wb = openpyxl.load_workbook(src, read_only=True, data_only=True)

def rows(name, skip):
    return [r for r in list(wb[name].iter_rows(values_only=True))[skip:] if r and r[0] is not None]

def s(v):
    return '' if v is None else str(v).strip()

def clean(v):
    return re.sub(r'\s*\d+/$', '', s(v))

vocab = []
for r in rows('우선암기_기출어휘', 4):
    vocab.append(dict(p=s(r[0]), w=s(r[1]), m=s(r[2]), n=r[3] or 0, y=r[4] or 0,
                      c=[r[5] or 0, r[6] or 0, r[7] or 0], q=[s(r[8]), s(r[9]), s(r[10])], f=s(r[11])))

repeat = []
for r in rows('3개년_반복핵심', 4):
    repeat.append(dict(w=s(r[0]), m=s(r[1]), n=r[2] or 0, c=[r[3] or 0, r[4] or 0, r[5] or 0]))

hints = {}
for r in rows('1-8번_핵심정답', 4):
    hints[(int(r[0]), int(r[1]))] = s(r[7])

core = []
for r in rows('5개년_핵심40', 4):
    if not isinstance(r[0], (int, float)):
        continue
    yr, q = int(r[0]), int(r[1])
    core.append(dict(yr=yr, q=q, t=s(r[2]), tw=s(r[3]), a=s(r[4]), no=r[5], m=s(r[6]),
                     re=s(r[7]), h=hints.get((yr, q)) or ('' if '공식 해설' in s(r[8]) else s(r[8]))))

opts = {}
for r in rows('1-8번_전체선택지', 4):
    opts.setdefault((int(r[0]), int(r[1])), []).append(dict(no=int(r[2]), w=clean(r[3]), m=s(r[4]), ok=s(r[5]) == '정답'))
circ = {'①': 1, '②': 2, '③': 3, '④': 4}
for r in rows('2022-23_보기64', 4):
    opts.setdefault((int(r[0]), int(r[1])), []).append(dict(no=circ.get(s(r[3]), r[3]), w=clean(r[4]), m=s(r[5]), ok=s(r[6]) == '정답'))
for c in core:
    c['o'] = sorted(opts.get((c['yr'], c['q']), []), key=lambda o: o['no'])

ctx = []
for r in rows('17-25번_문맥정답', 4):
    if not isinstance(r[0], (int, float)):
        continue
    ctx.append(dict(yr=int(r[0]), q=int(r[1]), no=r[2], a=s(r[3]), m=s(r[4]), why=s(r[5]), tip=s(r[6])))

grammar = [dict(t=s(r[0]), ex=s(r[1]), how=s(r[2]), eg=s(r[3])) for r in rows('문법_풀이법', 4)]
reading = [dict(t=s(r[0]), ex=s(r[1]), how=s(r[2])) for r in rows('독해_풀이법', 4)]

# ---- 전체 단어 (5개년 어간 전체 + 3개년 표기형 중 누락분) ----
import re, glob, os
known = {}
for v in vocab: known.setdefault(v['w'].lower(), v['m'])
for v in repeat: known.setdefault(v['w'].lower(), v['m'])
for c in core:
    known.setdefault(c['tw'].lower(), c['m'])
    for o in c['o']: known.setdefault(o['w'].lower(), o['m'])
freq = rows('전체표기형_빈도', 4)
for r in freq:
    if len(r) > 9 and r[9]: known.setdefault(s(r[0]).lower(), s(r[9]))
extra = {}
mdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'meanings')
for fn in sorted(glob.glob(os.path.join(mdir, '*.tsv'))):
    for line in open(fn, encoding='utf-8'):
        if '\t' in line:
            k, v = line.rstrip('\n').split('\t', 1)
            extra[k.lower()] = v

def meaning(cands):
    for k in cands:
        if known.get(k): return known[k], 0
    for k in cands:
        if k in extra: return extra[k], 1
    return '', 1

# 원문(data/exam.js)을 표제어 단위로 다시 센다. 엑셀 어간 묶음은 다른 단어가 섞여 쓰지 않는다.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recount import load_exam, count
from regroup import lemma as lemma_of
from wordfreq import zipf_frequency
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
EX = load_exam(os.path.join(ROOT, 'data', 'exam.js'))
LEM = count(EX)

def lem_phrase(t):
    w = re.findall(r"[A-Za-z][A-Za-z'’-]*", t)
    return lemma_of(w[0]) if w else ''

# 직접 출제: 1~8번 표적어·정답·보기, 17~25번 한 단어 정답. 여러 단어 표현은 구 그대로 따로 둔다.
direct, phrases = {}, {}
def mark(text, tag, m, yr, q):
    if len(text.split()) > 1:
        phrases.setdefault(text.lower(), dict(w=text, tag=tag, m=m, c={}, q={}))
        ph = phrases[text.lower()]; ph['c'][yr] = 1; ph['q'].setdefault(yr, set()).add(q)
    else:
        direct.setdefault(lem_phrase(text), tag)
for c in core:
    mark(c['tw'], '표적어' if c['t'] == '동의어' else '빈칸 정답', c['m'], c['yr'], c['q'])
    if c['a'] != c['tw']: mark(c['a'], '정답', c['m'], c['yr'], c['q'])
for c in core:
    for o in c['o']: mark(o['w'], '보기', o['m'], c['yr'], c['q'])
for y, ex in EX.items():
    for q in ex['questions']:
        if 17 <= q['q'] <= 25 and q['a'] and all(len(o.split()) == 1 for o in q['opts']):
            direct.setdefault(lem_phrase(q['opts'][q['a'] - 1]), '17~25 정답')

# 문제 지시문에 반복되는 단어(지문 어휘가 아님)
TEMPLATE = set('passage blank sentence paragraph underline suitable appropriate choose title statement following question answer complete best fill closest grammatically incorrect order position'.split())
PROPER = re.compile(r'^\((인명|지명|고유명사|인명/지명|지명/인명)\)')
YEARS = [2022, 2023, 2024, 2025, 2026]
allw = []
for L, e in LEM.items():
    forms = sorted(e['f'].items(), key=lambda kv: -kv[1])
    fl = [f for f, _ in forms]
    m, x = meaning([L] + fl)
    n = sum(e['c'].values()); yc = len(e['c'])
    z = zipf_frequency(L, 'en')
    if PROPER.match(m): t = '고유명사'
    elif z >= 5.0 or L in TEMPLATE: t = '기본'
    elif L in direct: t = '직접 출제'
    elif yc >= 2: t = '반복 학술'
    elif z < 3.6: t = '심화'
    else: t = '일반'
    allw.append(dict(w=L, m=m, x=x, n=n, y=yc, c=[e['c'].get(y, 0) for y in YEARS],
                     q=', '.join(f"{y}:" + ','.join(map(str, sorted(e['q'][y]))) for y in YEARS if y in e['q']),
                     f=', '.join(fl), fc=', '.join(f'{f}({k})' for f, k in forms), t=t, tg=direct.get(L, ''), z=round(z, 1)))
for k, ph in phrases.items():
    allw.append(dict(w=ph['w'], m=ph['m'], x=0, n=1, y=len(ph['c']), c=[ph['c'].get(y, 0) for y in YEARS],
                     q=', '.join(f"{y}:" + ','.join(map(str, sorted(ph['q'][y]))) for y in YEARS if y in ph['q']),
                     f=ph['w'].lower(), fc=ph['w'].lower() + '(1)', t='직접 출제', tg=ph['tag'], z=0))
TIER = ['직접 출제', '반복 학술', '심화', '일반', '기본', '고유명사']
allw.sort(key=lambda d: (TIER.index(d['t']), -d['y'], -d['n'], d['w']))
from collections import Counter
print('등급', Counter(d['t'] for d in allw))

# ---- 동의어: 기출 1~5번 정답 쌍 + data/synonyms/*.tsv ----
syn = {}
sdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'synonyms')
for fn in sorted(glob.glob(os.path.join(sdir, '*.tsv'))):
    for line in open(fn, encoding='utf-8'):
        if '\t' in line:
            k, v = line.rstrip('\n').split('\t', 1)
            v = v.strip()
            if v and v != '-': syn[k.lower()] = [x.strip() for x in v.split(',') if x.strip()]
exam = {}
for c in core:
    if c['t'] == '동의어':
        exam.setdefault(c['tw'].lower(), []).append(c['a'])
        exam.setdefault(c['a'].lower(), []).append(c['tw'])
def synonyms(cands):
    out = []
    for k in cands:
        for x in exam.get(k, []):
            if x.lower() not in [o.lower() for o in out]: out.append(x)
    for k in cands:
        if k in syn:
            for x in syn[k]:
                if x.lower() not in [o.lower() for o in out] and x.lower() not in cands: out.append(x)
            break
    return ', '.join(out[:4])
for d in allw:
    d['s'] = synonyms([d['w'].lower()] + [f.strip().lower() for f in d['f'].split(',') if f.strip()])
for v in vocab:
    v['s'] = synonyms([v['w'].lower()] + [f.strip().lower() for f in v['f'].split(',') if f.strip()])
for c in core:
    c['s'] = synonyms([c['tw'].lower()])
    for o in c['o']: o['s'] = synonyms([o['w'].lower()])
print('동의어 있음: 전체', sum(1 for d in allw if d['s']), '/', len(allw), ' 우선', sum(1 for v in vocab if v['s']), '/', len(vocab))
print('전체 단어', len(allw), '뜻 없음', sum(1 for d in allw if not d['m']), '보충 뜻', sum(d['x'] for d in allw))

data = dict(all=allw, vocab=vocab, repeat=repeat, core=core, ctx=ctx, grammar=grammar, reading=reading)
with open(out, 'w', encoding='utf-8') as f:
    f.write('// 자동 생성 파일: tools/extract.py\nwindow.WORD_DATA = ')
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')
print({k: len(v) for k, v in data.items()}, 'missing opts:', [(c['yr'], c['q']) for c in core if len(c['o']) != 4])
