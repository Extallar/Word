"""원문(data/exam.js)에서 단어를 표제어 단위로 다시 센다."""
import json, re, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from regroup import lemma, norm

STOP = set('''a about above after again against all am an and any are aren't as at be because been before being below between both but by
can cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't have haven't having he he'd
he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself let's me more most mustn't my myself
no nor not of off on once only or other ought our ours ourselves out over own same shan't she she'd she'll she's should shouldn't so some such than that that's
the their theirs them themselves then there there's these they they'd they'll they're they've this those through to too under until up very was wasn't we we'd
we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's with won't would wouldn't you you'd you'll you're
you've your yours yourself yourselves also may might must shall will can't us one two three four five six eight nine ten
st nd rd th s t d ll re ve m o pts'''.split())

TOKEN = re.compile(r"[A-Za-z]+(?:[’'\-][A-Za-z]+)*")

def load_exam(path):
    t = open(path, encoding='utf-8').read()
    return json.loads(t[t.index('=') + 1:].strip().rstrip(';'))

def units(E):
    """(연도, 문항번호 목록, 텍스트) 단위로 원문을 돌려준다. 지문은 한 번만 센다."""
    for y, ex in E.items():
        y = int(y)
        for i, p in enumerate(ex['passages']):
            qs = [q['q'] for q in ex['questions'] if q['psg'] == i]
            yield y, qs, p
        for q in ex['questions']:
            yield y, [q['q']], q['stem'] + ' ' + ' '.join(q['opts'] if not q['inline'] else [])

def count(E):
    lem = {}
    for y, qs, text in units(E):
        toks = []
        for tok in TOKEN.findall(text):
            toks.append(tok)
            if '-' in tok:  # 합성어는 전체와 각 부분을 모두 센다
                toks += [p for p in tok.split('-') if len(p) >= 3]
        for tok in toks:
            f = norm(tok)
            if f in STOP or len(f) < 2 or f.replace("'", '') in STOP:
                continue
            L = lemma(f)
            e = lem.setdefault(L, {'c': {}, 'q': {}, 'f': {}})
            e['c'][y] = e['c'].get(y, 0) + 1
            e['q'].setdefault(y, set()).update(qs)
            e['f'][f] = e['f'].get(f, 0) + 1
    return lem
