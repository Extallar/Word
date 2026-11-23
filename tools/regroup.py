"""5개년 어간 묶음을 표제어(lemma) 단위로 다시 묶는다.
Snowball 어간은 important/importance/import 처럼 다른 단어를 합치므로,
활용형(복수·시제·분사·3인칭)만 같은 표제어로 묶고 파생어는 분리한다."""
import re
from lemminflect import getAllLemmas

# 자동 표제어 추정이 틀리기 쉬운 형태를 직접 지정
OVERRIDE = {
    'left': 'left', 'means': 'means', 'better': 'better', 'best': 'best', 'worse': 'worse',
    'rose': 'rose', 'felt': 'feel', 'found': 'find', 'saw': 'see', 'lay': 'lie', 'lying': 'lie',
    'data': 'data', 'news': 'news', 'species': 'species', 'series': 'series', 'politics': 'politics',
    'physics': 'physics', 'economics': 'economics', 'ethics': 'ethics', 'electronics': 'electronics',
    'textiles': 'textile', 'findings': 'finding', 'offsprings': 'offspring', 'beings': 'being',
    'arts': 'art', 'humanities': 'humanities', 'goods': 'goods', 'clothes': 'clothes',
    'glasses': 'glass', 'media': 'media', 'phenomena': 'phenomenon', 'indices': 'index',
    'feet': 'foot', 'teeth': 'tooth', 'children': 'child', 'women': 'woman', 'men': 'man',
    'people': 'people', 'living': 'living', 'building': 'building', 'buildings': 'building',
    'painting': 'painting', 'paintings': 'painting', 'meeting': 'meeting', 'beginning': 'beginning',
    'feeling': 'feeling', 'feelings': 'feeling', 'training': 'training', 'teaching': 'teaching',
    'marketing': 'marketing', 'advertising': 'advertising', 'banking': 'banking', 'accounting': 'accounting',
    'funding': 'funding', 'housing': 'housing', 'clothing': 'clothing', 'packaging': 'packaging',
    'recycling': 'recycling', 'writing': 'writing', 'reading': 'reading', 'hearing': 'hearing',
    'learning': 'learning', 'understanding': 'understanding', 'setting': 'setting', 'smoking': 'smoking',
    'suffering': 'suffering', 'farming': 'farming', 'mining': 'mining', 'cooking': 'cooking',
    'concerning': 'concerning', 'according': 'according', 'following': 'following', 'including': 'including',
    'interesting': 'interesting', 'amazing': 'amazing', 'striking': 'striking', 'disturbing': 'disturbing',
    'threatening': 'threatening', 'shocking': 'shocking', 'exhausting': 'exhausting', 'confusing': 'confusing',
    'discouraging': 'discouraging', 'captivating': 'captivating', 'gripping': 'gripping', 'breathtaking': 'breathtaking',
    'exhilarating': 'exhilarating', 'astounding': 'astounding', 'devastating': 'devastating', 'tempting': 'tempting',
    'unnerving': 'unnerving', 'inviting': 'inviting', 'pressing': 'pressing', 'dizzying': 'dizzying',
    'diminishing': 'diminish', 'boiling': 'boil', 'sufferer': 'sufferer',
    'interested': 'interested', 'motivated': 'motivated', 'qualified': 'qualified', 'prepared': 'prepared',
    'advanced': 'advanced', 'complicated': 'complicated', 'sophisticated': 'sophisticated', 'balanced': 'balanced',
    'fascinated': 'fascinated', 'alarmed': 'alarmed', 'amused': 'amused',
    'thrilled': 'thrilled', 'intrigued': 'intrigued', 'outraged': 'outraged', 'distracted': 'distracted',
    'distressed': 'distressed', 'dejected': 'dejected', 'stranded': 'stranded', 'impoverished': 'impoverished',
    'endangered': 'endangered', 'educated': 'educated', 'uneducated': 'uneducated', 'experienced': 'experienced',
    'armed': 'armed', 'attached': 'attached', 'renowned': 'renowned', 'revered': 'revere', 'united': 'united',
    'used': 'use', 'based': 'based', 'known': 'know', 'born': 'born', 'given': 'give',
}

def norm(form):
    f = form.lower().replace('’', "'")
    f = re.sub(r"'s$", '', f)
    return f

def lemma(form):
    f = norm(form)
    if f in OVERRIDE:
        return OVERRIDE[f]
    if '-' in f or "'" in f:
        return f
    al = getAllLemmas(f)
    for pos in ('NOUN', 'VERB'):
        if pos in al and al[pos][0] != f:
            return al[pos][0]
    return f
