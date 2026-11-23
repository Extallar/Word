"""기출 시험지/해설 PDF -> data/exam.js
사용법: python3 tools/parse_exam.py <PDF 폴더> data/exam.js
폴더에는 {연도}_q.pdf(문제), {연도}_a.pdf(해설)가 있어야 한다. pdftotext(poppler) 필요."""
import json, re, subprocess, sys, os

CIRC = '①②③④'

def run(args):
    return subprocess.run(args, capture_output=True, text=True, check=True).stdout

def columns(pdf):
    """2단 문제지를 왼쪽 단 → 오른쪽 단 순서로 읽는다."""
    n = int(re.search(r'Pages:\s+(\d+)', run(['pdfinfo', pdf])).group(1))
    out = []
    for p in range(1, n + 1):
        for x, w in ((0, 298), (298, 297)):
            out.append(run(['pdftotext', '-f', str(p), '-l', str(p), '-x', str(x), '-y', '0', '-W', str(w), '-H', '842', '-layout', pdf, '-']))
    return '\n'.join(out)

JUNK = [r'학년도.*(문제지|문|영어고사 문)$', r'^문제지$', r'^\d+\s*/$', r'^/\s*\d+$', r'^\d+\s*/\s*\d+$']

HEADERS = [r'\d{4}학년도 한국(산업기술|공학)대학교 ?편입학 ?영어고?사? ?문?제?지?', r'편입학 영어고(사 문제지)?', r'고사 문제지', r'한국산업기술대학교']

def clean_lines(text):
    lines = []
    for raw in text.split('\n'):
        s = re.sub(r'\s+', ' ', raw)
        for h in HEADERS:
            s = re.sub(h, ' ', s)
        s = s.strip()
        if not s or any(re.search(j, s) for j in JUNK):
            continue
        lines.append(s)
    # 표지 제거: 첫 [Questions 전까지
    for i, s in enumerate(lines):
        if s.startswith('[Question'):
            return lines[i:]
    return lines

def join(parts):
    t = ' '.join(parts)
    t = re.sub(r'(\w)- (\w)', r'\1-\2', t)  # 줄바꿈 하이픈
    return re.sub(r'\s+', ' ', t).strip()

def split_options(body):
    i = body.find('①')
    if i < 0 or not all(c in body[i:] for c in CIRC):
        return body, []
    stem, rest = body[:i].strip(), body[i:]
    opts = [o.strip() for o in re.split('[①②③④]', rest)[1:]]
    return stem, opts

def parse_questions(lines):
    sections, passages, qs = [], [], []
    expect = 1
    cur = None  # ('instr'|'passage'|'q', obj)
    for s in lines:
        m = re.match(r'^\[Questions? (\d+)(?:\s*-\s*(\d+))?\]\s*(.*)$', s)
        if m:
            a, b, rest = int(m.group(1)), int(m.group(2) or m.group(1)), m.group(3)
            if rest and not re.match(r'^\(\d+ ?pts?\.?\)$', rest):
                obj = {'from': a, 'to': b, 'text': [rest]}; sections.append(obj); cur = ('instr', obj)
            else:
                obj = {'from': a, 'to': b, 'text': []}; passages.append(obj); cur = ('passage', obj)
            continue
        m = re.match(r'^(\d{1,2})\.\s*(.*)$', s)
        if m and int(m.group(1)) == expect:
            obj = {'q': expect, 'body': [m.group(2)]}; qs.append(obj); cur = ('q', obj); expect += 1
            continue
        if cur is None:
            continue
        if cur[0] == 'instr':
            cur[1]['text'].append(s)
        elif cur[0] == 'passage':
            cur[1]['text'].append(s)
        else:
            cur[1]['body'].append(s)
    for o in sections: o['text'] = join(o['text'])
    for o in passages: o['text'] = join(o['text'])
    out = []
    for q in qs:
        body = join(q['body'])
        pts = 2.5
        pm = re.search(r'\((\d(?:\.\d)?) ?pts?\.?\)', body)
        if pm:
            pts = float(pm.group(1)); body = (body[:pm.start()] + body[pm.end():]).strip()
            body = re.sub(r'\s+', ' ', body)
        sec = next((x for x in sections if x['from'] <= q['q'] <= x['to']), None)
        psg = next((i for i, x in enumerate(passages) if x['from'] <= q['q'] <= x['to']), None)
        inline = sec and 'INCORRECT' in sec['text'].upper()
        if inline:
            stem, opts = body, [re.match(r'\s*(\S+(?: \S+)?)', seg).group(1) if seg.strip() else '' for seg in re.split('[①②③④]', body)[1:5]]
        else:
            stem, opts = split_options(body)
        out.append({'q': q['q'], 'stem': stem, 'opts': opts, 'pts': pts, 'inline': bool(inline),
                    'sec': sections.index(sec) if sec else None, 'psg': psg})
    return [s['text'] for s in sections], [p['text'] for p in passages], out

