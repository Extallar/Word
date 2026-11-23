"""Excel(기출 어휘 분석) -> data/words.js 변환 스크립트.
사용법: python3 tools/extract.py <엑셀파일> [출력경로]"""
import sys, json, openpyxl

src = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else 'data/words.js'
wb = openpyxl.load_workbook(src, read_only=True, data_only=True)

def rows(name, skip):
    return [r for r in list(wb[name].iter_rows(values_only=True))[skip:] if r and r[0] is not None]

def s(v):
    return '' if v is None else str(v).strip()

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
    opts.setdefault((int(r[0]), int(r[1])), []).append(dict(no=int(r[2]), w=s(r[3]), m=s(r[4]), ok=s(r[5]) == '정답'))
circ = {'①': 1, '②': 2, '③': 3, '④': 4}
for r in rows('2022-23_보기64', 4):
    opts.setdefault((int(r[0]), int(r[1])), []).append(dict(no=circ.get(s(r[3]), r[3]), w=s(r[4]), m=s(r[5]), ok=s(r[6]) == '정답'))
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
        if k in known: return known[k], 0
    for k in cands:
        if k in extra: return extra[k], 1
    return '', 1

allw, seen_forms = [], set()
for r in rows('5개년_어간전체', 4):
    forms = [f.strip() for f in re.findall(r"([^,()]+)\(\d+\)", s(r[10]))]
    fl = [f.lower() for f in forms]
    seen_forms.update(fl)
    m, x = meaning([s(r[0]).lower()] + fl)
    allw.append(dict(w=s(r[0]), m=m, x=x, n=r[2] or 0, y=r[3] or 0, c=[r[4] or 0, r[5] or 0, r[6] or 0, r[7] or 0, r[8] or 0],
                     q=s(r[9]), f=', '.join(forms)))
for r in freq:
    w = s(r[0])
    if w.lower() in seen_forms: continue
    m, x = meaning([w.lower()])
    qs = ', '.join(f'{y}:{s(r[6 + i])}' for i, y in enumerate((2024, 2025, 2026)) if r[6 + i])
    allw.append(dict(w=w, m=m, x=x, n=r[1] or 0, y=r[2] or 0, c=[None, None, r[3] or 0, r[4] or 0, r[5] or 0], q=qs, f=w))
allw.sort(key=lambda d: (-d['n'], d['w']))
print('전체 단어', len(allw), '뜻 없음', sum(1 for d in allw if not d['m']), '보충 뜻', sum(d['x'] for d in allw))

data = dict(all=allw, vocab=vocab, repeat=repeat, core=core, ctx=ctx, grammar=grammar, reading=reading)
with open(out, 'w', encoding='utf-8') as f:
    f.write('// 자동 생성 파일: tools/extract.py\nwindow.WORD_DATA = ')
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')
print({k: len(v) for k, v in data.items()}, 'missing opts:', [(c['yr'], c['q']) for c in core if len(c['o']) != 4])
