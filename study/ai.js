/* AI 모드: Claude와 GPT가 상의해서 학습 자료를 만들고 채점한다.
   - 만들기: 작성자 초안 → 검토자 검토 → 작성자 수정 (상의 횟수만큼 검토·수정 반복)
   - 채점: 두 AI가 따로 채점 → 의견이 다르면 서로의 채점을 보고 다시 채점
   - 키가 하나만 있으면 그 AI 혼자 만든다.
   요청은 브라우저에서 각 회사 API로 바로 간다(키는 이 브라우저에만 저장). */
(function () {
  "use strict";
  var S = window.Study = window.Study || {};
  var ANTHROPIC_SDK = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.7.0/+esm";
  var OPENAI_SDK = "https://cdn.jsdelivr.net/npm/openai@7.50.0/+esm";

  S.AI = {
    claude: { name: "Claude", models: [["claude-opus-5-5", "Claude Opus 5.5 (기본)"], ["claude-sonnet-5-5", "Claude Sonnet 5.5"], ["claude-haiku-5-5", "Claude Haiku 5.5 (저렴)"]] },
    gpt: { name: "GPT", models: [["gpt-6.1-sol", "gpt-6.1-sol (기본)"], ["gpt-6.1-terra", "gpt-6.1-terra"], ["gpt-5.5", "gpt-5.5"]] }
  };
  S.TYPE_NAMES = { mcq: "객관식", ox: "OX", blank: "빈칸", short: "단답·서술" };

  /* ---------- 응답 형식(JSON 스키마) ---------- */
  function obj(props) { return { type: "object", additionalProperties: false, required: Object.keys(props), properties: props }; }
  var STR = { type: "string" }, STRS = { type: "array", items: { type: "string" } };
  var CONTENT_PROPS = {
    title: STR,
    summary: obj({ one_line: STR, key_points: STRS, sections: { type: "array", items: obj({ heading: STR, body: STR }) } }),
    terms: { type: "array", items: obj({ term: STR, definition: STR }) },
    questions: { type: "array", items: obj({ type: { type: "string", enum: ["mcq", "ox", "blank", "short"] }, question: STR, options: STRS, answer: STR, explanation: STR, evidence: STR }) }
  };
  var CONTENT = obj(CONTENT_PROPS);
  var REVISION = obj(Object.assign({}, CONTENT_PROPS, {
    reply: obj({ message: STR, accepted: STRS, rejected: { type: "array", items: obj({ point: STR, reason: STR }) } })
  }));
  var REVIEW = obj({
    overall: STR,
    summary_feedback: STRS,
    missing_points: STRS,
    term_feedback: STRS,
    question_reviews: { type: "array", items: obj({ number: { type: "integer" }, verdict: { type: "string", enum: ["good", "fix", "replace"] }, comment: STR }) }
  });
  var GRADE = obj({ verdict: { type: "string", enum: ["correct", "partial", "wrong"] }, score: { type: "integer" }, feedback: STR });
  var REGRADE = obj({ verdict: { type: "string", enum: ["correct", "partial", "wrong"] }, score: { type: "integer" }, feedback: STR, reply: STR });

  /* ---------- 지시문 ---------- */
  var BASE =
    "당신은 시험 공부를 돕는 튜터입니다. 학생이 준 자료만 근거로 요약, 핵심 용어, 연습 문제를 만듭니다.\n" +
    "- 자료에 없는 사실을 지어내지 마세요. 모든 문제의 정답은 자료로 확인할 수 있어야 합니다.\n" +
    "- 설명과 해설은 한국어로 씁니다. 자료가 영어면 용어·인용·문제 본문에 영어 원문을 그대로 써도 됩니다.\n" +
    "- summary.one_line은 한 문장, key_points는 3~8개 핵심 bullet, sections는 자료 흐름대로 나눈 정리 노트(각 body는 2~5문장)입니다.\n" +
    "- terms는 시험에 나올 만한 개념·용어와 자료에 근거한 짧은 정의입니다.\n" +
    "- 문제 type: mcq(4지선다, options 4개, answer는 options 중 하나와 글자까지 똑같이), ox(options는 [\"O\",\"X\"], answer는 O 또는 X), " +
    "blank(문장에 _____ 빈칸, options 4개, answer는 options 중 하나), short(단답·서술, options는 빈 배열, answer는 모범 답안).\n" +
    "- 오답 선지는 그럴듯하지만 자료를 읽으면 틀렸음을 알 수 있게 만드세요. 정답 위치를 골고루 섞으세요.\n" +
    "- explanation은 정답인 이유와 헷갈리기 쉬운 오답이 틀린 이유를 씁니다. evidence는 근거가 되는 원문 구절을 그대로 인용합니다.";
  function sysDraft(me, other) { return BASE + "\n\n당신(" + me + ")은 이번 작업의 작성자입니다." + (other ? " 초안을 만든 뒤 " + other + "이(가) 검토하고, 당신이 그 의견을 반영해 고칩니다." : ""); }
  function sysReview(me, writer) {
    return "당신(" + me + ")은 " + writer + "이(가) 만든 학습 자료 초안을 원래 자료와 대조해 검토하는 동료 튜터입니다.\n" +
      "- 찾을 것: 사실 오류, 자료에 근거가 없는 내용, 정답이 틀리거나 답이 둘 이상인 문제, 너무 쉬운 오답 선지, 빠진 핵심 내용, 요청한 난이도·유형과 맞지 않는 점.\n" +
      "- question_reviews에는 모든 문제를 번호(1부터)로 하나씩 평가합니다. good=그대로, fix=고치면 됨, replace=다른 문제로 바꿔야 함. comment에는 무엇이 문제고 어떻게 고칠지 구체적으로 씁니다. good이면 짧게 씁니다.\n" +
      "- 지적은 근거를 들어 구체적으로, 칭찬은 짧게 합니다. 모든 내용은 한국어로 씁니다.";
  }
  function sysRevise(me, reviewer) {
    return BASE + "\n\n당신(" + me + ")은 작성자입니다. " + reviewer + "이(가) 당신의 초안을 검토했습니다.\n" +
      "- 검토 의견을 하나씩 자료와 대조해 판단합니다. 맞는 의견은 반영하고, 동의하지 않는 의견은 반영하지 말고 이유를 reply.rejected에 적습니다.\n" +
      "- 고친 최종 학습 자료 전체(title, summary, terms, questions)를 다시 씁니다. 문제 수와 유형 요청은 지킵니다.\n" +
      "- reply.accepted에는 반영한 점을 한 줄씩, reply.message에는 검토자에게 하는 짧은 답변(1~2문장)을 씁니다.";
  }
  function request(cfg) {
    var types = Object.keys(S.TYPE_NAMES).filter(function (t) { return cfg.types[t]; });
    if (!types.length) types = ["mcq"];
    return "요청 사항\n- 문제 수: " + cfg.n + "개\n" +
      "- 문제 유형: " + types.map(function (t) { return t + "(" + S.TYPE_NAMES[t] + ")"; }).join(", ") + " — 이 유형들만 골고루 섞기\n" +
      "- 난이도: " + cfg.level + (cfg.level === "쉬움" ? " (핵심 사실 확인 위주)" : cfg.level === "어려움" ? " (여러 내용을 연결하는 추론·응용 위주)" : " (이해와 적용을 섞어서)") +
      (cfg.focus ? "\n- 특히 집중할 부분: " + cfg.focus : "");
  }
  function J(x) { return JSON.stringify(x, null, 1); }
  function content(r) { return { title: r.title, summary: r.summary, terms: r.terms, questions: r.questions }; }

  /* ---------- 각 회사 API 호출 ---------- */
  var sdk = {};
  function load(which) {
    if (!sdk[which]) sdk[which] = import(which === "claude" ? ANTHROPIC_SDK : OPENAI_SDK).then(function (m) { return m.default || m.Anthropic || m.OpenAI; })
      .catch(function (e) { sdk[which] = null; throw e; });
    return sdk[which];
  }
  function AIError(who, msg, cause) { var e = new Error(msg); e.who = who; e.cause = cause; return e; }

  // parts: [{type:"text", text} | {type:"pdf", data, name} | {type:"image", mime, data}]
  function callClaude(key, model, system, parts, schema, onChars) {
    return load("claude").then(function (Anthropic) {
      var client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
      var c = parts.map(function (p) {
        if (p.type === "pdf") return { type: "document", source: { type: "base64", media_type: "application/pdf", data: p.data }, title: p.name || "자료" };
        if (p.type === "image") return { type: "image", source: { type: "base64", media_type: p.mime, data: p.data } };
        return { type: "text", text: p.text };
      });
      var params = {
        model: model, max_tokens: 64000, system: system,
        messages: [{ role: "user", content: c }],
        output_config: { effort: model === "claude-haiku-5-5" ? "low" : "medium", format: { type: "json_schema", schema: schema } }
      };
      // 안전 분류기가 거절하면 서버가 다른 모델로 이어서 답한다 (Opus·Sonnet만 지원).
      if (model !== "claude-haiku-5-5") { params.betas = ["server-side-fallback-2026-07-01"]; params.fallbacks = "default"; }
      var stream = client.beta.messages.stream(params), n = 0;
      if (onChars) stream.on("text", function (t) { n += t.length; onChars(n); });
      return stream.finalMessage();
    }).then(function (msg) {
      if (msg.stop_reason === "refusal") throw AIError("claude", "Claude가 이 요청에 답하지 않았습니다." + (msg.stop_details && msg.stop_details.explanation ? " (" + msg.stop_details.explanation + ")" : ""));
      if (msg.stop_reason === "max_tokens") throw AIError("claude", "Claude의 응답이 너무 길어 끊겼습니다. 문제 수를 줄이거나 자료를 나눠 주세요.");
      var text = msg.content.filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("");
      try { return JSON.parse(text); } catch (e) { throw AIError("claude", "Claude의 응답을 읽지 못했습니다. 다시 시도해 주세요."); }
    }, function (e) { throw e.who ? e : AIError("claude", errText(e, "Claude"), e); });
  }
  function callGPT(key, model, system, parts, schema, name) {
    return load("gpt").then(function (OpenAI) {
      var client = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });
      var c = parts.map(function (p) {
        if (p.type === "pdf") return { type: "input_file", filename: p.name || "자료.pdf", file_data: "data:application/pdf;base64," + p.data };
        if (p.type === "image") return { type: "input_image", image_url: "data:" + p.mime + ";base64," + p.data, detail: "auto" };
        return { type: "input_text", text: p.text };
      });
      return client.responses.create({
        model: model, instructions: system,
        input: [{ role: "user", content: c }],
        max_output_tokens: 64000,
        text: { format: { type: "json_schema", name: name, schema: schema, strict: true } }
      });
    }).then(function (r) {
      if (r.status === "incomplete") throw AIError("gpt", "GPT의 응답이 중간에 끊겼습니다" + (r.incomplete_details && r.incomplete_details.reason === "max_output_tokens" ? " (너무 김). 문제 수를 줄여 주세요." : "."));
      var refusal = (r.output || []).some(function (o) { return (o.content || []).some(function (c) { return c.type === "refusal"; }); });
      if (refusal) throw AIError("gpt", "GPT가 이 요청에 답하지 않았습니다.");
      try { return JSON.parse(r.output_text); } catch (e) { throw AIError("gpt", "GPT의 응답을 읽지 못했습니다. 다시 시도해 주세요."); }
    }, function (e) { throw e.who ? e : AIError("gpt", errText(e, "GPT"), e); });
  }
  function errText(e, who) {
    var s = e && e.status;
    if (s === 401) return who + " API 키가 올바르지 않습니다. 키를 다시 확인해 주세요.";
    if (s === 403) return who + " 키로는 이 모델을 쓸 권한이 없습니다.";
    if (s === 404) return who + " 모델 이름을 찾을 수 없습니다. AI 설정에서 모델을 확인해 주세요.";
    if (s === 429) return who + " 요청이 너무 많거나 사용 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.";
    if (s === 400) return who + "이(가) 요청을 거부했습니다: " + ((e.error && (e.error.message || (e.error.error && e.error.error.message))) || e.message);
    if (s >= 500) return who + " 서버에 문제가 있습니다. 잠시 후 다시 시도해 주세요.";
    if (e && /import|dynamically|Failed to fetch|NetworkError|Connection error/i.test(e.message || "")) return who + "에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.";
    return who + ": " + ((e && e.message) || String(e));
  }
  function call(who, set, system, parts, schema, name, onChars) {
    return who === "claude" ? callClaude(set.claude.key, set.claude.model, system, parts, schema, onChars)
      : callGPT(set.gpt.key, set.gpt.model, system, parts, schema, name);
  }

  /* ---------- 상의해서 만들기 ----------
     set: { claude:{key,model}, gpt:{key,model}, lead:"claude"|"gpt", rounds:1|2 }
     onStep({i, who, kind, state:"run"|"done", chars}) 로 진행 상황을 알린다. */
  S.plan = function (set) {
    var has = { claude: !!set.claude.key, gpt: !!set.gpt.key };
    if (has.claude && has.gpt) {
      var w = set.lead, r = w === "claude" ? "gpt" : "claude", steps = [{ who: w, kind: "draft" }];
      for (var k = 0; k < set.rounds; k++) steps.push({ who: r, kind: "review" }, { who: w, kind: "revise" });
      return steps;
    }
    if (has.claude) return [{ who: "claude", kind: "solo" }];
    if (has.gpt) return [{ who: "gpt", kind: "solo" }];
    return [];
  };
  S.generate = function (src, cfg, set, onStep) {
    var steps = S.plan(set), log = [], cur = null, lastReview = null;
    var srcParts = [];
    if (src.pdf) srcParts.push({ type: "pdf", data: src.pdf, name: src.name });
    (src.images || []).forEach(function (im) { srcParts.push({ type: "image", mime: im.type, data: im.data }); });
    if (src.text) srcParts.push({ type: "text", text: "<자료>\n" + src.text + "\n</자료>" });
    var req = request(cfg);
    var chain = Promise.resolve();
    steps.forEach(function (s, i) {
      chain = chain.then(function () {
        var me = S.AI[s.who].name, other = S.AI[s.who === "claude" ? "gpt" : "claude"].name, t0 = Date.now();
        onStep({ i: i, who: s.who, kind: s.kind, state: "run" });
        var p;
        if (s.kind === "draft" || s.kind === "solo")
          p = call(s.who, set, sysDraft(me, s.kind === "draft" ? other : ""), srcParts.concat([{ type: "text", text: req }]), CONTENT, "study_material", function (n) { onStep({ i: i, who: s.who, kind: s.kind, state: "run", chars: n }); })
            .then(function (r) { cur = r; return { one_line: r.summary.one_line, questions: r.questions.length, terms: r.terms.length }; });
        else if (s.kind === "review")
          p = call(s.who, set, sysReview(me, other), srcParts.concat([{ type: "text", text: req + "\n\n<검토할 초안 (작성: " + other + ")>\n" + J(content(cur)) + "\n</검토할 초안>" }]), REVIEW, "review")
            .then(function (r) { lastReview = r; return r; });
        else
          p = call(s.who, set, sysRevise(me, other), srcParts.concat([{ type: "text", text: req + "\n\n<내 초안>\n" + J(content(cur)) + "\n</내 초안>\n\n<" + other + "의 검토 의견>\n" + J(lastReview) + "\n</" + other + "의 검토 의견>" }]), REVISION, "revision", function (n) { onStep({ i: i, who: s.who, kind: s.kind, state: "run", chars: n }); })
            .then(function (r) { var reply = r.reply; cur = content(r); return reply; });
        return p.then(function (data) {
          log.push({ who: s.who, kind: s.kind, data: data, sec: Math.round((Date.now() - t0) / 1000) });
          onStep({ i: i, who: s.who, kind: s.kind, state: "done" });
        });
      });
    });
    return chain.then(function () {
      cur.log = log;
      cur.team = steps.length > 1 ? { lead: set.lead, rounds: set.rounds, models: { claude: set.claude.model, gpt: set.gpt.model } } : { solo: steps[0].who, models: { claude: set.claude.model, gpt: set.gpt.model } };
      return cur;
    }, function (e) {
      // 상의 도중 실패했어도 앞 단계 결과가 있으면 살려서 돌려준다.
      if (cur && log.length) { cur.log = log; cur.partial = e.message; cur.team = { lead: set.lead, rounds: set.rounds, models: { claude: set.claude.model, gpt: set.gpt.model } }; return cur; }
      throw e;
    });
  };

  /* ---------- 상의해서 채점 (단답·서술) ---------- */
  var GRADE_SYS = "당신은 학생의 단답·서술형 답안을 채점하는 튜터입니다. 모범 답안과 근거 원문을 기준으로, 표현이 달라도 핵심 내용이 맞으면 정답으로 봅니다. " +
    "verdict는 correct(핵심을 모두 맞힘), partial(일부만 맞음), wrong(틀림 또는 빈 답) 중 하나, score는 0~100 점수, feedback은 학생에게 주는 한국어 피드백(무엇이 맞고 무엇이 빠졌는지, 1~3문장)입니다.";
  function gradeText(q, ans) {
    return "<문제>\n" + q.question + "\n</문제>\n<모범 답안>\n" + q.answer + "\n</모범 답안>\n" + (q.evidence ? "<근거 원문>\n" + q.evidence + "\n</근거 원문>\n" : "") + "<학생 답안>\n" + (ans || "(빈 답)") + "\n</학생 답안>";
  }
  S.grade = function (q, ans, set, onStep) {
    var who = ["claude", "gpt"].filter(function (w) { return set[w].key; });
    var base = gradeText(q, ans);
    onStep && onStep("두 AI가 따로 채점하는 중…");
    return Promise.all(who.map(function (w) { return call(w, set, GRADE_SYS, [{ type: "text", text: base }], GRADE, "grade"); })).then(function (first) {
      var r1 = {}; who.forEach(function (w, i) { r1[w] = first[i]; });
      if (who.length < 2 || r1.claude.verdict === r1.gpt.verdict) return { rounds: [r1], verdict: r1[who[0]].verdict, agreed: true };
      onStep && onStep("의견이 달라서 서로의 채점을 보고 다시 판단하는 중…");
      return Promise.all(who.map(function (w) {
        var o = w === "claude" ? "gpt" : "claude", on = S.AI[o].name;
        return call(w, set, GRADE_SYS + " 다른 튜터(" + on + ")의 채점을 보고, 근거가 타당하면 의견을 바꾸고 아니면 유지합니다. reply에는 " + on + "에게 하는 한 문장 답변을 씁니다.",
          [{ type: "text", text: base + "\n\n<당신의 처음 채점>\n" + J(r1[w]) + "\n</당신의 처음 채점>\n<" + on + "의 채점>\n" + J(r1[o]) + "\n</" + on + "의 채점>" }], REGRADE, "regrade");
      })).then(function (second) {
        var r2 = { claude: second[0], gpt: second[1] };
        var agreed = r2.claude.verdict === r2.gpt.verdict;
        return { rounds: [r1, r2], verdict: agreed ? r2.claude.verdict : null, agreed: agreed };
      });
    });
  };
})();