# 해설 PDF는 한글 단어 중간에서 줄이 바뀐다("의미\n가"). 다음 줄이 조사·어미로 시작하면 붙인다.
PARTICLES = set('가 이 을 를 은 는 의 에 도 와 과 로 다 고 며 서 게 지 한 할 된 될 함 됨 해 히 하다 이다 하고 하여 했다 에서 으로 에게 까지 부터 라는 이라는 하는 되는 된다 한다 이며 이고 였다 이었다 하였다 하지 하게 하기 했고 해야 이므로 므로 처럼 보다 만 뿐 적 적인 적으로 성 들 들이 들을 들의'.split())
def join_ko(lines):
    out = ''
    for l in lines:
        if out and re.search(r'[가-힣]$', out):
            tok = re.match(r'([가-힣]+)', l)
            if tok and tok.group(1) in PARTICLES:
                out += l; continue
        out = (out + ' ' + l) if out else l
    return out

def parse_answers(pdf):
    text = run(['pdftotext', pdf, '-'])
    lines = [re.sub(r'\s+', ' ', l).strip() for l in text.split('\n')]
    lines = [l for l in lines if l and not re.match(r'^(\d+\s*/|/\s*\d+|\d+\s*/\s*\d+)$', l)]
    res, cur, pending = {}, None, None
    for l in lines:
        if pending and re.fullmatch(r'[①②③④]', l):
            l = f'{pending}. {l}'
        pending = None
        mm = re.fullmatch(r'(\d{1,2})\.', l)
        if mm:
            pending = int(mm.group(1)); continue
        m = re.match(r'^(\d{1,2})\.\s*([①②③④])\s*(.*)$', l)
        if m and 1 <= int(m.group(1)) <= 40 and int(m.group(1)) not in res:
            cur = int(m.group(1)); res[cur] = {'a': CIRC.index(m.group(2)) + 1, 'ex': [m.group(3)] if m.group(3) else []}
            continue
        if cur and not re.match(r'^(<|\[?문항|정답$)', l):
            res[cur]['ex'].append(l)
    for k, v in res.items():
        t = join_ko(v['ex'])
        t = re.sub(r'^\[설명\]\s*', '', t)
        t = re.sub(r'\s*\[설명\]\s*', ' ', t)
        v['ex'] = re.sub(r'\s+', ' ', t).strip()
    # 정답표(문항/정답 행)에서 보충
    table = {}
    nums, ans = [], []
    for l in lines:
        if re.fullmatch(r'\d{1,2}', l): nums.append(int(l))
        elif re.fullmatch(r'[①②③④]', l): ans.append(CIRC.index(l) + 1)
    for n, a in zip(nums, ans):
        if 1 <= n <= 40 and n not in table: table[n] = a
    return res, table

def main(folder, out):
    data = {}
    for y in range(2022, 2027):
        q = os.path.join(folder, f'{y}_q.pdf'); a = os.path.join(folder, f'{y}_a.pdf')
        if not os.path.exists(q): continue
        secs, psgs, qs = parse_questions(clean_lines(columns(q)))
        ans, table = parse_answers(a) if os.path.exists(a) else ({}, {})
        for x in qs:
            r = ans.get(x['q'])
            x['a'] = r['a'] if r else table.get(x['q'])
            x['ex'] = r['ex'] if r else ''
        data[y] = {'sections': secs, 'passages': psgs, 'questions': qs}
        print(y, '문항', len(qs), '지문', len(psgs), '정답', sum(1 for x in qs if x['a']), '해설', sum(1 for x in qs if x['ex']),
              '보기4개 아님', [x['q'] for x in qs if len(x['opts']) != 4])
    with open(out, 'w', encoding='utf-8') as f:
        f.write('// 자동 생성 파일: tools/parse_exam.py\nwindow.EXAM_DATA = ')
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'data/exam.js')
