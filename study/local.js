/* 기본 모드(키 없이, 무료): 브라우저 안에서 규칙으로 요약·용어·문제를 만든다.
   1) 문장·제목 나누기 → 2) 핵심어 고르기(한국어 조사 떼기, 영어 단·복수 묶기, 두 단어 구, 여러 문장에 퍼진 정도)
   3) 정의 문장 찾기("~란 ~이다", "~를 말한다", "X is a ...", "용어: 설명")
   4) 문제: 정의 객관식(양방향), 빈칸(비슷한 보기), 숫자, 내용 바꾼 OX, 단답 → 유형·난이도 설정에 맞춰 고르게 섞는다. */
(function () {
  "use strict";
  var S = window.Study = window.Study || {};
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function uniq(a) { var seen = {}; return a.filter(function (x) { var k = String(x).toLowerCase(); if (seen[k]) return false; seen[k] = 1; return true; }); }
  function shortTitle(t) { t = t.replace(/\s+/g, " ").trim(); if (t.length <= 40) return t; var c = t.slice(0, 40), sp = c.lastIndexOf(" "); return (sp > 20 ? c.slice(0, sp) : c) + "…"; }
  function isEnglish(t) { var en = (t.match(/[A-Za-z]/g) || []).length, ko = (t.match(/[가-힣]/g) || []).length; return en > ko * 2; }
  function script(w) { return /[가-힣]/.test(w) ? "ko" : /^[\d.,%]+/.test(w) ? "num" : "en"; }

  /* ---------- 1. 문장·제목 ---------- */
  var ABBR = /\b(e\.g|i\.e|etc|vs|Dr|Mr|Mrs|Ms|Prof|St|No|Fig|cf|al)\.$/i;
  function splitSents(t) { return parse(t).sents.map(function (s) { return s.text; }); }
  function parse(text) {
    var lines = text.replace(/\r/g, "").split("\n"), sents = [], heads = [], para = 0, section = -1, defs = [];
    function isHead(l, next) {
      var t = l.trim();
      if (!t || t.length > 40) return false;
      if (/^#{1,6}\s/.test(t)) return true;
      if (/^(제\s*\d+\s*[장절편]|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\.|[IVX]+\.\s|Chapter\s+\d+|\d+(\.\d+)*\.?\s+\S)/i.test(t)) return t.length <= 30 && !/[.?!。]$/.test(t);
      return !/[.?!。:;,]$/.test(t) && !/[다요]$/.test(t) && next && next.trim().length > t.length;
    }
    for (var i = 0; i < lines.length; i++) {
      // 슬라이드 글머리표 기호(¡ l § ® ●)를 떼고, 쪽 표시·쪽 번호·의사 코드 줄·입출력 설명은 문장으로 쓰지 않는다.
      var l = lines[i].trim().replace(/^(?:[¡§®•▪◦●○■□➢✓]|l(?=\s+\S.*[가-힣]))\s*/, "");
      if (!l) { para++; continue; }
      if (/^\[p\.\d+\]$/.test(l) || /^\d{1,3}$/.test(l) || /^(입력|출력|Input|Output)\s*:/i.test(l)) continue;
      if (/^\d{1,2}\.\s+/.test(l) && CODE_KW.test(l.replace(/^\d{1,2}\.\s+/, "")) && /\b(for|while|if|return)\b|[←↔]|\[[^\]]*\]\s*=|=\s*\S/.test(l)) continue;
      if (/^\s{2,}/.test(lines[i]) && i > 0 && /^\s*\d{1,2}\.\s/.test(lines[i - 1]) && CODE_KW.test(lines[i])) continue;
      var next = lines.slice(i + 1).filter(function (x) { return x.trim(); })[0];
      // "용어: 설명" 형식 필기
      var m = l.match(/^\s*[-•*·▶◦]?\s*([^:：]{1,30}?)\s*[:：]\s+(.{6,})$/) || l.match(/^\s*[-•*·▶◦]?\s*([^–—-]{1,30}?)\s+[–—-]\s+(.{6,})$/);
      var isNote = !!(m && m[1].split(/\s+/).length <= 4 && !/[.?!]$/.test(m[1]));
      if (isNote) defs.push({ term: clean(m[1]), def: m[2].trim().replace(/\.$/, ""), src: l, how: "note" });
      if (isHead(l, next)) { section = heads.length; heads.push(l.replace(/^#+\s*/, "")); para++; continue; }
      var body = l.replace(/^\s*[-•*·▶◦]\s*/, "").replace(/^\d+[.)]\s+/, "");
      var parts = body.split(/(?<=[.!?。])\s+(?=[A-Z가-힣0-9"'(\[“‘])|(?<=다\.|요\.|함\.|음\.|임\.)\s*/);
      // 약어(e.g. Dr.) 뒤에서 잘못 잘린 조각을 다시 붙인다.
      var merged = [];
      parts.forEach(function (p) { p = p.trim(); if (!p) return; if (merged.length && ABBR.test(merged[merged.length - 1])) merged[merged.length - 1] += " " + p; else merged.push(p); });
      merged.forEach(function (p, k) { if (p.length >= 12 && p.length <= 400) sents.push({ text: p, para: para, sec: section, first: k === 0, idx: sents.length, note: isNote }); });
    }
    return { sents: sents, heads: heads, defs: defs };
  }
  function clean(t) { return t.replace(/^[-•*·▶◦\s]+|[\s"'“”‘’()]+$/g, "").replace(/^["'“‘(]+/, "").trim(); }

  /* ---------- 2. 핵심어 ---------- */
  var STOP = {};
  ("the a an and or but of to in on at for with by from as is are was were be been being this that these those it its they them their we our you your he she his her him not no nor can could will would should may might must shall do does did done have has had having which who whom whose what when where why how than then there here also such into onto over under about above below more most less least other others some any each every all both either neither only very just so if because while although though however therefore thus hence yet still even since until unless whether one two first second many much few new old same different another own upon among between through during before after against without within via per like often usually generally example instance called known used using use make made way ways thing things lot get got suggest suggests suggested show shows showed shown require requires required possess possesses exhibit exhibits observe observed avoid avoids explain explained explains reconsider remain remains remained define defined deserve deserves consider considered include includes included provide provides provided allow allows allowed become becomes became seem seems seemed tend tends found find finds take takes took give gives given help helps want need needs difficult easy uncertain likely unlikely recent recently complex simple simpler long short future past able unable important possible certain various several whole entire main major minor large small great good bad high low little big real true false").split(" ").forEach(function (w) { STOP[w] = 1; });
  ("것 수 등 때 곳 중 및 더 잘 매우 가장 바로 모든 각 그 이 저 우리 그것 이것 저것 무엇 누구 어디 언제 어떻게 왜 그리고 그러나 하지만 그래서 그러므로 따라서 또한 또는 혹은 즉 예를 예컨대 경우 정도 이상 이하 사이 위해 대해 대한 통해 따라 의해 위한 관한 때문 다음 이후 이전 자신 자기 하나 둘 여러 많은 다른 같은 이런 저런 그런 어떤 모든 없이 있는 없는 하는 되는 된다 한다 했다 있다 없다 이다 아니다 부분 문제 사실 내용 생각 결과 방법 정리 설명 의미 사용 이용 이번 우선 먼저 가지 말 점 측면").split(" ").forEach(function (w) { STOP[w] = 1; });
  var JOSA = ["으로부터", "에서부터", "으로써", "으로서", "에게서", "에서는", "에서도", "이라는", "이라고", "이라면", "으로는", "에게는", "까지는", "에서", "에게", "으로", "까지", "부터", "처럼", "보다", "이란", "이나", "이며", "이고", "이다", "이었", "와는", "과는", "에는", "에도", "로는", "라는", "라고", "만큼", "마다", "조차", "밖에", "은", "는", "이", "가", "을", "를", "의", "에", "로", "와", "과", "도", "만", "란", "며", "랑"];
  var VERBISH = /(하다|한다|했다|하는|하고|하며|하여|해서|하면|되다|된다|됐다|되는|되고|되어|있다|있는|있고|없다|없는|이다|였다|인다|않다|않는|같다|같은|위해|통해|따라|이며|에서|으며|면서|지만|는데|다가|도록|려고|으면|하게|롭게|스럽|었다|았다|겠다)$/;
  // 명사 뒤에만 붙는 조사: 이 조사와 함께 쓰이거나 조사 없이 쓰인 적이 있어야 명사로 본다(일어나는·흡수하는 같은 동사 거르기).
  var NOUN_JOSA = { "을": 1, "를": 1, "의": 1, "에": 1, "에서": 1, "에서는": 1, "에서도": 1, "와": 1, "과": 1, "으로": 1, "로": 1, "으로는": 1, "로는": 1, "이다": 1, "이란": 1, "란": 1, "에는": 1, "에도": 1, "처럼": 1, "보다": 1, "까지": 1, "부터": 1, "에게": 1, "이라는": 1, "라는": 1, "이며": 1, "이고": 1, "과는": 1, "와는": 1, "": 1 };
  function stemKo(w, info) {
    if (w.length < 2) return "";
    var suf = "";
    for (var i = 0; i < JOSA.length; i++) { var j = JOSA[i]; if (w.length - j.length >= 2 && w.slice(-j.length) === j) { suf = j; w = w.slice(0, -j.length); break; } }
    if (VERBISH.test(w) || /[다요고며면서게지니]$/.test(w) && w.length <= 3) return "";
    if (/(하|되|시키|당하)(지|여|고|며|면|게|기|던|도록|였|었|겠)?$/.test(w) && w.length >= 3) return "";
    if (info) info.noun = !!NOUN_JOSA[suf];
    return w;
  }
  function lemEn(w) {
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + "y";
    if (w.length > 4 && /(ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/(ss|us|is|ous)$/.test(w)) return w.slice(0, -1);
    return w;
  }
  // 한 문장에서 (정규화된 핵심어, 원문 표기) 목록
  function tokens(s) {
    var out = [];
    (s.match(/[A-Za-z][A-Za-z'-]*[A-Za-z]|[가-힣A-Za-z0-9]*[가-힣]+[가-힣A-Za-z0-9]*/g) || []).forEach(function (w) {
      if (/[가-힣]/.test(w)) { var info = {}, k = stemKo(w, info); if (k && !STOP[k]) out.push({ k: k, surf: k, noun: info.noun }); }
      else { var lw = w.toLowerCase(); if (lw.length >= 3 && !STOP[lw] && !/(ly|ing|ed)$/.test(lw)) out.push({ k: lemEn(lw), surf: w, cap: /^[A-Z]/.test(w) }); }
    });
    return out;
  }
  function keywords(P, en) {
    var tf = {}, sf = {}, surf = {}, cap = {}, bi = {}, biSurf = {}, noun = {};
    P.sents.forEach(function (s, si) {
      var ts = tokens(s.text), seen = {};
      ts.forEach(function (t, i) {
        tf[t.k] = (tf[t.k] || 0) + 1;
        if (t.noun) noun[t.k] = 1;
        if (!seen[t.k]) { sf[t.k] = (sf[t.k] || 0) + 1; seen[t.k] = 1; }
        surf[t.k] = surf[t.k] || {}; surf[t.k][t.surf] = (surf[t.k][t.surf] || 0) + 1;
        if (t.cap && i > 0) cap[t.k] = (cap[t.k] || 0) + 1;
        var n = ts[i + 1];
        if (en && n) {
          var re = new RegExp("\\b" + escRe(t.surf) + "\\s+" + escRe(n.surf) + "\\b", "i"), mm = s.text.match(re);
          if (mm) { var bk = t.k + " " + n.k; bi[bk] = (bi[bk] || 0) + 1; biSurf[bk] = mm[0]; }
        }
      });
    });
    var N = P.sents.length || 1, list = [];
    Object.keys(tf).forEach(function (k) {
      if (tf[k] < 2 && !(N < 8 && k.length >= (en ? 7 : 3))) return;
      if (/[가-힣]/.test(k) && !noun[k]) return;
      var best = Object.keys(surf[k]).sort(function (a, b) { return surf[k][b] - surf[k][a]; })[0];
      var w = tf[k] * (1 + Math.log(1 + sf[k])) * (en ? Math.min(k.length, 10) / 6 : Math.min(k.length, 5) / 3) + (cap[k] ? 1.5 : 0);
      if (sf[k] > N * 0.6 && N > 6) w *= 0.6; // 거의 모든 문장에 나오는 말은 덜 중요
      list.push({ k: k, w: w, word: best, n: tf[k], sf: sf[k] });
    });
    Object.keys(bi).forEach(function (bk) { if (bi[bk] >= 2) list.push({ k: bk, w: bi[bk] * 4, word: biSurf[bk], n: bi[bk], sf: bi[bk], phrase: true }); });
    var phrases = list.filter(function (x) { return x.phrase; });
    list = list.filter(function (x) { return x.phrase || !phrases.some(function (ph) { return ph.k.split(" ").indexOf(x.k) >= 0 && ph.n >= x.n; }); });
    list.sort(function (a, b) { return b.w - a.w; });
    return list.slice(0, 40);
  }

  /* ---------- 3. 정의 문장 ---------- */
  function findDefs(P, en) {
    var defs = P.defs.slice();
    P.sents.forEach(function (s) {
      var t = s.text.replace(/\s+/g, " "), m;
      if (en) {
        m = t.match(/^(?:An?|The)?\s*([A-Za-z][A-Za-z\s-]{1,40}?)\s+(?:is|are)\s+(?:defined as|called|known as|referred to as)\s+(.+?)\.?$/i) ||
            t.match(/^(?:An?|The)?\s*([A-Za-z][A-Za-z\s-]{1,40}?)\s+(?:refers? to|means?|describes?)\s+(.+?)\.?$/i) ||
            t.match(/^(?:An?|The)?\s*([A-Za-z][A-Za-z\s-]{1,30}?)\s+(?:is|are)\s+((?:a|an|the)\s+.{8,}?)\.?$/i);
        if (m && m[1].trim().split(/\s+/).length <= 4 && !STOP[m[1].trim().toLowerCase()] && !/^(it|this|that|there|these|those|they|he|she)$/i.test(m[1].trim())) defs.push({ term: m[1].trim(), def: m[2].trim(), src: s.text, idx: s.idx });
      } else {
        m = t.match(/^(.{2,20}?)(?:이)?란\s+(.+?)(?:을|를)?\s*(?:말한다|뜻한다|의미한다|가리킨다|일컫는다|이다|다)\.?$/) ||
            t.match(/^(.{2,20}?)(?:은|는)\s+(.+?)(?:을|를)\s*(?:말한다|뜻한다|의미한다|가리킨다|일컫는다)\.?$/) ||
            t.match(/^(.{2,20}?)(?:은|는)\s+(.{6,}?(?:것|과정|현상|방법|물질|기관|단계|상태|능력|이론|개념|법칙|원리|체계|제도|구조|작용|활동|장치|단위|성질|관계|기술|조직|요소|형태|과학|학문|분야|사람|집단|시기|운동|정책|반응))(?:이다|입니다|이에요|예요)\.?$/) ||
            t.match(/^(.{2,20}?)(?:이라고|라고)\s+(?:한다|부른다)\.?$/) && null;
        if (m) { var term = m[1].trim(); if (term.split(/\s+/).length <= 3 && !/[,]/.test(term) && !STOP[term]) defs.push({ term: term, def: m[2].trim(), src: s.text, idx: s.idx }); }
        // "...을 X라고 한다/부른다"
        m = t.match(/^(.{8,}?)(?:을|를)\s+(.{2,15}?)(?:이)?라고\s+(?:한다|부른다|일컫는다)\.?$/);
        if (m) defs.push({ term: m[2].trim(), def: m[1].trim(), src: s.text, idx: s.idx });
      }
    });
    // 같은 용어는 하나만
    var seen = {};
    return defs.filter(function (d) { var k = d.term.toLowerCase(); if (seen[k] || d.def.length < 4 || d.term.length > 40) return false; seen[k] = 1; return true; });
  }

  /* ---------- 조사 맞추기 (받침 유무) ---------- */
  var JPAIR = [["이라는", "라는"], ["이란", "란"], ["이나", "나"], ["이며", "며"], ["으로", "로"], ["은", "는"], ["이", "가"], ["을", "를"], ["과", "와"]];
  function batchim(w) { var c = w.charCodeAt(w.length - 1); if (c < 0xAC00 || c > 0xD7A3) return /[0-9LMNRlmnr]$/.test(w) ? 1 : 0; return (c - 0xAC00) % 28; }
  var JRE = "(" + JPAIR.map(function (p) { return p.join("|"); }).join("|") + ")?";
  function josaFor(w, j) {
    for (var i = 0; i < JPAIR.length; i++) if (JPAIR[i].indexOf(j) >= 0) {
      var b = batchim(w);
      if (JPAIR[i][0] === "으로") return b && b !== 8 ? "으로" : "로"; // ㄹ 받침은 '로'
      return b ? JPAIR[i][0] : JPAIR[i][1];
    }
    return j;
  }
  function joPair(j) { for (var i = 0; i < JPAIR.length; i++) if (JPAIR[i].indexOf(j) >= 0) return JPAIR[i][0] + "(" + JPAIR[i][1] + ")"; return j; }
  // 문장에서 word를 rep로 바꾸며 뒤 조사도 맞춘다.
  function swapKo(sent, word, rep) { return sent.replace(new RegExp(escRe(word) + JRE), function (m, j) { return rep + (j ? josaFor(rep, j) : ""); }); }

  /* ---------- 보기(오답) 고르기 ---------- */
  function similar(a, b) {
    var la = a.length, lb = b.length, s = 1 - Math.abs(la - lb) / Math.max(la, lb);
    if (script(a) !== script(b)) return -1;
    if (/^[A-Z]/.test(a) === /^[A-Z]/.test(b)) s += 0.3;
    if (a.split(" ").length === b.split(" ").length) s += 0.3;
    var sa = a.slice(-2), sb = b.slice(-2); if (sa === sb) s += 0.2;  // 같은 어미·접미(…tion, …성)
    return s;
  }
  function distractors(ans, pool, ctx, level, k) {
    var al = ans.toLowerCase();
    var c = uniq(pool).filter(function (x) {
      var xl = x.toLowerCase();
      return xl !== al && xl.indexOf(al) < 0 && al.indexOf(xl) < 0 && script(x) === script(ans) && (!ctx || ctx.toLowerCase().indexOf(xl) < 0);
    });
    if (level === "쉬움") c = shuffle(c);
    else {
      c = c.map(function (x) { return { x: x, s: similar(ans, x) + Math.random() * (level === "어려움" ? 0.15 : 0.5) }; }).sort(function (a, b) { return b.s - a.s; }).map(function (o) { return o.x; });
    }
    return c.slice(0, k || 3);
  }
  function numDistract(v) {
    var n = parseFloat(v.replace(/,/g, "")), unit = v.replace(/^[\d.,\s]+/, ""), out = [];
    if (isNaN(n)) return out;
    var isYear = n >= 1000 && n <= 2100 && n % 1 === 0 && !unit;
    var cands = isYear ? [n - 10, n + 10, n - 1, n + 1, n - 100, n + 5] : n % 1 ? [n * 2, n / 2, n + 1, n - 1, n * 10].map(function (x) { return +x.toFixed(2); })
      : [n * 2, Math.round(n / 2), n + (n >= 10 ? 10 : 1), n - (n >= 10 ? 10 : 1), n * 10, n + Math.max(1, Math.round(n * 0.3))];
    cands.forEach(function (x) { if (x > 0 && x !== n) out.push((isYear ? String(x) : x.toLocaleString("en-US")) + unit); });
    return uniq(out).slice(0, 3);
  }

  /* ---------- OX용 내용 바꾸기 ---------- */
  var FLIP_KO = [["증가", "감소"], ["높", "낮"], ["많", "적"], ["크", "작"], ["늘어", "줄어"], ["상승", "하락"], ["가능", "불가능"], ["있다", "없다"], ["있는", "없는"], ["포함", "제외"], ["강화", "약화"], ["확대", "축소"], ["흡수", "방출"], ["장점", "단점"], ["긍정", "부정"], ["이전", "이후"], ["내부", "외부"], ["직접", "간접"], ["필요하", "불필요하"], ["빠르", "느리"], ["쉽", "어렵"], ["최초", "최후"], ["동일", "상이"], ["찬성", "반대"]];
  var FLIP_EN = [["increase", "decrease"], ["increases", "decreases"], ["increased", "decreased"], ["more", "less"], ["higher", "lower"], ["high", "low"], ["larger", "smaller"], ["large", "small"], ["before", "after"], ["always", "never"], ["can", "cannot"], ["is", "is not"], ["are", "are not"], ["positive", "negative"], ["rise", "fall"], ["rises", "falls"], ["strong", "weak"], ["stronger", "weaker"], ["inside", "outside"], ["first", "last"], ["most", "least"], ["easier", "harder"], ["possible", "impossible"], ["include", "exclude"], ["includes", "excludes"], ["accept", "reject"], ["support", "oppose"], ["supports", "opposes"], ["absorb", "release"], ["absorbs", "releases"]];
  function flip(sent, en) {
    var pairs = en ? FLIP_EN : FLIP_KO;
    for (var r = 0; r < 2; r++) {
      var order = shuffle(pairs);
      for (var i = 0; i < order.length; i++) {
        var a = order[i][r], b = order[i][1 - r];
        if (r === 1 && /not|불|cannot/.test(b) && !/not|불|cannot/.test(a)) continue;
        var re = en ? new RegExp("\\b" + escRe(a) + "\\b") : new RegExp(escRe(a));
        if (re.test(sent) && !(en ? new RegExp("\\b" + escRe(b) + "\\b") : new RegExp(escRe(b))).test(sent)) {
          if (!en && a === "가능" && /불가능/.test(sent)) continue;
          return { text: sent.replace(re, b), from: a, to: b };
        }
      }
    }
    return null;
  }

  /* ---------- 의사 코드 찾기 → 빈칸 문제 ---------- */
  var CODE_KW = /\b(for|while|if|else|return|to|and|or|do|repeat|until|then)\b|[←↔=<>]|\[[^\]]*\]/;
  function findCode(text) {
    var lines = text.replace(/\r/g, "").split("\n"), blocks = [], cur = null;
    function flush() { if (cur && cur.lines.length >= 3) blocks.push(cur); cur = null; }
    lines.forEach(function (raw, i) {
      var l = raw.replace(/\s+$/, ""), m = l.match(/^\s*(\d{1,2})\.\s+(.*)$/);
      if (m && CODE_KW.test(m[2]) && m[2].length < 120) {
        var num = +m[1];
        if (!cur || num !== cur.next) { flush(); if (num !== 1) return; cur = { lines: [], next: 1, start: i }; }
        cur.lines.push(num + ". " + m[2].trim()); cur.next = num + 1;
      } else if (cur && /^\s{2,}\S/.test(raw) && cur.lines.length) cur.lines[cur.lines.length - 1] += " " + l.trim();
      else if (cur && l.trim()) flush();
    });
    flush();
    blocks.forEach(function (b) {
      // 블록 바로 위의 이름(BubbleSort 같은 한 단어)과 [p.N] 표시를 찾는다.
      for (var k = b.start - 1; k >= Math.max(0, b.start - 6); k--) {
        var t = lines[k].trim();
        if (!b.title && /^[A-Za-z][A-Za-z0-9_]{2,30}$/.test(t)) b.title = t;
        var pm = t.match(/^\[p\.(\d+)\]$/); if (pm && !b.page) b.page = "p." + pm[1];
      }
      if (!b.page) for (var k2 = b.start; k2 >= 0; k2--) { var pm2 = lines[k2].trim().match(/^\[p\.(\d+)\]$/); if (pm2) { b.page = "p." + pm2[1]; break; } }
      b.title = b.title || "의사 코드";
      b.code = b.lines.join("\n");
    });
    return blocks;
  }
  // 한 줄에서 빈칸으로 낼 후보: 반복 끝 범위, 비교 연산자, 배열 인덱스, 대입의 오른쪽
  function codeBlanks(line) {
    var body = line.replace(/^\d+\.\s*/, "").replace(/\/\/.*$/, "").trim(), out = [];
    var m = body.match(/\bto\s+([^\s]+)/); if (m) out.push({ kind: "bound", t: m[1] });
    m = body.match(/\s(>=|<=|>|<|==|!=)\s/); if (m) out.push({ kind: "op", t: m[1] });
    m = body.match(/\[([^\]]+)\]/); if (m && !/^\d+$/.test(m[1])) out.push({ kind: "idx", t: m[1] });
    m = body.match(/(?:=|←)\s*([^=←]+)$/); if (m && !/^(for|while|if)\b/.test(body) && m[1].trim().length <= 24 && !/^\s*[<>]/.test(m[1])) out.push({ kind: "rhs", t: m[1].trim() });
    return out;
  }
  function codeQuestions(blocks, level) {
    var qs = [], OPS = [">", "<", ">=", "<="], pool = { bound: ["n", "n-1", "n-2", "k", "n-pass", "heapSize"], idx: ["i", "j", "i+1", "j+1", "i-1", "j-h", "min", "heapSize"], rhs: ["i", "j", "j-1", "i-1", "j-h", "n", "A[i]", "A[j]"] };
    blocks.forEach(function (b) {
      var cands = [];
      b.lines.forEach(function (l, li) { codeBlanks(l).forEach(function (c) { cands.push({ li: li, c: c }); }); });
      // 같은 종류끼리 보기를 모은다(이 코드 안의 다른 값 + 자주 쓰는 값)
      cands.forEach(function (x) { if (pool[x.c.kind]) pool[x.c.kind].push(x.c.t); });
      shuffle(cands).slice(0, Math.min(cands.length, level === "어려움" ? 6 : 4)).forEach(function (x) {
        var line = b.lines[x.li], t = x.c.t, cp = line.replace(/\/\/.*$/, ""), at = x.c.kind === "bound" ? cp.lastIndexOf(t) : cp.indexOf(t);
        if (at < 0) return;
        var shown = b.lines.slice(); shown[x.li] = line.slice(0, at) + "_____" + line.slice(at + t.length);
        var opts = x.c.kind === "op" ? OPS.slice() : [t].concat(shuffle(uniq(pool[x.c.kind].filter(function (o) { return o !== t; }))).slice(0, 3));
        opts = uniq(opts); if (opts.indexOf(t) < 0 || opts.length < 3) return;
        qs.push({ type: "blank", question: "다음은 " + b.title + " 의사 코드다. 빈칸에 들어갈 것은?\n```\n" + shown.join("\n") + "\n```", options: shuffle(opts), answer: t,
          explanation: "원래 " + (x.li + 1) + "행: " + line, evidence: b.title + (b.page ? " (" + b.page + ")" : ""), key: "code:" + b.title + ":" + x.li + ":" + x.c.kind, w: 100 });
      });
    });
    return qs;
  }

  /* ---------- 4. 만들기 ---------- */
  function buildLocal(text, cfg) {
    var P = parse(text), sents = P.sents, en = isEnglish(text), level = cfg.level || "보통";
    var kws = keywords(P, en), defs = findDefs(P, en), codes = findCode(text);
    var kwWords = kws.map(function (k) { return k.word; });
    var W = {}; kws.forEach(function (k) { W[k.k] = k.w; });

    // 문장 점수 (핵심어 무게 + 문단 첫 문장 + 정의 문장)
    var defIdx = {}; defs.forEach(function (d) { if (d.idx != null) defIdx[d.idx] = 1; });
    sents.forEach(function (s) {
      var ts = tokens(s.text), sc = 0, ks = {};
      ts.forEach(function (t) { if (W[t.k]) { sc += W[t.k]; ks[t.k] = 1; } });
      s.keys = ks; s.score = (ts.length ? sc / Math.sqrt(ts.length + 4) : 0) + (s.first ? 0.8 : 0) + (defIdx[s.idx] ? 1.5 : 0) + (s.idx === 0 ? 1 : 0);
    });
    // 겹치지 않게 고르기(MMR)
    function pick(list, n) {
      var out = [];
      list.slice().sort(function (a, b) { return b.score - a.score; }).forEach(function (s) {
        if (out.length >= n) return;
        var dup = out.some(function (o) { var a = Object.keys(s.keys), common = a.filter(function (k) { return o.keys[k]; }).length; return a.length && common / a.length > 0.6; });
        if (!dup) out.push(s);
      });
      return out.sort(function (a, b) { return a.idx - b.idx; });
    }
    var top = pick(sents, Math.min(7, Math.max(2, Math.ceil(sents.length / 5))));

    // 정리 노트: 제목이 있으면 제목별, 없으면 문단·덩어리별
    var sections = [];
    var groups = {};
    var useHeads = P.heads.length >= 2;
    if (useHeads) sents.forEach(function (s) { var g = s.sec < 0 ? "들어가며" : P.heads[s.sec]; (groups[g] = groups[g] || []).push(s); });
    else {
      var paras = {}; sents.forEach(function (s) { (paras[s.para] = paras[s.para] || []).push(s); });
      var pk = Object.keys(paras);
      if (pk.length >= 2 && pk.length <= 8) pk.forEach(function (k, i) { groups["p" + i] = paras[k]; });
      else { var size = Math.max(3, Math.ceil(sents.length / 4)); for (var i = 0; i < sents.length; i += size) groups["c" + i] = sents.slice(i, i + size); }
    }
    Object.keys(groups).forEach(function (g) {
      var ss = groups[g]; if (!ss.length) return;
      var best = pick(ss, ss.length > 4 ? 3 : 2);
      var heading = g;
      if (!useHeads) {
        var cnt = {}; ss.forEach(function (s) { Object.keys(s.keys).forEach(function (k) { cnt[k] = (cnt[k] || 0) + W[k]; }); });
        var tk = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, 2).map(function (k) { return kws.filter(function (x) { return x.k === k; })[0].word; });
        heading = tk.length ? tk.join(" · ") : "내용 " + (sections.length + 1);
      }
      sections.push({ heading: heading, body: best.map(function (s) { return s.text; }).join(" ") });
    });
    if (sections.length > 8) sections = sections.slice(0, 8);

    // 용어: 정의 → 핵심어(문맥 문장)
    var terms = defs.map(function (d) { return { term: d.term, definition: d.def }; });
    kws.forEach(function (k) {
      if (terms.length >= 24 || terms.some(function (t) { return t.term.toLowerCase() === k.word.toLowerCase(); })) return;
      var s = sents.filter(function (x) { return x.keys[k.k] || x.text.toLowerCase().indexOf(k.word.toLowerCase()) >= 0; }).sort(function (a, b) { return b.score - a.score; })[0];
      if (s) terms.push({ term: k.word, definition: s.text + " (자료에 " + k.n + "번)" });
    });

    /* ----- 문제 후보 ----- */
    var cand = { mcq: [], blank: codeQuestions(codes, level), ox: [], short: [] };
    var defTerms = defs.map(function (d) { return d.term; }), defDefs = defs.map(function (d) { return d.def; });
    function blankOut(sent, word) {
      if (!en) {
        var mk = sent.match(new RegExp(escRe(word) + JRE));
        return mk ? { q: sent.replace(mk[0], "_____" + (mk[1] ? joPair(mk[1]) : "")), word: word } : null;
      }
      var re = new RegExp("\\b" + escRe(word) + "\\b", "i"), m = sent.match(re);
      return m ? { q: sent.replace(re, "_____"), word: m[0] } : null;
    }
    // (1) 정의 → 용어 / 용어 → 정의
    defs.forEach(function (d) {
      var ds = distractors(d.term, defTerms.concat(kwWords), d.def, level, 3);
      if (ds.length === 3) cand.mcq.push({ type: "mcq", question: "다음 설명에 해당하는 말은?\n“" + d.def + "”", options: shuffle([d.term].concat(ds)), answer: d.term, explanation: "자료에서 " + d.term + "을(를) 이렇게 설명합니다. 다른 보기 " + ds.join(", ") + "은(는) 이 설명과 맞지 않습니다.", evidence: d.src, key: d.term, w: 3 });
      var dd = defDefs.filter(function (x) { return x !== d.def; });
      if (dd.length >= 3) cand.mcq.push({ type: "mcq", question: "'" + d.term + "'에 대한 설명으로 알맞은 것은?", options: shuffle([d.def].concat(shuffle(dd).slice(0, 3))), answer: d.def, explanation: "나머지 보기는 자료에 나오는 다른 용어의 설명입니다.", evidence: d.src, key: d.term + "#r", w: 2.5 });
      cand.short.push({ type: "short", question: "'" + d.term + "'이(가) 무엇인지 자료에 나온 대로 설명해 보세요.", options: [], answer: d.def, explanation: "핵심 표현이 들어가 있으면 맞은 것으로 보세요.", evidence: d.src, key: d.term + "#s", w: 2.5 });
    });
    // (2) 빈칸: 중요한 문장의 핵심어
    var used = {};
    sents.slice().sort(function (a, b) { return b.score - a.score; }).forEach(function (s) {
      var ks = kws.filter(function (k) { return s.keys[k.k] || (k.phrase && s.text.toLowerCase().indexOf(k.word.toLowerCase()) >= 0); });
      ks.sort(function (a, b) { return (b.phrase ? 1 : 0) - (a.phrase ? 1 : 0) || b.w - a.w; });
      for (var i = 0; i < ks.length && i < 2; i++) {
        var k = ks[i], word = k.word;
        if (!en) { var mm = s.text.match(new RegExp(escRe(k.k))); if (!mm) continue; word = mm[0]; }
        var bo = blankOut(s.text, word); if (!bo || used[s.idx + "|" + k.k]) continue;
        var q = bo.q; word = bo.word;
        used[s.idx + "|" + k.k] = 1;
        var ds = distractors(word, kwWords.concat(defTerms), s.text, level, 3);
        var base = { evidence: s.text, key: k.k + "@" + s.idx, w: s.score + k.w / 10 };
        if (ds.length === 3) {
          var why = ds.map(function (x) { var o = sents.filter(function (t) { return t.idx !== s.idx && t.text.indexOf(x) >= 0; })[0]; return o ? "'" + x + "'은(는) “" + shortTitle(o.text) + "”에 나오는 말입니다." : ""; }).filter(Boolean)[0];
          cand.blank.push(Object.assign({ type: "blank", question: "빈칸에 들어갈 말로 알맞은 것은?\n" + q, options: shuffle([word].concat(ds)), answer: word, explanation: "원문: “" + s.text + "”" + (why ? " " + why : "") }, base));
        }
        cand.short.push(Object.assign({ type: "short", question: "빈칸에 들어갈 말을 쓰세요.\n" + q, options: [], answer: word, explanation: "원문: “" + s.text + "”" }, base, { key: k.k + "@" + s.idx + "#s", w: base.w * 0.8 }));
      }
      // (3) 숫자·연도
      var nm = s.text.match(/(\d{1,3}(,\d{3})+|\d+(\.\d+)?)\s?(%|퍼센트|년|월|일|세기|개|명|배|가지|단계|kg|km|cm|mm|m|g|°C|℃|시간|분|초|원|달러)?/);
      if (nm && !used["n" + s.idx] && !/^\d+[.)]/.test(s.text)) {
        var val = nm[0].trim(), nd = numDistract(val);
        var nq = s.text.replace(val, "_____");
        if (nd.length === 3 && nq !== s.text) { used["n" + s.idx] = 1; cand.mcq.push({ type: "mcq", question: "빈칸에 들어갈 수로 알맞은 것은?\n" + nq, options: shuffle([val].concat(nd)), answer: val, explanation: "원문: “" + s.text + "”", evidence: s.text, key: "num:" + s.idx, w: s.score + 1 }); }
      }
    });
    // (4) OX: 원문 그대로(O) / 반대말·숫자·핵심어 바꾸기(X)
    defs.forEach(function (d, i) {
      var other = defs[(i + 1) % defs.length];
      var stem = en ? "\"" + d.term + "\" means: " : "'" + d.term + "'은(는) 다음을 뜻한다: ";
      if (defs.length >= 2 && other !== d) cand.ox.push({ type: "ox", question: stem + other.def, options: ["O", "X"], answer: "X", explanation: "이 설명은 '" + other.term + "'의 뜻입니다. '" + d.term + "'은(는) “" + d.def + "”입니다.", evidence: d.src, key: "oxd:" + i, w: 2 });
      cand.ox.push({ type: "ox", question: stem + d.def, options: ["O", "X"], answer: "O", explanation: "자료에 나온 정의 그대로입니다.", evidence: d.src, key: "oxd:" + i, w: 1.8 });
    });
    sents.filter(function (s) { return !s.note; }).sort(function (a, b) { return b.score - a.score; }).slice(0, 30).forEach(function (s, i) {
      var f = flip(s.text, en), x = null;
      if (f) x = { text: f.text, why: "원문은 '" + f.from + "'인데 '" + f.to + "'(으)로 바꿨습니다." };
      else {
        var nm = s.text.match(/\d+(\.\d+)?/);
        if (nm && i % 2) { var nd = numDistract(nm[0]); if (nd.length) x = { text: s.text.replace(nm[0], nd[0]), why: "원문의 수는 " + nm[0] + "입니다." }; }
        if (!x) {
          var ks = kws.filter(function (k) { return s.keys[k.k]; });
          if (ks.length) {
            var k = ks[0], word = en ? k.word : (s.text.match(new RegExp(escRe(k.k))) || [])[0];
            var rep = word && distractors(word, kwWords, s.text, "보통", 1)[0];
            if (rep) x = { text: en ? s.text.replace(new RegExp("\\b" + escRe(word) + "\\b", "i"), rep) : swapKo(s.text, word, rep), why: "원문은 '" + word + "'입니다. '" + rep + "'(으)로 바꾸면 자료 내용과 달라집니다." };
          }
        }
      }
      if (x) cand.ox.push({ type: "ox", question: x.text, options: ["O", "X"], answer: "X", explanation: x.why + " 원문: “" + s.text + "”", evidence: s.text, key: "ox:" + s.idx, w: s.score + (f ? 0.5 : 0) });
      cand.ox.push({ type: "ox", question: s.text, options: ["O", "X"], answer: "O", explanation: "자료에 나온 내용 그대로입니다.", evidence: s.text, key: "ox:" + s.idx, w: s.score * 0.9 });
    });

    /* ----- 유형·난이도에 맞춰 고르기 ----- */
    var want = Object.keys(cand).filter(function (t) { return !cfg.types || cfg.types[t]; });
    if (!want.length) want = Object.keys(cand);
    var mix = { "쉬움": { ox: 3, mcq: 3, blank: 2, short: 1 }, "보통": { ox: 2, mcq: 3, blank: 3, short: 2 }, "어려움": { ox: 1, mcq: 2, blank: 3, short: 3 } }[level] || { ox: 2, mcq: 3, blank: 3, short: 2 };
    want.forEach(function (t) { cand[t].sort(function (a, b) { return b.w - a.w; }); });
    var qs = [], usedKey = {}, usedSent = {}, n = cfg.n || 10, guard = 0, lastOX = level === "쉬움" ? "X" : "O";
    var bag = [];
    want.forEach(function (t) { for (var i = 0; i < mix[t]; i++) bag.push(t); });
    while (qs.length < n && guard++ < 400) {
      var t = bag[guard % bag.length], c = cand[t];
      var q = null;
      for (var pass = 0; pass < 2 && !q; pass++) for (var i = 0; i < c.length; i++) {
        var base = c[i].key.split(/[#@]/)[0], sk = c[i].evidence;
        if (usedKey[c[i].key] || usedKey[base + t] || (c[i].key.indexOf("code:") !== 0 && usedSent[sk] && usedSent[sk] >= (sents.length < 20 ? 2 : 1))) continue;
        if (t === "ox" && pass === 0 && c[i].answer === lastOX) continue;  // O와 X를 번갈아
        q = c.splice(i, 1)[0]; break;
      }
      if (q && t === "ox") lastOX = q.answer;
      if (!q) { if (want.every(function (w) { return !cand[w].length; })) break; continue; }
      usedKey[q.key] = 1; usedKey[q.key.split(/[#@]/)[0] + t] = 1; usedSent[q.evidence] = (usedSent[q.evidence] || 0) + 1;
      delete q.key; delete q.w; qs.push(q);
    }

    function oneLine() {
      var main = defs.filter(function (d) { return d.idx != null && kws.slice(0, 3).some(function (k) { return k.word.toLowerCase() === d.term.toLowerCase(); }); })[0];
      if (main) return main.src;
      var early = sents.filter(function (s) { return s.idx < Math.max(3, sents.length * 0.3); }).sort(function (a, b) { return b.score - a.score; })[0];
      return (early || top[0] || { text: "" }).text;
    }
    var counts = {}; qs.forEach(function (q) { counts[q.type] = (counts[q.type] || 0) + 1; });
    return {
      title: shortTitle((P.heads[0]) || (sents[0] && sents[0].text) || text),
      summary: {
        one_line: oneLine(),
        key_points: top.map(function (t) { return t.text; }),
        sections: sections,
        code: codes.map(function (b) { return { title: b.title, page: b.page || "", code: b.code }; })
      },
      terms: terms,
      questions: shuffle(qs),
      note: "기본 모드(무료): AI 없이 규칙으로 만들었습니다. 정의 문장 " + defs.length + "개, 핵심어 " + kws.length + "개" + (codes.length ? ", 의사 코드 " + codes.length + "개" : "") + "를 찾아 문제 " + qs.length + "개(" +
        Object.keys(counts).map(function (t) { return (S.TYPE_NAMES || {})[t] + " " + counts[t]; }).join(", ") + ")를 만들었습니다." +
        (qs.length < n ? " 자료가 짧아 요청한 " + n + "개보다 적게 나왔습니다." : "") + " claude.ai에서 열면 Claude가 내용 이해 문제와 자세한 해설을 만듭니다."
    };
  }

  S.shuffle = shuffle;
  S.splitSents = splitSents;
  S.buildLocal = buildLocal;
  S.shortTitle = shortTitle;
})();
