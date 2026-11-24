/* 기본 모드(키 없이): 중요 문장 추출 요약 + 핵심어 용어 카드·빈칸·OX 문제 */
(function () {
  "use strict";
  var S = window.Study = window.Study || {};
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  /* ---------- 텍스트 처리 ---------- */
  function splitSents(t) {
    return t.replace(/\s+/g, " ").split(/(?<=[.!?。]|다\.|요\.)\s+(?=[A-Z가-힣0-9"'(\[])/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length >= 15 && s.length <= 400; });
  }
  var STOP = {};
  ("the a an and or but of to in on at for with by from as is are was were be been being this that these those it its they them their we our you your he she his her not no can could will would should may might must do does did have has had which who whom what when where why how than then there here also such into over about more most other some any each all both only very just so if because while although though however therefore thus").split(" ").forEach(function (w) { STOP[w] = 1; });
  ("그리고 그러나 하지만 그래서 또한 또는 이런 저런 그런 이것 그것 저것 있다 없다 한다 했다 된다 되는 하는 있는 없는 위해 대한 통해 따라 때문 경우 등의 이를 이는 그는 수 것 등 및 더 잘 매우 가장 바로 모든 각").split(" ").forEach(function (w) { STOP[w] = 1; });
  function isEnglish(t) { var en = (t.match(/[A-Za-z]/g) || []).length, ko = (t.match(/[가-힣]/g) || []).length; return en > ko * 2; }

  /* ---------- 기본 모드(키 없이) ---------- */
  function buildLocal(text, cfg) {
    var sents = splitSents(text), en = isEnglish(text);
    var freq = {};
    (text.toLowerCase().match(/[a-z][a-z'-]{2,}|[가-힣]{2,}/g) || []).forEach(function (w) { if (!STOP[w]) freq[w] = (freq[w] || 0) + 1; });
    var keywords = Object.keys(freq).filter(function (w) { return freq[w] >= 2 && w.length >= (en ? 4 : 2); }).sort(function (a, b) { return freq[b] - freq[a]; }).slice(0, 15);
    // 추출 요약: 핵심어가 많이 들어간 문장
    var scored = sents.map(function (s, i) {
      var ws = (s.toLowerCase().match(/[a-z][a-z'-]{2,}|[가-힣]{2,}/g) || []), sc = 0;
      ws.forEach(function (w) { if (!STOP[w]) sc += Math.min(freq[w] || 0, 5); });
      return { s: s, i: i, sc: (ws.length ? sc / Math.sqrt(ws.length) : 0) + (i === 0 ? 1 : 0) };
    });
    var top = scored.slice().sort(function (a, b) { return b.sc - a.sc; }).slice(0, Math.min(6, Math.max(1, Math.ceil(sents.length / 5))));
    top.sort(function (a, b) { return a.i - b.i; });
    function sentWith(k) { return sents.filter(function (s) { return s.toLowerCase().indexOf(k) >= 0; }); }
    var terms = keywords.map(function (k) { var ss = sentWith(k); return { term: k, definition: (ss[0] || "") + " (" + freq[k] + "회)" }; });
    var qs = [];
    shuffle(keywords).forEach(function (k) {
      if (qs.length >= cfg.n) return;
      var ss = sentWith(k); if (!ss.length) return;
      var sent = ss[Math.floor(Math.random() * ss.length)];
      var opts = shuffle([k].concat(shuffle(keywords.filter(function (x) { return x !== k; })).slice(0, 3)));
      if (opts.length < 2) return;
      qs.push({ type: "blank", question: "빈칸에 들어갈 말은?\n" + sent.replace(new RegExp(escRe(k), "i"), "_____"), options: opts, answer: k, explanation: "자료에 " + freq[k] + "번 나온 핵심어입니다.", evidence: sent });
    });
    // OX: 요약 문장은 O, 핵심어를 다른 핵심어로 바꾼 문장은 X
    shuffle(top).forEach(function (t) {
      if (qs.length >= cfg.n || keywords.length < 2) return;
      var inS = keywords.filter(function (k) { return t.s.toLowerCase().indexOf(k) >= 0; });
      if (Math.random() < 0.5 && inS.length) {
        var k = inS[0], other = shuffle(keywords.filter(function (x) { return x !== k && t.s.toLowerCase().indexOf(x) < 0; }))[0];
        if (!other) return;
        qs.push({ type: "ox", question: t.s.replace(new RegExp(escRe(k), "i"), other), options: ["O", "X"], answer: "X", explanation: "원문에서는 '" + other + "'이(가) 아니라 '" + k + "'입니다.", evidence: t.s });
      } else qs.push({ type: "ox", question: t.s, options: ["O", "X"], answer: "O", explanation: "원문에 그대로 나온 내용입니다.", evidence: t.s });
    });
    return {
      title: shortTitle(sents[0] || text),
      summary: {
        one_line: top[0] ? top[0].s : "",
        key_points: top.map(function (t) { return t.s; }),
        sections: keywords.length ? [{ heading: "자주 나온 핵심어", body: keywords.map(function (k) { return k + " (" + freq[k] + "회)"; }).join(", ") }] : []
      },
      terms: terms,
      questions: shuffle(qs),
      note: "기본 모드: 원문에서 중요한 문장을 골라 요약하고, 자주 나온 핵심어로 빈칸·OX 문제를 만들었습니다. AI 키를 넣으면 내용 이해 문제, 해설, 정리 노트가 만들어집니다."
    };
  }
  function shortTitle(t) { t = t.replace(/\s+/g, " ").trim(); if (t.length <= 40) return t; var c = t.slice(0, 40), sp = c.lastIndexOf(" "); return (sp > 20 ? c.slice(0, sp) : c) + "…"; }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  S.shuffle = shuffle;
  S.splitSents = splitSents;
  S.buildLocal = buildLocal;
  S.shortTitle = shortTitle;
})();
