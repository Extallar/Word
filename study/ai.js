/* AI 모드: claude.ai 안에서 열면 보는 사람의 Claude 요금제로 Claude를 쓴다 (API 키·별도 결제 없음).
   - 만들기: Claude 작성자 초안 → Claude 검토자가 원문과 대조해 검토 → 작성자가 반영·수정 (검토 0~2번)
   - 채점(단답·서술), 질문하기(자료 기반 채팅), 문제 더 만들기
   claude.ai 밖(파일로 직접 열기 등)에서는 S.ai()가 null이 되어 AI 기능을 숨긴다. */
(function () {
  "use strict";
  var S = window.Study = window.Study || {};

  S.ROLES = {
    writer: { name: "작성자" }, reviewer: { name: "검토자" },
    // 예전 버전(Claude × GPT)으로 만든 자료의 기록을 보여 주기 위한 이름
    claude: { name: "Claude" }, gpt: { name: "GPT" }
  };
  S.TIERS = [["quick", "빠르게"], ["default", "보통 (기본)"], ["complex", "꼼꼼하게 (느림)"]];
  S.TYPE_NAMES = { mcq: "객관식", ox: "OX", blank: "빈칸", short: "단답·서술" };
  var MAX_SRC = 150000; // 한 번에 Claude에게 보낼 자료 글자 수 (256KiB 한도 안쪽)

  /* ---------- Claude 연결 ---------- */
  var samplePromise = null;
  S.ai = function () {
    if (!samplePromise) samplePromise = (window.claude && window.claude.use ? window.claude.use("sample") : Promise.resolve(null)).catch(function () { return null; });
    return samplePromise;
  };
  S.imageLimits = function () {
    return S.ai().then(function (s) { return s && s.limits ? s.limits().then(function (l) { return l.images || null; }, function () { return null; }) : null; });
  };
  var ERR = {
    not_granted: "Claude 사용을 허락하지 않아 AI 기능을 쓸 수 없습니다. 페이지를 새로 열면 다시 물어봅니다.",
    sampling_disabled: "이 계정에서는 Claude를 쓸 수 없습니다.",
    rate_limited: "Claude 사용량이 많거나 사용 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.",
    session_expired: "claude.ai에 다시 로그인해 주세요.",
    prompt_too_large: "자료가 너무 깁니다. 쪽 범위를 줄이거나 나눠서 만들어 주세요.",
    refused: "Claude가 이 요청에 답하지 않았습니다. 자료나 요청을 바꿔 주세요.",
    invalid_json: "Claude의 답을 읽지 못했습니다. 다시 시도하거나 문제 수를 줄여 주세요.",
    empty_completion: "Claude가 빈 답을 보냈습니다. 문제 수를 줄여 다시 시도해 주세요.",
    image_rejected: "이미지를 보낼 수 없습니다 (개수·형식·크기 확인).",
    images_unavailable: "이 화면에서는 이미지를 보낼 수 없습니다. 텍스트나 PDF로 넣어 주세요.",
    cancelled: "중단했습니다."
  };
  S.errText = function (e) {
    if (!e) return "알 수 없는 오류";
    if (e.code && ERR[e.code]) return ERR[e.code] + (e.code === "rate_limited" && e.reason === "usage_limit" ? " (요금제 사용 한도)" : "");
    if (e.code) return "Claude 연결에 문제가 생겼습니다. 다시 시도해 주세요. (" + e.code + ")";
    return e.message || String(e);
  };

  /* ---------- 응답 정리 (모양 검사) ---------- */
  function str(x) { return x == null ? "" : String(x).trim(); }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function normQ(q) {
    if (!q || typeof q !== "object") return null;
    var t = str(q.type).toLowerCase(), out = { type: t, question: str(q.question), options: arr(q.options).map(str).filter(Boolean), answer: str(q.answer), explanation: str(q.explanation), evidence: str(q.evidence) };
    if (!out.question || !S.TYPE_NAMES[t]) return null;
    if (t === "ox") {
      var a = out.answer.toUpperCase();
      out.answer = /^(O|○|TRUE|맞|참)/.test(a) ? "O" : /^(X|×|FALSE|틀|거짓)/.test(a) ? "X" : "";
      out.options = ["O", "X"];
      return out.answer ? out : null;
    }
    if (t === "short") { out.options = []; return out.answer ? out : null; }
    if (out.options.length < 2) return null;
    var hit = out.options.filter(function (o) { return o === out.answer; })[0] ||
      out.options.filter(function (o) { return o.replace(/\s+/g, "").toLowerCase() === out.answer.replace(/\s+/g, "").toLowerCase(); })[0];
    if (!hit && /^[1-5]$/.test(out.answer)) hit = out.options[+out.answer - 1];
    if (!hit) return null;
    out.answer = hit;
    return out;
  }
  function normContent(r) {
    r = r || {};
    var s = r.summary || {};
    var out = {
      title: str(r.title),
      summary: { one_line: str(s.one_line), key_points: arr(s.key_points).map(str).filter(Boolean), sections: arr(s.sections).map(function (x) { return { heading: str(x && x.heading), body: str(x && x.body) }; }).filter(function (x) { return x.body; }),
        code: arr(s.code).map(function (x) { return { title: str(x && x.title), page: str(x && x.page), code: x && x.code != null ? String(x.code).replace(/\s+$/, "") : "" }; }).filter(function (x) { return x.code; }) },
      terms: arr(r.terms).map(function (x) { return { term: str(x && x.term), definition: str(x && x.definition) }; }).filter(function (x) { return x.term && x.definition; }),
      cards: S.normCards ? S.normCards(r.cards) : [],
      questions: arr(r.questions).map(normQ).filter(Boolean)
    };
    if (!out.questions.length && !out.summary.one_line) { var e = new Error("Claude의 답에서 요약과 문제를 찾지 못했습니다. 다시 시도해 주세요."); throw e; }
    return out;
  }
  S.normQ = normQ;

  /* ---------- 지시문 ---------- */
  var RULES =
    "당신은 시험 공부를 돕는 튜터입니다. 학생이 준 자료만 근거로 요약, 핵심 용어, 연습 문제를 만듭니다.\n" +
    "- 자료에 없는 사실을 지어내지 마세요. 모든 문제의 정답은 자료로 확인할 수 있어야 합니다. 자료 안에서 내용이 서로 다르면 해설에 그 사실을 알려 주세요.\n" +
    "- 설명과 해설은 한국어로 씁니다. 자료가 영어면 용어·인용·문제 본문에 영어 원문을 그대로 써도 됩니다.\n" +
    "- summary.one_line은 한 문장, key_points는 4~8개 핵심 문장, sections는 자료 흐름대로 나눈 정리 노트(각 body는 2~6문장)입니다.\n" +
    "- terms는 시험에 나올 만한 개념·용어와 자료에 근거한 짧은 정의입니다.\n" +
    "- 문제 type: mcq(4지선다, options 4개, answer는 options 중 하나와 글자까지 똑같이), ox(options는 [\"O\",\"X\"], answer는 \"O\" 또는 \"X\"), " +
    "blank(문장에 _____ 빈칸, options 4개, answer는 options 중 하나), short(단답·서술, options는 빈 배열, answer는 모범 답안).\n" +
    "- 개념 확인뿐 아니라 직접 계산·추적해 보는 문제(예: 알고리즘 수행 과정, 공식 적용)도 자료에 있으면 섞으세요.\n" +
    "- 오답 선지는 그럴듯하지만 자료를 읽으면 틀렸음을 알 수 있게 만드세요. 정답 위치를 골고루 섞으세요.\n" +
    "- 자료에 의사 코드·소스 코드가 있으면 summary.code에 {title, page, code}로 줄 번호까지 원문 그대로 옮기고, 반복 범위·비교 조건·배열 인덱스·대입 같은 핵심 부분을 빈칸(_____)으로 묻는 blank 문제를 꼭 포함하세요. 코드는 question 안에서 ``` 로 감쌉니다(예: \"다음은 ○○ 의사 코드다. 빈칸에 들어갈 것은?\\n```\\n1. for i = 1 to _____\\n```\").\n" +
    "- 그림·표·그래프 이미지를 함께 받았다면 그 내용(수행 과정 단계, 표의 값, 그래프의 순서)도 정리 노트와 문제에 반영하세요.\n" +
    "- cards에는 처음 배우는 학생의 기초 이해를 돕는 그림 카드 4~10장을 만듭니다. 각 카드: title, subtitle(한 줄 요약), page, easy(초보자용 쉬운 설명 2~3문장), analogy(일상 비유 1문장), points(꼭 기억할 것 2~4개), visual.\n" +
    "  visual은 아래 중 하나(알맞은 그림이 없으면 null): " +
    "{type:\"array\", steps:[{a:[값 배열], hl:[강조 인덱스], done:[확정된 인덱스], note:\"이 단계 설명\"}]} 배열이 바뀌는 과정(정렬 등) — 단계는 직접 계산해 정확하게, 3~14단계; " +
    "{type:\"heap\", steps:[{a:[루트부터 힙 배열], size:힙 크기, hl:[인덱스], note}]}; " +
    "{type:\"list\", steps:[{items:[문자열], note}]}; " +
    "{type:\"rows\", steps:[{rows:[{label, items:[문자열], hl:[인덱스]}], note}]} 여러 줄·집합·저장 장치의 변화; " +
    "{type:\"flow\", boxes:[차례대로 일어나는 단계 문자열]}; " +
    "{type:\"tree\", labels:[완전 이진 트리 순서(루트, 왼쪽, 오른쪽, …)의 라벨, 빈 자리는 null], note}.\n" +
    "- explanation은 정답인 이유와 헷갈리기 쉬운 오답이 틀린 이유를 씁니다. evidence는 근거가 되는 원문 구절을 그대로 인용하고, 자료에 [p.12] 같은 쪽 표시가 있으면 끝에 쪽 번호를 붙입니다.";
  var SHAPE =
    '응답은 다음 모양의 JSON 객체 하나만 보내세요:\n' +
    '{"title": "자료 제목", "summary": {"one_line": "...", "key_points": ["..."], "sections": [{"heading": "...", "body": "..."}], "code": [{"title": "알고리즘 이름", "page": "p.9", "code": "1. for ..."}]}, ' +
    '"terms": [{"term": "...", "definition": "..."}], ' +
    '"cards": [{"title": "...", "subtitle": "...", "page": "...", "easy": "...", "analogy": "...", "points": ["..."], "visual": {"type": "array", "steps": [{"a": [3, 1, 2], "hl": [0, 1], "done": [], "note": "..."}]}}], ' +
    '"questions": [{"type": "mcq", "question": "...", "options": ["...","...","...","..."], "answer": "...", "explanation": "...", "evidence": "..."}]}';
  function request(cfg) {
    var types = Object.keys(S.TYPE_NAMES).filter(function (t) { return cfg.types[t]; });
    if (!types.length) types = ["mcq"];
    return "요청 사항\n- 문제 수: " + cfg.n + "개\n" +
      "- 문제 유형: " + types.map(function (t) { return t + "(" + S.TYPE_NAMES[t] + ")"; }).join(", ") + " — 이 유형들만 골고루 섞기\n" +
      "- 난이도: " + cfg.level + (cfg.level === "쉬움" ? " (핵심 사실 확인 위주)" : cfg.level === "어려움" ? " (여러 내용을 연결하는 추론·응용·계산 위주)" : " (이해와 적용을 섞어서)") +
      (cfg.focus ? "\n- 특히 집중할 부분: " + cfg.focus : "");
  }
  function material(src) {
    var t = src.text || "";
    var cut = t.length > MAX_SRC;
    return "<자료" + (src.name ? ' 제목="' + src.name.replace(/"/g, "'") + '"' : "") + ">\n" + (cut ? t.slice(0, MAX_SRC) : t) + "\n</자료>" +
      (src.images && src.images.length ? "\n(이미지 " + src.images.length + "장을 함께 보냈습니다. 순서대로: " + src.images.map(function (im) { return im.label || "사진"; }).join(", ") + ". 이미지 속 그림·표·그래프 내용도 자료입니다.)" : "") +
      (cut ? "\n(자료가 길어 앞부분 " + MAX_SRC.toLocaleString() + "자만 보냈습니다.)" : "");
  }
  function J(x) { return JSON.stringify(x); }

  /* ---------- 만들기: 작성자 → 검토자 → 작성자 ---------- */
  S.plan = function (cfg) {
    var steps = [{ who: "writer", kind: "draft" }];
    for (var k = 0; k < (+cfg.rounds || 0); k++) steps.push({ who: "reviewer", kind: "review" }, { who: "writer", kind: "revise" });
    return steps;
  };
  S.generate = function (src, cfg, onStep, signal) {
    var steps = S.plan(cfg), log = [], cur = null, lastReview = null, chain = Promise.resolve();
    var tier = cfg.tier || "default", mat = material(src), req = request(cfg);
    var images = src.images && src.images.length ? src.images.map(function (im) { return im.blob; }) : undefined;
    return S.ai().then(function (sample) {
      if (!sample) throw new Error("AI 기능은 claude.ai에서 이 페이지를 열었을 때만 쓸 수 있습니다.");
      function ask(prompt, i, s) {
        var o = { modelTier: tier, signal: signal, cache: false, onText: function (u) { onStep({ i: i, who: s.who, kind: s.kind, state: "run", chars: u.text.length }); } };
        if (images) o.images = images;
        return sample.json(prompt, o);
      }
      steps.forEach(function (s, i) {
        chain = chain.then(function () {
          var t0 = Date.now(), p;
          onStep({ i: i, who: s.who, kind: s.kind, state: "run" });
          if (s.kind === "draft")
            p = ask(RULES + "\n\n" + mat + "\n\n" + req + "\n\n" + SHAPE, i, s).then(function (r) {
              cur = normContent(r);
              return { one_line: cur.summary.one_line, questions: cur.questions.length, terms: cur.terms.length };
            });
          else if (s.kind === "review")
            p = ask("당신은 다른 튜터가 만든 학습 자료 초안을 원래 자료와 하나하나 대조해 검토하는 깐깐한 동료 튜터입니다.\n" +
              "- 찾을 것: 사실 오류, 자료에 근거가 없는 내용, 정답이 틀리거나 답이 둘 이상인 문제, 너무 쉬운 오답 선지, 빠진 핵심 내용, 요청한 난이도·유형과 맞지 않는 점, 해설·근거의 잘못.\n" +
              "- question_reviews에는 모든 문제를 번호(1부터)로 하나씩 평가합니다. verdict는 good(그대로), fix(고치면 됨), replace(다른 문제로 바꿔야 함). comment에는 무엇이 문제고 어떻게 고칠지 구체적으로 씁니다.\n" +
              "- 지적은 근거를 들어 구체적으로, 칭찬은 짧게. 모두 한국어로.\n\n" + mat + "\n\n" + req +
              "\n\n<검토할 초안>\n" + J(cur) + "\n</검토할 초안>\n\n" +
              '응답은 JSON 객체 하나만: {"overall": "총평", "summary_feedback": ["..."], "missing_points": ["..."], "term_feedback": ["..."], "question_reviews": [{"number": 1, "verdict": "good", "comment": "..."}]}', i, s)
              .then(function (r) {
                r = r || {};
                lastReview = { overall: str(r.overall), summary_feedback: arr(r.summary_feedback).map(str).filter(Boolean), missing_points: arr(r.missing_points).map(str).filter(Boolean), term_feedback: arr(r.term_feedback).map(str).filter(Boolean),
                  question_reviews: arr(r.question_reviews).map(function (x) { return { number: +(x && x.number) || 0, verdict: /^(good|fix|replace)$/.test(str(x && x.verdict)) ? str(x.verdict) : "fix", comment: str(x && x.comment) }; }).filter(function (x) { return x.number; }) };
                return lastReview;
              });
          else
            p = ask(RULES + "\n\n당신은 이 학습 자료의 작성자입니다. 검토자가 당신의 초안을 검토했습니다. 검토 의견을 하나씩 자료와 대조해 판단해, 맞는 의견은 반영하고 동의하지 않는 의견은 반영하지 말고 이유를 남기세요. 문제 수와 유형 요청은 지킵니다.\n\n" +
              mat + "\n\n" + req + "\n\n<내 초안>\n" + J(cur) + "\n</내 초안>\n\n<검토 의견>\n" + J(lastReview) + "\n</검토 의견>\n\n" +
              SHAPE.replace("하나만 보내세요:", "하나만 보내세요. 고친 최종 자료 전체와 함께 reply를 넣습니다:").replace(/\}$/, ', "reply": {"message": "검토자에게 하는 1~2문장 답변", "accepted": ["반영한 점"], "rejected": [{"point": "반영하지 않은 의견", "reason": "이유"}]}}'), i, s)
              .then(function (r) {
                var reply = (r && r.reply) || {};
                cur = normContent(r);
                return { message: str(reply.message), accepted: arr(reply.accepted).map(str).filter(Boolean), rejected: arr(reply.rejected).map(function (x) { return { point: str(x && x.point), reason: str(x && x.reason) }; }).filter(function (x) { return x.point; }) };
              });
          return p.then(function (data) {
            log.push({ who: s.who, kind: s.kind, data: data, sec: Math.round((Date.now() - t0) / 1000) });
            onStep({ i: i, who: s.who, kind: s.kind, state: "done" });
          });
        });
      });
      return chain.then(function () {
        cur.log = log; cur.team = { claude: true, rounds: +cfg.rounds || 0, tier: tier };
        return cur;
      }, function (e) {
        // 검토 도중 실패해도 앞 단계 결과가 있으면 살린다.
        if (cur && log.length && !(e && e.code === "cancelled")) { cur.log = log; cur.partial = S.errText(e); cur.team = { claude: true, rounds: +cfg.rounds || 0, tier: tier }; return cur; }
        throw e;
      });
    });
  };

  /* ---------- 문제 더 만들기 ---------- */
  S.moreQuestions = function (src, cfg, existing, onChars, signal) {
    return S.ai().then(function (sample) {
      if (!sample) throw new Error("AI 기능은 claude.ai에서 열었을 때만 쓸 수 있습니다.");
      var prompt = RULES + "\n\n" + material(src) + "\n\n" + request(cfg) +
        "\n\n이미 있는 문제(겹치지 않게, 다른 내용·다른 각도로 새로 만드세요):\n" + existing.map(function (q, i) { return (i + 1) + ". " + q.question.slice(0, 120); }).join("\n") +
        '\n\n응답은 JSON 객체 하나만: {"questions": [{"type": "mcq", "question": "...", "options": ["...","...","...","..."], "answer": "...", "explanation": "...", "evidence": "..."}]}';
      return sample.json(prompt, { modelTier: cfg.tier || "default", cache: false, signal: signal, onText: function (u) { onChars && onChars(u.text.length); } });
    }).then(function (r) {
      var qs = arr(r && r.questions).map(normQ).filter(Boolean);
      if (!qs.length) throw new Error("새 문제를 받지 못했습니다. 다시 시도해 주세요.");
      return qs;
    });
  };

  /* ---------- 채점 (단답·서술) ---------- */
  S.grade = function (q, ans, cfg) {
    return S.ai().then(function (sample) {
      if (!sample) throw new Error("AI 기능은 claude.ai에서 열었을 때만 쓸 수 있습니다.");
      return sample.json("당신은 학생의 단답·서술형 답안을 채점하는 튜터입니다. 모범 답안과 근거 원문을 기준으로, 표현이 달라도 핵심 내용이 맞으면 정답으로 봅니다.\n\n" +
        "<문제>\n" + q.question + "\n</문제>\n<모범 답안>\n" + q.answer + "\n</모범 답안>\n" + (q.evidence ? "<근거 원문>\n" + q.evidence + "\n</근거 원문>\n" : "") + "<학생 답안>\n" + (ans || "(빈 답)") + "\n</학생 답안>\n\n" +
        '응답은 JSON 객체 하나만: {"verdict": "correct | partial | wrong", "score": 0~100 정수, "feedback": "무엇이 맞고 무엇이 빠졌는지 한국어 1~3문장"}', { modelTier: (cfg && cfg.tier) || "default" });
    }).then(function (r) {
      var v = str(r && r.verdict);
      return { verdict: /^(correct|partial|wrong)$/.test(v) ? v : "wrong", score: Math.max(0, Math.min(100, Math.round(+(r && r.score) || 0))), feedback: str(r && r.feedback) };
    });
  };

  /* ---------- 질문하기 (자료 기반 채팅) ---------- */
  S.chat = function (item, turns, onText, signal) {
    return S.ai().then(function (sample) {
      if (!sample) throw new Error("AI 기능은 claude.ai에서 열었을 때만 쓸 수 있습니다.");
      var r = item.result || {}, s = r.summary || {};
      var ctx = "당신은 학생이 이 자료로 시험공부하는 것을 돕는 친절한 튜터입니다. 아래 자료와 정리 내용을 근거로 한국어로 답하세요.\n" +
        "- 자료에 있는 내용은 쪽 번호([p.N] 표시가 있으면)와 함께 근거를 들어 설명합니다.\n" +
        "- 자료에 없는 내용을 물으면 자료에 없다고 먼저 말한 뒤, 일반적인 설명임을 밝히고 답합니다.\n" +
        "- 짧고 분명하게, 필요하면 예시나 단계별 풀이를 보여 줍니다. 학생이 문제를 내 달라고 하면 하나씩 내고 답을 기다립니다.\n\n" +
        "<정리>\n" + J({ title: item.title, one_line: s.one_line, key_points: s.key_points, terms: (r.terms || []).slice(0, 40) }) + "\n</정리>\n\n" +
        "<자료>\n" + (item.text || "(원문 없음)").slice(0, 100000) + "\n</자료>";
      return sample([{ role: "user", content: ctx }].concat(turns.slice(-16)), { cache: false, signal: signal, onText: function (u) { onText(u.text); } });
    });
  };
})();
