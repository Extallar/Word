/* 자료 학습 노트: 자료(텍스트·파일·PDF·이미지)를 넣으면 요약·핵심 용어·문제를 만들어 풀게 한다.
   - AI 모드: 사용자가 넣은 Claude API 키로 브라우저에서 바로 요청 (키는 이 브라우저에만 저장)
   - 기본 모드(키 없음): 중요 문장 추출 요약 + 핵심어 용어 카드·빈칸 문제
   화면: #/ 보관함·새 자료, #/item/<id> 자료 하나 */
(function () {
  "use strict";
  var SKEY = "study-notes-v1", KKEY = "study-notes-key";
  var SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.7.0/+esm";
  var MODELS = [
    ["claude-opus-5-5", "Claude Opus 5.5 (기본, 가장 정확)"],
    ["claude-sonnet-5-5", "Claude Sonnet 5.5 (빠르고 저렴)"],
    ["claude-haiku-5-5", "Claude Haiku 5.5 (가장 저렴)"]
  ];
  var TYPE_NAMES = { mcq: "객관식", ox: "OX", blank: "빈칸", short: "단답·서술" };
  var MAX_TEXT = 300000;      // 한 번에 보낼 텍스트 최대 글자 수
  var MAX_SAVE_TEXT = 40000;  // 보관함에 함께 저장할 원문 최대 글자 수

  var st = { items: [], cfg: { n: 10, level: "보통", types: { mcq: 1, ox: 1, blank: 1, short: 1 }, model: MODELS[0][0] } };
  try { var sv = JSON.parse(localStorage.getItem(SKEY) || "null"); if (sv) { st.items = sv.items || []; Object.assign(st.cfg, sv.cfg || {}); } } catch (e) {}
  function save() {
    try { localStorage.setItem(SKEY, JSON.stringify(st)); return true; }
    catch (e) {
      // 용량 초과: 오래된 자료의 원문부터 지운다.
      for (var i = st.items.length - 1; i >= 0; i--) { if (st.items[i].text) { st.items[i].text = ""; try { localStorage.setItem(SKEY, JSON.stringify(st)); return true; } catch (e2) {} } }
      return false;
    }
  }
  var memKey = "";
  function getKey() { if (memKey) return memKey; try { return localStorage.getItem(KKEY) || ""; } catch (e) { return ""; } }
  function setKey(k, remember) {
    memKey = k;
    try { if (remember && k) localStorage.setItem(KKEY, k); else localStorage.removeItem(KKEY); } catch (e) {}
  }

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

  /* ---------- AI 모드 (Claude API) ---------- */
  var SCHEMA = {
    type: "object", additionalProperties: false,
    required: ["title", "summary", "terms", "questions"],
    properties: {
      title: { type: "string" },
      summary: {
        type: "object", additionalProperties: false, required: ["one_line", "key_points", "sections"],
        properties: {
          one_line: { type: "string" },
          key_points: { type: "array", items: { type: "string" } },
          sections: { type: "array", items: { type: "object", additionalProperties: false, required: ["heading", "body"], properties: { heading: { type: "string" }, body: { type: "string" } } } }
        }
      },
      terms: { type: "array", items: { type: "object", additionalProperties: false, required: ["term", "definition"], properties: { term: { type: "string" }, definition: { type: "string" } } } },
      questions: {
        type: "array",
        items: {
          type: "object", additionalProperties: false,
          required: ["type", "question", "options", "answer", "explanation", "evidence"],
          properties: {
            type: { type: "string", enum: ["mcq", "ox", "blank", "short"] },
            question: { type: "string" },
            options: { type: "array", items: { type: "string" } },
            answer: { type: "string" },
            explanation: { type: "string" },
            evidence: { type: "string" }
          }
        }
      }
    }
  };
  var SYSTEM =
    "당신은 시험 공부를 돕는 튜터입니다. 학생이 준 자료만 근거로 요약, 핵심 용어, 연습 문제를 만듭니다.\n" +
    "- 자료에 없는 사실을 지어내지 마세요. 모든 문제의 정답은 자료로 확인할 수 있어야 합니다.\n" +
    "- 설명과 해설은 한국어로 씁니다. 자료가 영어면 용어·인용·문제 본문에 영어 원문을 그대로 써도 됩니다.\n" +
    "- summary.one_line은 한 문장, key_points는 3~8개 핵심 bullet, sections는 자료 흐름대로 나눈 정리 노트(각 body는 2~5문장)입니다.\n" +
    "- terms는 시험에 나올 만한 개념·용어와 자료에 근거한 짧은 정의입니다.\n" +
    "- 문제 type: mcq(4지선다, options 4개, answer는 options 중 하나와 글자까지 똑같이), ox(options는 [\"O\",\"X\"], answer는 O 또는 X), " +
    "blank(문장에 _____ 빈칸, options 4개, answer는 options 중 하나), short(단답·서술, options는 빈 배열, answer는 모범 답안).\n" +
    "- 오답 선지는 그럴듯하지만 자료를 읽으면 틀렸음을 알 수 있게 만드세요. 정답 위치를 골고루 섞으세요.\n" +
    "- explanation은 정답인 이유와 헷갈리기 쉬운 오답이 틀린 이유를 씁니다. evidence는 근거가 되는 원문 구절을 그대로 인용합니다.";

  function promptFor(cfg) {
    var types = Object.keys(TYPE_NAMES).filter(function (t) { return cfg.types[t]; });
    if (!types.length) types = ["mcq"];
    return "위 자료로 학습 자료를 만들어 주세요.\n" +
      "- 문제 수: " + cfg.n + "개\n" +
      "- 문제 유형: " + types.map(function (t) { return t + "(" + TYPE_NAMES[t] + ")"; }).join(", ") + " — 이 유형들만 골고루 섞기\n" +
      "- 난이도: " + cfg.level + (cfg.level === "쉬움" ? " (핵심 사실 확인 위주)" : cfg.level === "어려움" ? " (여러 내용을 연결하는 추론·응용 위주)" : " (이해와 적용을 섞어서)") +
      (cfg.focus ? "\n- 특히 집중할 부분: " + cfg.focus : "");
  }

  var sdkPromise = null;
  function loadSDK() { if (!sdkPromise) sdkPromise = import(SDK_URL).then(function (m) { return m.default || m.Anthropic; }); return sdkPromise; }

  function buildAI(src, cfg, key, onProgress) {
    return loadSDK().then(function (Anthropic) {
      var client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
      var content = [];
      if (src.pdf) content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: src.pdf }, title: src.name || "자료" });
      (src.images || []).forEach(function (im) { content.push({ type: "image", source: { type: "base64", media_type: im.type, data: im.data } }); });
      if (src.text) content.push({ type: "text", text: "<자료>\n" + src.text + "\n</자료>" });
      content.push({ type: "text", text: promptFor(cfg) });
      var params = {
        model: cfg.model,
        max_tokens: 64000,
        system: SYSTEM,
        messages: [{ role: "user", content: content }],
        output_config: { effort: cfg.model === "claude-haiku-5-5" ? "low" : "medium", format: { type: "json_schema", schema: SCHEMA } }
      };
      // 안전 분류기가 거절하면 서버가 다른 모델로 이어서 답하게 한다 (Opus·Sonnet만 지원).
      if (cfg.model !== "claude-haiku-5-5") { params.betas = ["server-side-fallback-2026-07-01"]; params.fallbacks = "default"; }
      var stream = client.beta.messages.stream(params);
      var chars = 0;
      stream.on("text", function (t) { chars += t.length; if (onProgress) onProgress(chars); });
      return stream.finalMessage();
    }).then(function (msg) {
      if (msg.stop_reason === "refusal") throw new Error("이 자료로는 문제를 만들 수 없다는 응답을 받았습니다." + (msg.stop_details && msg.stop_details.explanation ? " (" + msg.stop_details.explanation + ")" : ""));
      if (msg.stop_reason === "max_tokens") throw new Error("응답이 너무 길어 중간에 끊겼습니다. 문제 수를 줄이거나 자료를 나눠서 넣어 주세요.");
      var text = msg.content.filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("");
      var data;
      try { data = JSON.parse(text); } catch (e) { throw new Error("응답을 읽지 못했습니다. 다시 시도해 주세요."); }
      data.usage = msg.usage ? { input: msg.usage.input_tokens, output: msg.usage.output_tokens } : null;
      data.model = msg.model;
      return data;
    });
  }
  function errText(e) {
    var s = e && e.status;
    if (s === 401) return "API 키가 올바르지 않습니다. 키를 다시 확인해 주세요.";
    if (s === 403) return "이 키로는 요청할 권한이 없습니다.";
    if (s === 429) return "요청이 너무 많거나 사용 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.";
    if (s === 400) return "요청이 거부되었습니다: " + ((e.error && e.error.error && e.error.error.message) || e.message);
    if (s >= 500) return "Claude 서버에 문제가 있습니다. 잠시 후 다시 시도해 주세요.";
    if (e && /import|fetch dynamically|Failed to fetch/i.test(e.message || "")) return "네트워크에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.";
    return (e && e.message) || String(e);
  }

  /* ---------- 파일 읽기 ---------- */
  function readFile(f) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onerror = function () { rej(new Error(f.name + "을(를) 읽지 못했습니다.")); };
      if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
        r.onload = function () { res({ kind: "pdf", name: f.name, data: String(r.result).split(",")[1] }); }; r.readAsDataURL(f);
      } else if (/^image\/(png|jpeg|gif|webp)$/.test(f.type)) {
        r.onload = function () { res({ kind: "image", name: f.name, type: f.type, data: String(r.result).split(",")[1] }); }; r.readAsDataURL(f);
      } else if (/\.(txt|md|csv|tsv|html?|json|srt|vtt)$/i.test(f.name) || /^text\//.test(f.type)) {
        r.onload = function () { var t = String(r.result); if (/\.html?$/i.test(f.name)) { var d = document.createElement("div"); d.innerHTML = t; t = d.textContent; } res({ kind: "text", name: f.name, data: t }); }; r.readAsText(f);
      } else rej(new Error(f.name + ": 지원하지 않는 형식입니다. 텍스트(.txt .md), PDF, 이미지(PNG·JPG)를 넣어 주세요. Word·한글 파일은 내용을 복사해 붙여 넣어 주세요."));
    });
  }

  /* ---------- 화면 ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function fmtDate(t) { var d = new Date(t); return (d.getMonth() + 1) + "/" + d.getDate() + " " + d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0"); }

  var el = document.getElementById("app");
  // 고정 헤더 높이를 CSS 변수로 (점수 막대가 헤더 밑에 붙도록)
  function setHdr() { var h = document.querySelector("header.top"); if (h) document.documentElement.style.setProperty("--hdr", h.offsetHeight + "px"); }
  setHdr(); window.addEventListener("resize", setHdr);
  (function () {
    var $ = function (s) { return el.querySelector(s); };
    var files = [], cur = null, tab = "sum", qFilter = "all";

    function list() {
      var key = getKey(), cfg = st.cfg;
      el.innerHTML =
        '<div><div class="eyebrow">새 자료</div><h2>자료로 요약·문제 만들기</h2></div>' +
        '<p class="lead">교재·필기·기사·지문을 넣으면 요약, 핵심 용어 카드, 연습 문제를 만들어 줍니다. 푼 결과는 자료별로 저장되고, 틀린 문제만 다시 풀 수 있습니다.</p>' +
        '<div class="panel stu-in">' +
          '<h3>1. 자료 넣기</h3>' +
          '<input id="stitle" class="stu-text" placeholder="제목 (비우면 자동)" maxlength="80">' +
          '<textarea id="stext" class="stu-text" rows="9" placeholder="여기에 내용을 붙여 넣거나, 아래에서 파일을 고르세요."></textarea>' +
          '<div class="row"><label class="btn" for="sfile">파일 선택</label><input type="file" id="sfile" multiple accept=".txt,.md,.csv,.tsv,.html,.htm,.json,.srt,.vtt,.pdf,image/png,image/jpeg,image/gif,image/webp" hidden>' +
          '<small class="stu-mut">텍스트 · PDF · 이미지(사진 찍은 필기·교재). 파일을 이 칸에 끌어다 놓아도 됩니다.</small></div>' +
          '<div id="sfiles" class="row"></div>' +
          '<h3>2. 문제 설정</h3>' +
          '<div class="row"><label class="stu-lab">문제 수 <select id="sn">' + [5, 10, 15, 20, 30].map(function (n) { return '<option' + (n === cfg.n ? " selected" : "") + ">" + n + "</option>"; }).join("") + "</select></label>" +
          '<label class="stu-lab">난이도 <select id="slv">' + ["쉬움", "보통", "어려움"].map(function (l) { return "<option" + (l === cfg.level ? " selected" : "") + ">" + l + "</option>"; }).join("") + "</select></label></div>" +
          '<div class="row" id="stypes">' + Object.keys(TYPE_NAMES).map(function (t) { return '<button class="chip' + (cfg.types[t] ? " on" : "") + '" data-t="' + t + '" aria-pressed="' + !!cfg.types[t] + '">' + TYPE_NAMES[t] + "</button>"; }).join("") + '<small class="stu-mut">(AI 모드)</small></div>' +
          '<input id="sfocus" class="stu-text" placeholder="집중할 부분 (선택, 예: 3장 실험 결과 위주로)" maxlength="200">' +
          '<h3>3. 만들기</h3>' +
          '<details class="stu-key"' + (key ? "" : " open") + '><summary>AI 설정 ' + (key ? '<span class="tag good">키 있음</span>' : '<span class="tag plain">키 없음 · 기본 모드</span>') + "</summary>" +
            '<p class="stu-mut">Claude API 키(sk-ant-…)를 넣으면 내용 이해 문제와 해설, 정리 노트를 만듭니다. 키는 <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener">Claude Console</a>에서 발급하며, 사용량만큼 요금이 나옵니다. 키는 이 브라우저에만 저장되고 Anthropic 서버로만 전송됩니다. 공용 컴퓨터에서는 "기억하기"를 끄세요.</p>' +
            '<div class="row"><input id="skey" type="password" class="stu-text" style="flex:1;min-width:200px;margin:0" placeholder="sk-ant-..." value="' + esc(key) + '" autocomplete="off">' +
            '<label class="chk"><input type="checkbox" id="srem"' + (key && !memKey ? " checked" : (!key ? " checked" : "")) + "> 기억하기</label>" +
            '<select id="smodel">' + MODELS.map(function (m) { return '<option value="' + m[0] + '"' + (m[0] === cfg.model ? " selected" : "") + ">" + m[1] + "</option>"; }).join("") + "</select></div>" +
          "</details>" +
          '<div class="row" style="margin-top:12px"><button class="btn primary" id="sgo">요약·문제 만들기</button><span id="smsg" class="stu-mut" role="status"></span></div>' +
        "</div>" +
        '<h3 style="margin-top:8px">내 자료 보관함 (' + st.items.length + ")</h3>" +
        '<div class="wlist" id="slib">' + (st.items.length ? st.items.map(function (it) {
          var a = it.ans || {}, qn = (it.result.questions || []).length, done = Object.keys(a).length, ok = Object.keys(a).filter(function (k) { return a[k].ok; }).length;
          return '<div class="witem stu-item" data-open="' + it.id + '"><span class="tag ' + (it.mode === "ai" ? "good" : "plain") + '" style="justify-self:start">' + (it.mode === "ai" ? "AI" : "기본") + '</span><div style="min-width:0"><span class="w stu-it">' + esc(it.title) + '</span><div class="meta">' + fmtDate(it.created) + " · 문제 " + qn + "개 · 푼 문제 " + done + " · 정답 " + ok + "</div></div>" +
            '<div class="side"><button class="btn" data-del="' + it.id + '" aria-label="삭제">삭제</button></div></div>';
        }).join("") : '<div class="empty">아직 만든 자료가 없습니다.</div>') + "</div>";

      var ta = $("#stext");
      function drawFiles() {
        $("#sfiles").innerHTML = files.map(function (f, i) { return '<span class="tag plain">' + (f.kind === "pdf" ? "PDF" : f.kind === "image" ? "이미지" : "텍스트") + " · " + esc(f.name) + ' <button class="stu-x" data-rm="' + i + '" aria-label="빼기">×</button></span>'; }).join("");
      }
      function addFiles(fl) {
        Promise.all([].slice.call(fl).map(function (f) { return readFile(f).catch(function (e) { return { err: e.message }; }); })).then(function (rs) {
          var errs = [];
          rs.forEach(function (r) {
            if (r.err) errs.push(r.err);
            else if (r.kind === "text") { ta.value = (ta.value ? ta.value + "\n\n" : "") + r.data; if (!$("#stitle").value) $("#stitle").value = r.name.replace(/\.[^.]+$/, ""); }
            else { files.push(r); if (!$("#stitle").value) $("#stitle").value = r.name.replace(/\.[^.]+$/, ""); }
          });
          drawFiles(); $("#smsg").textContent = errs.join(" ");
        });
      }
      $("#sfile").onchange = function () { addFiles(this.files); this.value = ""; };
      el.querySelector(".stu-in").addEventListener("dragover", function (e) { e.preventDefault(); });
      el.querySelector(".stu-in").addEventListener("drop", function (e) { e.preventDefault(); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
      $("#sfiles").onclick = function (e) { var b = e.target.closest("[data-rm]"); if (b) { files.splice(+b.dataset.rm, 1); drawFiles(); } };
      $("#stypes").onclick = function (e) {
        var b = e.target.closest("[data-t]"); if (!b) return;
        cfg.types[b.dataset.t] = cfg.types[b.dataset.t] ? 0 : 1;
        if (!Object.keys(cfg.types).some(function (t) { return cfg.types[t]; })) cfg.types[b.dataset.t] = 1;
        b.classList.toggle("on", !!cfg.types[b.dataset.t]); b.setAttribute("aria-pressed", !!cfg.types[b.dataset.t]); save();
      };
      $("#sn").onchange = function () { cfg.n = +this.value; save(); };
      $("#slv").onchange = function () { cfg.level = this.value; save(); };
      $("#smodel").onchange = function () { cfg.model = this.value; save(); };
      $("#slib").onclick = function (e) {
        var d = e.target.closest("[data-del]");
        if (d) {
          if (d.dataset.sure) { st.items = st.items.filter(function (x) { return x.id !== d.dataset.del; }); save(); list(); }
          else { d.dataset.sure = 1; d.textContent = "정말 삭제"; d.classList.add("bad"); }
          return;
        }
        var o = e.target.closest("[data-open]"); if (o) go(o.dataset.open);
      };
      $("#sgo").onclick = function () {
        var text = ta.value.trim(), k = $("#skey").value.trim(), msg = $("#smsg"), btn = this;
        setKey(k, $("#srem").checked);
        cfg.focus = $("#sfocus").value.trim();
        if (!text && !files.length) { msg.textContent = "자료를 붙여 넣거나 파일을 골라 주세요."; ta.focus(); return; }
        if (text.length > MAX_TEXT) { msg.textContent = "자료가 너무 깁니다(" + text.length.toLocaleString() + "자). " + MAX_TEXT.toLocaleString() + "자 이하로 나눠서 넣어 주세요."; return; }
        var title = $("#stitle").value.trim();
        var hasBin = files.length > 0;
        if (!k) {
          if (hasBin && !text) { msg.textContent = "PDF·이미지는 AI 모드(API 키)에서만 읽을 수 있습니다. 키를 넣거나 내용을 텍스트로 붙여 넣어 주세요."; $(".stu-key").open = true; return; }
          if (splitSents(text).length < 3) { msg.textContent = "기본 모드는 문장이 세 개 이상인 자료가 필요합니다. 더 긴 자료를 넣거나 AI 키를 넣어 주세요."; return; }
          var r = buildLocal(text, cfg);
          finish("local", title || r.title, text, r, hasBin ? "PDF·이미지는 키가 없어 제외하고 텍스트만 사용했습니다." : "");
          return;
        }
        btn.disabled = true; msg.textContent = "Claude가 자료를 읽고 있습니다…";
        var src = { text: text, name: title, images: files.filter(function (f) { return f.kind === "image"; }) };
        var pdfs = files.filter(function (f) { return f.kind === "pdf"; });
        if (pdfs.length > 1) { msg.textContent = "PDF는 한 번에 하나씩 넣어 주세요."; btn.disabled = false; return; }
        if (pdfs.length) src.pdf = pdfs[0].data;
        var t0 = Date.now();
        buildAI(src, cfg, k, function (n) { msg.textContent = "만드는 중… " + n.toLocaleString() + "자 · " + Math.round((Date.now() - t0) / 1000) + "초"; })
          .then(function (r) { finish("ai", title || r.title, text, r, ""); })
          .catch(function (e) { msg.textContent = errText(e); btn.disabled = false; });
      };
    }

    function finish(mode, title, text, result, note) {
      var it = { id: String(Date.now()), title: title || "제목 없음", created: Date.now(), mode: mode, text: text.slice(0, MAX_SAVE_TEXT), result: result, ans: {}, note: note };
      st.items.unshift(it);
      if (!save()) it.note = (note ? note + " " : "") + "브라우저 저장 공간이 부족해 이 자료가 저장되지 않을 수 있습니다.";
      files = []; go(it.id);
    }

    function go(id) { location.hash = id ? "#/item/" + id : "#/"; }
    function open(id) {
      cur = st.items.filter(function (x) { return x.id === id; })[0];
      if (!cur) return list();
      tab = "sum"; qFilter = "all"; draw();
      window.scrollTo(0, 0);
    }
    function route() {
      var m = location.hash.match(/^#\/item\/(.+)$/);
      if (m) open(m[1]); else { cur = null; list(); window.scrollTo(0, 0); }
    }
    window.addEventListener("hashchange", route);

    function draw() {
      var r = cur.result, qs = r.questions || [];
      var a = cur.ans, done = Object.keys(a).length, ok = Object.keys(a).filter(function (k) { return a[k].ok; }).length;
      var wrongN = Object.keys(a).filter(function (k) { return !a[k].ok; }).length;
      el.innerHTML =
        '<div class="row" style="justify-content:space-between"><button class="btn" id="sback">← 보관함</button>' +
        '<span class="tag ' + (cur.mode === "ai" ? "good" : "plain") + '">' + (cur.mode === "ai" ? "AI 생성" : "기본 모드") + "</span></div>" +
        '<div><div class="eyebrow">' + fmtDate(cur.created) + '</div><h2 class="stu-h">' + esc(cur.title) + "</h2></div>" +
        (r.note || cur.note ? '<p class="stu-note">' + esc([r.note, cur.note].filter(Boolean).join(" ")) + "</p>" : "") +
        '<div class="row" role="tablist">' + [["sum", "요약"], ["terms", "용어 카드 " + (r.terms || []).length], ["quiz", "문제 " + qs.length], ["src", "원문"]].map(function (t) {
          return '<button class="chip' + (tab === t[0] ? " on" : "") + '" role="tab" aria-selected="' + (tab === t[0]) + '" data-tab="' + t[0] + '">' + t[1] + "</button>";
        }).join("") + "</div>" +
        '<div id="sbody"></div>';
      var body = $("#sbody");
      if (tab === "sum") {
        var s = r.summary || {};
        body.innerHTML =
          (s.one_line ? '<div class="panel stu-one"><small>한 줄 요약</small><p>' + esc(s.one_line) + "</p></div>" : "") +
          ((s.key_points || []).length ? '<div class="panel"><h3>핵심 정리</h3><ul class="stu-ul">' + s.key_points.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul></div>" : "") +
          ((s.sections || []).length ? '<div class="panel"><h3>정리 노트</h3>' + s.sections.map(function (x) { return '<h4 class="stu-h4">' + esc(x.heading) + '</h4><p class="stu-p">' + esc(x.body) + "</p>"; }).join("") + "</div>" : "") +
          '<div class="row"><button class="btn primary" data-tab="quiz">문제 풀기 →</button><button class="btn" data-tab="terms">용어 카드</button></div>';
      } else if (tab === "terms") {
        var ts = r.terms || [];
        body.innerHTML = ts.length ? '<p class="stu-mut">카드를 누르면 뜻이 보입니다. 모두 가리고 스스로 떠올려 보세요.</p><div class="row"><button class="btn" id="sflip">모두 뒤집기</button></div><div class="stu-cards">' + ts.map(function (t, i) {
          return '<button class="stu-card" data-i="' + i + '" aria-expanded="false"><b>' + esc(t.term) + "</b>" + '<span class="stu-def" hidden>' + esc(t.definition) + "</span></button>";
        }).join("") + "</div>" : '<div class="empty">이 자료에서 뽑은 용어가 없습니다.</div>';
        var all = false;
        var fb = $("#sflip"); if (fb) fb.onclick = function () { all = !all; body.querySelectorAll(".stu-card").forEach(function (c) { c.querySelector(".stu-def").hidden = !all; c.setAttribute("aria-expanded", all); }); };
        body.onclick = function (e) { var c = e.target.closest(".stu-card"); if (c) { var d = c.querySelector(".stu-def"); d.hidden = !d.hidden; c.setAttribute("aria-expanded", !d.hidden); } };
      } else if (tab === "quiz") {
        var idx = qs.map(function (q, i) { return i; }).filter(function (i) { return qFilter === "all" || (qFilter === "wrong" ? a[i] && !a[i].ok : !a[i]); });
        body.innerHTML =
          '<div class="scorebar row" style="justify-content:space-between"><span class="score">' + done + "/" + qs.length + "문제 풀이 · 정답 " + ok + (done ? " (" + Math.round(ok / done * 100) + "%)" : "") + "</span>" +
          '<span class="row">' + [["all", "전체"], ["todo", "안 푼 문제"], ["wrong", "틀린 문제 " + wrongN]].map(function (f) { return '<button class="chip' + (qFilter === f[0] ? " on" : "") + '" data-f="' + f[0] + '">' + f[1] + "</button>"; }).join("") +
          '<button class="btn" id="sreset">다시 풀기</button></span></div>' +
          '<div class="qgrid">' + (idx.length ? idx.map(function (i) { return qHtml(qs[i], i); }).join("") : '<div class="empty">' + (qFilter === "wrong" ? "틀린 문제가 없습니다." : "모두 풀었습니다.") + "</div>") + "</div>";
        body.querySelectorAll(".stu-q").forEach(function (c) { var i = +c.dataset.q; if (a[i]) showAns(c, qs[i], a[i]); });
        body.onclick = onQuizClick;
      } else {
        body.innerHTML = cur.text ? '<div class="panel stu-src">' + esc(cur.text).replace(/\n/g, "<br>") + "</div>" + (cur.text.length >= MAX_SAVE_TEXT ? '<p class="stu-mut">원문은 앞부분 ' + MAX_SAVE_TEXT.toLocaleString() + "자만 저장됩니다.</p>" : "")
          : '<div class="empty">저장된 원문이 없습니다 (PDF·이미지로 넣었거나 저장 공간 때문에 지워졌습니다).</div>';
      }
      $("#sback").onclick = function () { go(""); };
      el.querySelectorAll("[data-tab]").forEach(function (b) { b.onclick = function () { tab = b.dataset.tab; draw(); }; });
    }

    function qHtml(q, i) {
      var opts = q.type === "ox" ? ["O", "X"] : (q.options || []);
      return '<div class="qcard stu-q" data-q="' + i + '" id="sq' + i + '">' +
        '<div class="qhead"><span class="tag num">' + (i + 1) + '</span><span class="tag plain">' + (TYPE_NAMES[q.type] || q.type) + "</span></div>" +
        '<div class="stem">' + esc(q.question).replace(/\n/g, "<br>").replace(/_{3,}/g, '<span class="blank">　　　</span>') + "</div>" +
        (q.type === "short" || !opts.length
          ? '<textarea class="stu-text stu-ans" rows="2" placeholder="답을 적어 보세요"></textarea><div class="row"><button class="btn primary" data-show>정답 확인</button></div>'
          : '<div class="opts' + (q.type === "ox" ? " stu-ox" : "") + '">' + opts.map(function (o, k) { return '<button class="opt" data-o="' + k + '"><span class="bubble">' + (q.type === "ox" ? o : k + 1) + '</span><span class="otext">' + (q.type === "ox" ? (o === "O" ? "맞다" : "틀리다") : esc(o)) + "</span></button>"; }).join("") + "</div>") +
        '<div class="stu-res"></div></div>';
    }
    function norm(s) { return String(s || "").replace(/^\s*[①②③④⑤1-5][.)]?\s*/, "").trim().toLowerCase(); }
    function showAns(card, q, rec) {
      card.querySelectorAll(".opt").forEach(function (o) {
        o.disabled = true;
        var txt = q.type === "ox" ? (o.dataset.o === "0" ? "O" : "X") : (q.options || [])[+o.dataset.o];
        if (norm(txt) === norm(q.answer)) o.classList.add("correct");
        else if (rec.pick != null && String(rec.pick) === o.dataset.o) o.classList.add("wrong");
      });
      var ta = card.querySelector(".stu-ans"); if (ta) { ta.value = rec.text || ""; ta.disabled = true; var sb = card.querySelector("[data-show]"); if (sb) sb.remove(); }
      card.querySelector(".stu-res").innerHTML = '<div class="explain">' +
        (q.type === "short" || !(q.options || []).length && q.type !== "ox" ? "" : '<p class="' + (rec.ok ? "ok" : "ng") + '"><b>' + (rec.ok ? "정답" : "오답") + "</b></p>") +
        (q.type === "short" ? "<p><b>모범 답안</b> " + esc(q.answer) + "</p>" : "<p><b>정답</b> " + esc(q.answer) + "</p>") +
        (q.explanation ? "<p>" + esc(q.explanation) + "</p>" : "") +
        (q.evidence ? '<p class="stu-ev">근거: “' + esc(q.evidence) + "”</p>" : "") +
        (q.type === "short" && rec.self == null ? '<div class="row"><span class="stu-mut">내 답이 맞았나요?</span><button class="btn good" data-self="1">맞았어요</button><button class="btn bad" data-self="0">틀렸어요</button></div>' : "") +
        (q.type === "short" && rec.self != null ? '<p class="' + (rec.ok ? "ok" : "ng") + '"><b>' + (rec.ok ? "맞았어요" : "틀렸어요") + "</b> (스스로 채점)</p>" : "") +
        "</div>";
    }
    function onQuizClick(e) {
      var qs = cur.result.questions, card = e.target.closest(".stu-q");
      var f = e.target.closest("[data-f]"); if (f) { qFilter = f.dataset.f; draw(); return; }
      if (e.target.id === "sreset") {
        if (e.target.dataset.sure) { cur.ans = {}; save(); qFilter = "all"; draw(); }
        else { e.target.dataset.sure = 1; e.target.textContent = "기록 지우고 다시 풀기"; e.target.classList.add("bad"); }
        return;
      }
      if (!card) return;
      var i = +card.dataset.q, q = qs[i];
      var o = e.target.closest(".opt");
      if (o && !o.disabled) {
        var txt = q.type === "ox" ? (o.dataset.o === "0" ? "O" : "X") : q.options[+o.dataset.o];
        var ok = norm(txt) === norm(q.answer);
        cur.ans[i] = { ok: ok, pick: +o.dataset.o };
        save(); showAns(card, q, cur.ans[i]); updScore(); return;
      }
      if (e.target.closest("[data-show]")) { var ta = card.querySelector(".stu-ans"); cur.ans[i] = { ok: false, text: ta.value, self: null }; save(); showAns(card, q, cur.ans[i]); updScore(); return; }
      var sf = e.target.closest("[data-self]");
      if (sf) { cur.ans[i].self = +sf.dataset.self; cur.ans[i].ok = !!cur.ans[i].self; save(); showAns(card, q, cur.ans[i]); updScore(); }
    }
    function updScore() {
      var a = cur.ans, qs = cur.result.questions, done = Object.keys(a).length, ok = Object.keys(a).filter(function (k) { return a[k].ok; }).length;
      var s = el.querySelector(".score"); if (s) s.textContent = done + "/" + qs.length + "문제 풀이 · 정답 " + ok + (done ? " (" + Math.round(ok / done * 100) + "%)" : "");
    }

    route();
  })();
})();
