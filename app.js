(function () {
  "use strict";
  var D = window.WORD_DATA;
  var YEARS3 = [2024, 2025, 2026];
  var CIRC = ["", "①", "②", "③", "④"];

  /* ---------- 저장소 (실패해도 동작) ---------- */
  var KEY = "kpu-word-v1";
  var state = { known: {}, wrong: {}, quiz: { right: 0, total: 0 }, ans: {} };
  try { var saved = JSON.parse(localStorage.getItem(KEY) || "null"); if (saved) Object.assign(state, saved); } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  /* ---------- 공통 유틸 ---------- */
  function $(sel, el) { return (el || document).querySelector(sel); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function say(word) {
    try { var u = new SpeechSynthesisUtterance(word); u.lang = "en-US"; u.rate = 0.9; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) {}
  }
  var canSpeak = typeof window.speechSynthesis !== "undefined";
  var SPK = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';
  // 발음 버튼. 다른 버튼 안에 들어갈 때는 span으로 만든다.
  function spk(word, inline) {
    if (!canSpeak || !word) return "";
    var tag = inline ? "span" : "button";
    return "<" + tag + ' class="spk" data-say="' + esc(word) + '" title="발음 듣기" aria-label="' + esc(word) + ' 발음 듣기"' + (inline ? ' role="button" tabindex="0"' : ' type="button"') + ">" + SPK + "</" + tag + ">";
  }
  document.addEventListener("click", function (e) {
    var sp = e.target.closest && e.target.closest("[data-say]");
    if (sp) { e.preventDefault(); e.stopPropagation(); say(sp.dataset.say); }
  }, true);
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("span[data-say]")) { e.preventDefault(); e.stopPropagation(); say(e.target.dataset.say); }
  }, true);

  /* ---------- 단어 풀 ---------- */
  var E = window.EXAM_DATA || {};
  var EYEARS = Object.keys(E).map(Number).sort();
  var TIERS = ["직접 출제", "반복 학술", "심화", "일반", "기본", "고유명사"];
  var TIER_INFO = {
    "직접 출제": "1~8번 표적어·정답·보기와 17~25번 한 단어 정답",
    "반복 학술": "2개년 이상 나온 학술·중급 어휘 (일상 기본어 제외)",
    "심화": "1개년만 나왔지만 일상에서 드문 고난도 어휘",
    "일반": "1개년만 나온 중급 어휘",
    "기본": "일상에서 아주 흔한 단어와 문제 지시문 단어",
    "고유명사": "인명·지명·상표 등"
  };
  var pools = {};
  function add(pool, w, m, src, syn) {
    if (!w || !m) return;
    var k = w.toLowerCase();
    pool._idx = pool._idx || {};
    if (pool._idx[k]) return;
    pool._idx[k] = 1;
    pool.push({ k: k, w: w, m: m, src: src, s: syn || "" });
  }
  function isProper(m) { return /^\((인명|지명|고유명사|인명\/지명|지명\/인명)\)/.test(m); }
  function yearsText(a) {
    return [2022, 2023, 2024, 2025, 2026].map(function (y, i) { return a.c[i] ? y + "년 " + a.c[i] + "회" : ""; }).filter(Boolean).join(" · ");
  }
  var TIER_KEY = { "직접 출제": "direct", "반복 학술": "academic", "심화": "advanced", "일반": "general", "기본": "basic" };
  ["direct", "academic", "advanced", "general", "basic", "core", "opts", "every", "all"].forEach(function (k) { pools[k] = []; });
  D.all.forEach(function (a) {
    if (a.t === "고유명사") return;
    var src = a.t + (a.tg ? "(" + a.tg + ")" : "") + " · " + a.y + "개년 " + a.n + "회";
    add(pools[TIER_KEY[a.t]], a.w, a.m, src, a.s);
    if (a.t !== "기본") add(pools.every, a.w, a.m, src, a.s);
  });
  D.core.forEach(function (c) {
    add(pools.core, c.tw, c.m, c.yr + "년 " + c.q + "번 " + (c.t === "동의어" ? "표적어" : "정답"), c.s);
    c.o.forEach(function (o) { add(pools.opts, o.w, o.m, c.yr + "년 " + c.q + "번 보기", o.s); });
  });
  ["core", "opts", "every", "basic"].forEach(function (k) { pools[k].forEach(function (x) { add(pools.all, x.w, x.m, x.src, x.s); }); });
  var POOL_NAMES = {
    direct: "직접 출제 어휘", academic: "반복 학술 어휘", advanced: "심화 어휘", general: "일반 어휘",
    core: "1~8번 표적어·정답 40", opts: "1~8번 보기 단어", every: "기본어·고유명사 제외 전체", basic: "기본 어휘",
    wrong: "오답노트", unknown: "아직 모르는 단어"
  };
  function getPool(key) {
    if (key === "wrong") return pools.all.filter(function (x) { return state.wrong[x.k]; });
    if (key === "unknown") return pools.every.filter(function (x) { return !state.known[x.k]; });
    return pools[key] || [];
  }
  function poolSelect(id, cur) {
    return '<select id="' + id + '">' + Object.keys(POOL_NAMES).map(function (k) {
      return '<option value="' + k + '"' + (k === cur ? " selected" : "") + ">" + POOL_NAMES[k] + " · " + getPool(k).length + "</option>";
    }).join("") + "</select>";
  }
  function markWrong(k) { state.wrong[k] = (state.wrong[k] || 0) + 1; save(); }

  /* ---------- 기출 원문 ---------- */
  state.ans = state.ans || {};
  var TARGET = {}, CORE = {};
  D.core.forEach(function (c) { CORE[c.yr + "-" + c.q] = c; if (c.t === "동의어") TARGET[c.yr + "-" + c.q] = c.tw; });
  var CTX = {};
  D.ctx.forEach(function (c) { CTX[c.yr + "-" + c.q] = c; });
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function qType(n) { return n <= 5 ? "동의어" : n <= 8 ? "어휘 빈칸" : n <= 14 ? "문법 빈칸" : n <= 16 ? "문법 오류" : n <= 25 ? "문맥·논리 빈칸" : "독해"; }
  function fmt(t, key) {
    var h = esc(t);
    var tw = TARGET[key];
    if (tw) h = h.replace(new RegExp("\\b(" + escRe(esc(tw)) + ")", "i"), '<u class="tgt">$1</u>');
    h = h.replace(/_{3,}/g, '<span class="blank" aria-label="빈칸"></span>');
    h = h.replace(/[①②③④]/g, function (m) { return '<b class="mk">' + m + "</b>"; });
    return h;
  }
  // 문항 카드. extra(y, q)는 정답 확인 뒤 해설 아래에 붙일 HTML을 돌려준다.
  function qCard(y, q, opt) {
    opt = opt || {};
    var key = y + "-" + q.q, chosen = state.ans[key], solved = chosen != null || opt.reveal;
    var psg = opt.passage && q.psg != null ? '<div class="psg">' + fmt(E[y].passages[q.psg], key) + "</div>" : "";
    var html = '<div class="qcard" data-key="' + key + '">' + psg +
      '<div class="row qhead"><b class="num">' + (opt.showYear ? y + " · " : "") + q.q + '번</b><span class="tag">' + qType(q.q) + "</span>" +
      (q.pts !== 2.5 ? '<span class="tag plain">' + q.pts + "점</span>" : "") + "</div>" +
      '<div class="stem">' + fmt(q.stem, key) + "</div>" +
      '<div class="opts">' + q.opts.map(function (o, i) {
        var no = i + 1, cls = "";
        if (solved && no === q.a) cls = " correct";
        else if (chosen === no) cls = " wrong";
        var speak = o && o.length < 45 && /[a-z]/i.test(o) && !/^\(?[A-D]\)?/.test(o) ? spk(o, true) : "";
        return '<button class="opt' + cls + '" data-no="' + no + '"' + (solved ? " disabled" : "") + '><span class="bubble">' + CIRC[no] + '</span><span class="otext">' + esc(o) + speak + "</span></button>";
      }).join("") + "</div>";
    if (solved) {
      html += '<div class="explain"><p><b>정답 ' + CIRC[q.a] + "</b>" + (chosen != null ? (chosen === q.a ? ' · <span class="ok">맞았습니다</span>' : ' · <span class="ng">고른 답 ' + CIRC[chosen] + "</span>") : "") + "</p>" +
        (q.ex ? '<p class="ex">' + esc(q.ex) + "</p>" : "") + (opt.extra ? opt.extra(y, q.q) : "") + "</div>";
    }
    return html + "</div>";
  }
  // 문항 클릭 처리: 답을 기록하고 그 카드만 다시 그린다.
  function bindQ(container, opt, after) {
    container.addEventListener("click", function (e) {
      var b = e.target.closest(".qcard .opt"); if (!b || b.disabled) return;
      var card = b.closest(".qcard"), key = card.dataset.key, p = key.split("-"), y = +p[0], n = +p[1];
      var q = E[y].questions[n - 1], no = +b.dataset.no;
      state.ans[key] = no;
      if (no !== q.a && CORE[key]) { markWrong(CORE[key].tw.toLowerCase()); var a = CORE[key].o.filter(function (o) { return o.ok; })[0]; if (a) markWrong(a.w.toLowerCase()); }
      save();
      var tmp = document.createElement("div");
      tmp.innerHTML = qCard(y, q, Object.assign({}, opt, { passage: card.querySelector(".psg") != null, reveal: false }));
      card.replaceWith(tmp.firstChild);
      if (after) after();
    });
  }
  function score(y, from, to) {
    var r = { done: 0, ok: 0, pts: 0, total: 0, n: 0 };
    (E[y] ? E[y].questions : []).forEach(function (q) {
      if (q.q < from || q.q > to) return;
      r.n++; r.total += q.pts;
      var c = state.ans[y + "-" + q.q];
      if (c != null) { r.done++; if (c === q.a) { r.ok++; r.pts += q.pts; } }
    });
    return r;
  }
  function coreExtra(y, n) {
    var c = CORE[y + "-" + n]; if (!c) return "";
    return '<div class="optinfo">' + c.o.map(function (o) {
      return "<div><b>" + CIRC[o.no] + " " + esc(o.w) + "</b>" + spk(o.w) + " " + esc(o.m) + (o.s ? '<br><span class="osyn">동의어 ' + esc(o.s) + "</span>" : "") + "</div>";
    }).join("") + (c.s ? '<p class="syn"><b>동의어</b> ' + esc(c.tw) + " → " + esc(c.s) + "</p>" : "") +
    (c.re ? '<p style="color:var(--omr);font-size:.88rem">재출제: ' + esc(c.re) + "</p>" : "") + "</div>";
  }
  function ctxExtra(y, n) {
    var c = CTX[y + "-" + n]; if (!c) return "";
    return '<p class="tipline"><b>판단 근거</b> ' + esc(c.why) + " · <b>풀이 기술</b> " + esc(c.tip) + "</p>";
  }
  // 단어의 기출 예문 찾기
  function examples(a, max) {
    var forms = (a.f || a.w).split(", ").filter(Boolean).sort(function (x, y) { return y.length - x.length; });
    var re = new RegExp("\\b(" + forms.map(escRe).join("|") + ")(?:['’]s)?\\b", "i");
    var out = [];
    EYEARS.slice().reverse().forEach(function (y) {
      if (out.length >= max) return;
      var ex = E[y];
      var units = ex.passages.map(function (p, i) {
        var qs = ex.questions.filter(function (q) { return q.psg === i; });
        return { t: p, q: qs.length ? qs[0].q + (qs.length > 1 ? "~" + qs[qs.length - 1].q : "") : "" };
      }).concat(ex.questions.map(function (q) { return { t: q.stem + " " + (q.inline ? "" : q.opts.join(" / ")), q: q.q }; }));
      units.forEach(function (u) {
        if (out.length >= max) return;
        var sents = u.t.split(/(?<=[.!?”"])\s+(?=[A-Z(“"])/);
        for (var i = 0; i < sents.length && out.length < max; i++) {
          if (re.test(sents[i])) { out.push({ y: y, q: u.q, h: esc(sents[i]).replace(new RegExp("\\b(" + forms.map(function (f) { return escRe(esc(f)); }).join("|") + ")", "ig"), "<mark>$1</mark>").replace(/_{3,}/g, "____") }); break; }
        }
      });
    });
    return out;
  }

  /* ---------- 라우팅 ---------- */
  var views = {};
  var main = $("#app");
  function route() {
    var name = (location.hash || "#home").slice(1);
    if (!views[name]) name = "home";
    document.querySelectorAll("nav.tabs a").forEach(function (a) { a.classList.toggle("on", a.getAttribute("href") === "#" + name); });
    main.innerHTML = "";
    var sec = document.createElement("section");
    sec.className = "view";
    main.appendChild(sec);
    views[name](sec);
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);
  // 고정 헤더 높이를 CSS 변수로 알려 준다(아래 도구 막대가 헤더 밑에 붙도록).
  function setHdr() { var h = document.querySelector("header.top"); if (h) document.documentElement.style.setProperty("--hdr", h.offsetHeight + "px"); }
  setHdr(); window.addEventListener("resize", setHdr);

  /* ---------- 홈 ---------- */
  views.home = function (el) {
    var total = pools.every.length;
    var known = pools.every.filter(function (x) { return state.known[x.k]; }).length;
    var wrongN = Object.keys(state.wrong).length;
    var done = 0, ok = 0;
    EYEARS.forEach(function (y) { var s = score(y, 1, 40); done += s.done; ok += s.ok; });
    var pct = total ? Math.round(known / total * 100) : 0;
    var tierCount = TIERS.map(function (t) { return [t, D.all.filter(function (a) { return a.t === t; }).length]; });
    el.innerHTML =
      '<div><div class="eyebrow">한국공학대학교 편입영어 · 2022–2026 기출</div><h2>기출 단어로 공부하기</h2></div>' +
      '<p class="lead">5개년 시험지 200문항의 원문에서 뽑은 단어 ' + D.all.length.toLocaleString() + '개를 5개년 기준 등급으로 나눴습니다. 직접 출제 어휘와 반복 학술 어휘부터 외우고, 실전 기출로 원문 그대로 풀어 보세요.</p>' +
      '<a class="panel todaycta" href="#today"><div><b>오늘의 루틴' + (plan() && plan().dd >= 0 ? ' <span class="tag num">D-' + plan().dd + "</span>" : "") + '</b><small>복습 ' + dueList().length + '개 · 새 단어 ' + newLeftCapped() + '개 남음 · 연속 ' + streak() + '일</small></div><span class="btn primary">시작 →</span></a>' +
      '<div class="stats">' +
        '<div class="stat"><small>외운 단어 (기본어 제외)</small><b>' + known + '<small> / ' + total + '</small></b><div class="bar"><i style="width:' + pct + '%"></i></div></div>' +
        '<div class="stat"><small>실전 기출</small><b>' + ok + '<small> / ' + done + ' 정답</small></b><small>5개년 200문항 중 ' + done + "문항 풀이</small></div>" +
        '<div class="stat"><small>오답노트</small><b>' + wrongN + '</b><small>틀린 단어</small></div>' +
        '<div class="stat"><small>퀴즈 누적</small><b>' + state.quiz.right + '<small> / ' + state.quiz.total + '</small></b><small>정답 / 문제</small></div>' +
      "</div>" +
      '<div class="panel"><h3>5개년 단어 등급</h3><div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>등급</th><th class="num">단어 수</th><th>기준</th></tr></thead><tbody>' +
        tierCount.map(function (r) { return '<tr><td><a href="#words" data-tier="' + r[0] + '">' + r[0] + '</a></td><td class="num">' + r[1] + "</td><td>" + TIER_INFO[r[0]] + "</td></tr>"; }).join("") +
      '</tbody></table></div><p class="lead" style="font-size:.82rem;margin-top:8px">일상 빈도는 영어 말뭉치 빈도(wordfreq)로 판단했습니다. 5개년 동안 1~8번 표적·정답 어휘가 그대로 다시 나온 경우는 1번(2024 plead → 2025 pleaded)뿐이라, 보기 단어와 반복 학술 어휘까지 넓게 익히는 것이 좋습니다.</p></div>' +
      '<div class="panel"><h3>추천 학습 순서</h3><ol class="steps" style="margin-top:10px">' +
        '<li><a href="#words">단어장</a>에서 직접 출제 → 반복 학술 → 심화 순으로 뜻 가리고 외우기</li>' +
        '<li><a href="#cards">카드</a>로 넘기며 아는 단어 체크, 모르는 단어만 반복</li>' +
        '<li><a href="#exam">기출 1~8번</a>을 원문 문장으로 풀고 보기 단어의 뜻·동의어까지 확인</li>' +
        '<li><a href="#context">문맥 빈칸</a>(17~25번)으로 연결어·논리 단서 연습</li>' +
        '<li><a href="#real">실전 기출</a>로 연도별 40문항을 시험처럼 풀기</li>' +
      "</ol></div>" +
      '<div class="panel"><h3>시험 구성 (40문항 / 60분)</h3><div class="table-wrap" style="margin-top:8px"><table>' +
        '<thead><tr><th>문항</th><th>유형</th><th class="num">문항 수</th><th>비중</th></tr></thead><tbody>' +
        [["1~5", "동의어", 5, "12.5%"], ["6~8", "어휘 빈칸", 3, "7.5%"], ["9~14", "문법 빈칸", 6, "15%"], ["15~16", "문법 오류", 2, "5%"], ["17~25", "문맥·논리 빈칸", 9, "22.5%"], ["26~40", "장문 독해", 15, "37.5%"]].map(function (r) {
          return "<tr><td class=num>" + r[0] + "</td><td>" + r[1] + "</td><td class=num>" + r[2] + "</td><td class=num>" + r[3] + "</td></tr>";
        }).join("") +
      "</tbody></table></div>" +
      '<p class="lead" style="margin-top:10px;font-size:.88rem">권장 시간: 1~8번 6분 · 9~16번 9분 · 17~25번 15분 · 26~40번 26분 · 검토 4분. 오답 감점이 없으니 모든 문항에 답하세요. 학습 기록은 이 브라우저에만 저장됩니다.</p></div>';
    el.addEventListener("click", function (e) { var a = e.target.closest("[data-tier]"); if (a) wordTier = a.dataset.tier; });
  };

  /* ---------- 단어장 ---------- */
  var wordTier = "직접 출제";
  views.words = function (el) {
    var q = "", hide = false, limit = 60, year = 0, sort = "tier";
    el.innerHTML =
      '<div><div class="eyebrow">단어장</div><h2>5개년 기출 단어 ' + D.all.length.toLocaleString() + "개</h2></div>" +
      '<p class="lead">2022~2026학년도 시험지 원문(지문·문제·보기)에 나온 단어를 표제어 단위로 묶었습니다. 같은 단어의 활용형(복수·시제·분사)만 묶고, important / importance처럼 다른 단어는 나눴습니다. \'뜻 보충\'은 엑셀에 뜻이 없어 새로 단 뜻입니다.</p>' +
      '<div class="row" id="wf"></div><p class="lead" id="wti" style="font-size:.85rem"></p><div class="row" id="wy"></div>' +
      '<div class="wtools"><input type="search" id="wq" placeholder="영단어, 뜻, 동의어로 검색"><select id="ws" aria-label="정렬"><option value="tier">등급순</option><option value="freq">출현 많은 순</option><option value="abc">알파벳순</option></select>' +
      '<button class="btn" id="wh" aria-pressed="false">뜻 가리기</button><span class="counter" id="wc"></span></div>' +
      '<div class="wlist" id="wl"></div>';
    var chips = ["전체"].concat(TIERS).concat(["안 외운 단어"]);
    function drawChips() {
      $("#wf", el).innerHTML = chips.map(function (c) {
        var n = c === "전체" ? D.all.length : c === "안 외운 단어" ? D.all.filter(function (a) { return a.t !== "고유명사" && a.t !== "기본" && !state.known[a.w.toLowerCase()]; }).length : D.all.filter(function (a) { return a.t === c; }).length;
        return '<button class="chip' + (c === wordTier ? " on" : "") + '" data-f="' + c + '">' + c + ' <span class="num">' + n + "</span></button>";
      }).join("");
      $("#wti", el).textContent = TIER_INFO[wordTier] || (wordTier === "안 외운 단어" ? "기본어·고유명사를 뺀 단어 중 별표를 누르지 않은 단어" : "");
    }
    $("#wy", el).innerHTML = [0].concat(EYEARS).map(function (y) { return '<button class="chip' + (y === year ? " on" : "") + '" data-y="' + y + '">' + (y ? y + "학년도" : "모든 연도") + "</button>"; }).join("");
    $("#wf", el).onclick = function (e) { var b = e.target.closest("[data-f]"); if (!b) return; wordTier = b.dataset.f; limit = 60; drawChips(); draw(); };
    $("#wy", el).onclick = function (e) {
      var b = e.target.closest("[data-y]"); if (!b) return;
      year = +b.dataset.y; limit = 60;
      el.querySelectorAll("#wy .chip").forEach(function (c) { c.classList.toggle("on", c === b); });
      draw();
    };
    $("#wq", el).oninput = function () { q = this.value.trim().toLowerCase(); limit = 60; draw(); };
    $("#ws", el).onchange = function () { sort = this.value; draw(); };
    $("#wh", el).onclick = function () {
      hide = !hide; this.textContent = hide ? "뜻 보이기" : "뜻 가리기";
      this.setAttribute("aria-pressed", hide); this.classList.toggle("primary", hide);
      $("#wl", el).classList.toggle("hide-m", hide);
    };
    function list() {
      var r = D.all.filter(function (v) {
        if (wordTier === "안 외운 단어") { if (v.t === "고유명사" || v.t === "기본" || state.known[v.w.toLowerCase()]) return false; }
        else if (wordTier !== "전체" && v.t !== wordTier) return false;
        if (year && !v.c[year - 2022]) return false;
        return !q || v.w.toLowerCase().indexOf(q) >= 0 || v.m.indexOf(q) >= 0 || v.f.indexOf(q) >= 0 || (v.s && v.s.toLowerCase().indexOf(q) >= 0);
      });
      if (sort === "freq") r = r.slice().sort(function (a, b) { return b.n - a.n || b.y - a.y; });
      if (sort === "abc") r = r.slice().sort(function (a, b) { return a.w < b.w ? -1 : 1; });
      return r;
    }
    function item(v) {
      var k = v.w.toLowerCase();
      var forms = v.fc && v.fc !== k + "(" + v.n + ")" ? " · 어형: " + esc(v.fc) : "";
      return '<div class="witem"><button class="star' + (state.known[k] ? " on" : "") + '" data-k="' + esc(k) + '" aria-label="외운 단어 표시">★</button>' +
        '<div style="min-width:0"><div class="row" style="gap:8px"><span class="w">' + esc(v.w) + "</span>" + spk(v.w) + "</div>" +
        '<div class="m">' + esc(v.m) + "</div>" + (v.s ? '<div class="syn"><b>동의어</b> ' + esc(v.s) + "</div>" : "") +
        '<div class="meta">' + esc(yearsText(v)) + forms + (v.x ? ' · <span style="color:var(--omr)">뜻 보충</span>' : "") + "</div>" +
        '<details class="meta exd" data-w="' + esc(k) + '"><summary>기출 예문 · 문항 번호</summary><div class="exbox"></div></details></div>' +
        '<div class="side"><span class="tag' + (v.t === "직접 출제" ? "" : " plain") + '">' + esc(v.t) + "</span>" + (v.tg ? ' <span class="tag plain">' + esc(v.tg) + "</span>" : "") + ' <span class="meta num">' + v.y + "개년 " + v.n + "회</span></div></div>";
    }
    function draw() {
      var l = list();
      $("#wc", el).textContent = l.length.toLocaleString() + "개";
      var html = l.slice(0, limit).map(item).join("");
      if (!l.length) html = '<div class="empty">조건에 맞는 단어가 없습니다.</div>';
      $("#wl", el).innerHTML = html + (l.length > limit ? '<button class="btn more" id="wm" style="margin:12px">더 보기 (' + (l.length - limit).toLocaleString() + "개 남음)</button>" : "");
      var mb = $("#wm", el); if (mb) mb.onclick = function () { limit += 150; draw(); };
    }
    $("#wl", el).addEventListener("toggle", function (e) {
      var d = e.target; if (!d.classList || !d.classList.contains("exd") || !d.open) return;
      var box = d.querySelector(".exbox"); if (box.dataset.done) return;
      var a = BYW[d.dataset.w], ex = examples(a, 3);
      box.innerHTML = (ex.length ? ex.map(function (x) { return '<p class="exs"><span class="tag plain num">' + x.y + " · " + x.q + "번</span> " + x.h + "</p>"; }).join("") : "<p>예문을 찾지 못했습니다.</p>") +
        '<p class="num">문항 번호 ' + esc(a.q) + "</p>";
      box.dataset.done = 1;
    }, true);
    $("#wl", el).onclick = function (e) {
      var s = e.target.closest(".star");
      if (s) { var k = s.dataset.k; if (state.known[k]) delete state.known[k]; else state.known[k] = 1; save(); s.classList.toggle("on"); return; }
      var m = e.target.closest(".m"); if (m) m.classList.toggle("peek");
    };
    drawChips(); draw();
  };

  /* ---------- 카드 ---------- */
  var cardPool = "direct";
  views.cards = function (el) {
    var deck = [], i = 0, flipped = false, front = "en";
    el.innerHTML =
      '<div><div class="eyebrow">플래시카드</div><h2>넘기며 외우기</h2></div>' +
      '<div class="row">' + poolSelect("cp", cardPool) +
      '<select id="cf"><option value="en">영어 → 뜻</option><option value="ko">뜻 → 영어</option></select>' +
      '<button class="btn" id="cs">섞기</button></div>' +
      '<div class="card-stage"><div class="counter" id="cn"></div><div class="flash" id="fc" tabindex="0" role="button" aria-label="카드 뒤집기"></div>' +
      '<div class="row" style="justify-content:center"><button class="btn" id="csay">' + SPK + ' 발음</button><button class="btn bad" id="cno">몰라요</button><button class="btn good" id="cyes">알아요</button></div>' +
      '<div class="row" style="justify-content:center"><button class="btn" id="cprev">← 이전</button><button class="btn" id="cnext">다음 →</button></div>' +
      '<p class="lead" style="font-size:.8rem;text-align:center">키보드: Space 뒤집기 · ← → 이동 · 1 몰라요 · 2 알아요</p></div>';
    function load(shuf) {
      deck = getPool(cardPool); if (shuf) deck = shuffle(deck); i = 0; flipped = false; draw();
    }
    function draw() {
      var fc = $("#fc", el);
      if (!deck.length) { fc.innerHTML = '<div class="empty">이 묶음에 단어가 없습니다.' + (cardPool === "wrong" ? "<br>퀴즈나 카드에서 틀린 단어가 여기에 모입니다." : "") + "</div>"; $("#cn", el).textContent = ""; return; }
      var c = deck[i], showEn = (front === "en") !== flipped;
      fc.innerHTML = (showEn ? '<div class="fw">' + esc(c.w) + "</div>" : '<div class="fm">' + esc(c.m) + "</div>") +
        (flipped && c.s ? '<div class="syn"><b>동의어</b> ' + esc(c.s) + "</div>" : "") +
        (flipped ? '<div class="fx">' + esc(c.src) + "</div>" : "") +
        '<div class="hint">' + (flipped ? "" : "눌러서 뒤집기") + (state.known[c.k] ? " · 외운 단어" : "") + "</div>";
      $("#cn", el).textContent = (i + 1) + " / " + deck.length;
      if (flipped && showEn && canSpeak) say(c.w);
    }
    function move(d) { if (!deck.length) return; i = (i + d + deck.length) % deck.length; flipped = false; draw(); }
    function mark(ok) {
      if (!deck.length) return;
      var c = deck[i];
      if (ok) { state.known[c.k] = 1; if (state.wrong[c.k]) delete state.wrong[c.k]; }
      else { delete state.known[c.k]; markWrong(c.k); }
      save(); move(1);
    }
    $("#cp", el).onchange = function () { cardPool = this.value; load(true); };
    $("#cf", el).onchange = function () { front = this.value; flipped = false; draw(); };
    $("#cs", el).onclick = function () { load(true); };
    $("#fc", el).onclick = function () { flipped = !flipped; draw(); };
    $("#cprev", el).onclick = function () { move(-1); };
    $("#cnext", el).onclick = function () { move(1); };
    $("#cyes", el).onclick = function () { mark(true); };
    $("#csay", el).onclick = function () { if (deck.length) say(deck[i].w); };
    $("#csay", el).hidden = !canSpeak;
    $("#cno", el).onclick = function () { mark(false); };
    el._key = function (e) {
      if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); flipped = !flipped; draw(); }
      else if (e.key === "ArrowRight") move(1);
      else if (e.key === "ArrowLeft") move(-1);
      else if (e.key === "1") mark(false);
      else if (e.key === "2") mark(true);
    };
    load(false);
  };
  document.addEventListener("keydown", function (e) { var v = $("section.view"); if (v && v._key) v._key(e); });

  /* ---------- 퀴즈 ---------- */
  var quizPool = "direct";
  views.quiz = function (el) {
    var mode = "en", queue = [], cur = null, n = 0, right = 0;
    el.innerHTML =
      '<div><div class="eyebrow">4지선다 퀴즈</div><h2>뜻·동의어 고르기</h2></div>' +
      '<div class="row">' + poolSelect("qp", quizPool) +
      '<select id="qm"><option value="en">영어 보고 뜻 고르기</option><option value="ko">뜻 보고 영어 고르기</option><option value="syn">동의어 고르기 (1~5번 유형)</option></select>' +
      '<button class="btn" id="qr">다시 시작</button></div>' +
      '<div class="panel" id="qb"></div>';
    function synList(x) { return (x.s || "").split(",").map(function (t) { return t.trim(); }).filter(Boolean); }
    function start() {
      queue = shuffle(getPool(quizPool));
      if (mode === "syn") queue = queue.filter(function (x) { return synList(x).length; });
      n = 0; right = 0; next();
    }
    function next() {
      var box = $("#qb", el);
      if (!queue.length) {
        box.innerHTML = n ? '<div class="empty"><h3>끝!</h3><p>' + n + "문제 중 " + right + '개 정답</p><button class="btn primary" id="qa">다시 풀기</button></div>'
          : '<div class="empty">이 묶음에 단어가 없습니다.</div>';
        var a = $("#qa", el); if (a) a.onclick = start;
        return;
      }
      cur = queue.shift();
      var choices;
      if (mode === "syn") {
        var mine = synList(cur), lower = mine.map(function (t) { return t.toLowerCase(); }).concat([cur.k]);
        var used = {};
        var others = shuffle(pools.all.filter(function (x) { return x.k !== cur.k && synList(x).length; })).filter(function (x) {
          var t = shuffle(synList(x))[0];
          if (lower.indexOf(t.toLowerCase()) >= 0 || lower.indexOf(x.k) >= 0 || used[t.toLowerCase()]) return false;
          used[t.toLowerCase()] = 1; x._pick = t; return true;
        }).slice(0, 3);
        choices = shuffle([{ k: cur.k, label: shuffle(mine)[0], sub: "= " + cur.w + " (" + cur.m + ")" }].concat(others.map(function (x) {
          return { k: x.k, label: x._pick, sub: "= " + x.w + " (" + x.m + ")" };
        })));
      } else {
        choices = shuffle([cur].concat(shuffle(pools.all.filter(function (x) { return x.k !== cur.k && x.m !== cur.m; })).slice(0, 3))).map(function (c) {
          return mode === "en" ? { k: c.k, label: c.m, sub: c.w } : { k: c.k, label: c.w, sub: c.m, word: 1 };
        });
      }
      box.innerHTML = '<div class="row" style="justify-content:space-between"><span class="score">' + (n + 1) + "번째 · 정답 " + right + '</span><span class="tag plain">' + esc(cur.src) + "</span></div>" +
        (mode === "syn" ? '<small style="color:var(--muted)">다음 단어와 뜻이 가장 가까운 것은?</small>' : "") +
        '<div style="margin:16px 0" class="row ' + (mode === "ko" ? "fm" : "q-target") + '">' + esc(mode === "ko" ? cur.m : cur.w) + (mode === "ko" ? "" : spk(cur.w)) + "</div>" +
        '<div class="opts">' + choices.map(function (c, idx) {
          return '<button class="opt" data-k="' + esc(c.k) + '"><span class="bubble">' + (idx + 1) + '</span><span><span class="' + (mode === "en" ? "" : "ow") + '">' + esc(c.label) + "</span>" + (mode === "en" ? "" : spk(c.label, true)) + '<br><span class="om reveal-m" hidden>' + esc(c.sub) + "</span></span>" + (mode === "en" ? '<span class="reveal-m" hidden>' + spk(c.sub, true) + "</span>" : "") + "</button>";
        }).join("") + "</div>" +
        '<div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn primary" id="qn" hidden>다음 →</button></div>';
      box.querySelectorAll(".opt").forEach(function (b) { b.onclick = function () { answer(b); }; });
      $("#qn", el).onclick = next;
      if (mode !== "ko" && canSpeak) say(cur.w);
    }
    function answer(b) {
      var box = $("#qb", el); if (!$("#qn", el).hidden) return;
      var ok = b.dataset.k === cur.k;
      box.querySelectorAll(".opt").forEach(function (o) {
        o.disabled = true; o.querySelector(".reveal-m").hidden = false;
        if (o.dataset.k === cur.k) o.classList.add("correct");
      });
      if (!ok) { b.classList.add("wrong"); markWrong(cur.k); } else { right++; }
      if (cur.s && !box.querySelector(".qsyn")) box.querySelector(".opts").insertAdjacentHTML("afterend", '<div class="syn qsyn" style="margin-top:12px"><b>동의어</b> ' + esc(cur.s) + "</div>");
      n++; state.quiz.total++; if (ok) state.quiz.right++; save();
      $("#qn", el).hidden = false; $("#qn", el).focus();
    }
    $("#qp", el).onchange = function () { quizPool = this.value; start(); };
    $("#qm", el).onchange = function () { mode = this.value; start(); };
    $("#qr", el).onclick = start;
    el._key = function (e) {
      if (e.target.tagName === "SELECT") return;
      var k = parseInt(e.key, 10);
      var opts = el.querySelectorAll(".opt");
      if (k >= 1 && k <= 4 && opts[k - 1] && !opts[k - 1].disabled) answer(opts[k - 1]);
      else if (e.key === "Enter" && !$("#qn", el).hidden && document.activeElement !== $("#qn", el)) next();
    };
    start();
  };

  /* ---------- 기출 1~8번 ---------- */
  var examYear = 2026;
  function yearChips(id, cur) {
    return '<div class="row" id="' + id + '">' + EYEARS.map(function (y) { return '<button class="chip' + (y === cur ? " on" : "") + '" data-y="' + y + '">' + y + "학년도</button>"; }).join("") + "</div>";
  }
  function resetRow(id) {
    return '<span id="' + id + '"><button class="chip" data-act="ask">다시 풀기</button><span hidden data-confirm> <button class="btn bad" data-act="yes">기록 지우기</button> <button class="btn" data-act="no">취소</button></span></span>';
  }
  function bindReset(el, id, clear) {
    $("#" + id, el).onclick = function (e) {
      var b = e.target.closest("[data-act]"); if (!b) return;
      var c = this.querySelector("[data-confirm]");
      if (b.dataset.act === "ask") c.hidden = false;
      else if (b.dataset.act === "no") c.hidden = true;
      else clear();
    };
  }
  views.exam = function (el) {
    el.innerHTML =
      '<div><div class="eyebrow">기출 재현 · 1~8번</div><h2>원문 문장으로 어휘 문제 풀기</h2></div>' +
      '<p class="lead">시험지 원문 그대로입니다. 1~5번은 밑줄 친 표현과 뜻이 가장 가까운 보기, 6~8번은 빈칸에 알맞은 보기를 고르세요. 답을 고른 뒤에만 공식 해설과 네 보기의 뜻·동의어가 나옵니다.</p>' +
      yearChips("ey", examYear) + '<div class="row"><span class="score" id="es"></span>' + resetRow("er") + '</div><div class="qgrid" id="eg"></div>';
    function upd() { var s = score(examYear, 1, 8); $("#es", el).textContent = examYear + "학년도 " + s.done + "/8문항 풀이 · " + s.ok + "개 정답"; }
    function draw() {
      $("#eg", el).innerHTML = E[examYear].questions.slice(0, 8).map(function (q) { return qCard(examYear, q, { extra: coreExtra }); }).join("");
      upd();
    }
    $("#ey", el).onclick = function (e) {
      var b = e.target.closest("[data-y]"); if (!b) return;
      examYear = +b.dataset.y; el.querySelectorAll("#ey .chip").forEach(function (c) { c.classList.toggle("on", c === b); }); draw();
    };
    bindReset(el, "er", function () { for (var n = 1; n <= 8; n++) delete state.ans[examYear + "-" + n]; save(); draw(); $("#er [data-confirm]", el).hidden = true; });
    bindQ($("#eg", el), { extra: coreExtra }, upd);
    draw();
  };

  /* ---------- 문맥 빈칸 17~25 ---------- */
  var ctxYear = 2026;
  views.context = function (el) {
    var reveal = false;
    el.innerHTML =
      '<div><div class="eyebrow">17~25번 · 문맥·논리 빈칸</div><h2>지문 속 빈칸 채우기</h2></div>' +
      '<p class="lead">시험지 원문 지문입니다. 빈칸 앞뒤의 연결어와 논리를 보고 답을 고르면 공식 해설이 나옵니다.</p>' +
      yearChips("xy", ctxYear) + '<div class="row"><span class="score" id="xs"></span><button class="btn" id="xa">정답 모두 보기</button>' + resetRow("xr") + '</div><div class="qgrid wide" id="xg"></div>';
    function upd() { var s = score(ctxYear, 17, 25); $("#xs", el).textContent = ctxYear + "학년도 " + s.done + "/9문항 풀이 · " + s.ok + "개 정답"; }
    function draw() {
      $("#xg", el).innerHTML = E[ctxYear].questions.slice(16, 25).map(function (q) { return qCard(ctxYear, q, { extra: ctxExtra, reveal: reveal }); }).join("");
      $("#xa", el).textContent = reveal ? "정답 모두 가리기" : "정답 모두 보기";
      upd();
    }
    $("#xy", el).onclick = function (e) {
      var b = e.target.closest("[data-y]"); if (!b) return;
      ctxYear = +b.dataset.y; el.querySelectorAll("#xy .chip").forEach(function (c) { c.classList.toggle("on", c === b); }); draw();
    };
    $("#xa", el).onclick = function () { reveal = !reveal; draw(); };
    bindReset(el, "xr", function () { for (var n = 17; n <= 25; n++) delete state.ans[ctxYear + "-" + n]; save(); draw(); $("#xr [data-confirm]", el).hidden = true; });
    bindQ($("#xg", el), { extra: ctxExtra }, upd);
    draw();
  };

  /* ---------- 실전 기출 ---------- */
  var realYear = 2026;
  views.real = function (el) {
    el.innerHTML =
      '<div><div class="eyebrow">실전 기출 · 40문항 / 60분</div><h2>연도별 시험지 그대로 풀기</h2></div>' +
      '<p class="lead">문제지 원문과 지문을 그대로 실었습니다. 답을 고르기 전에는 정답과 해설이 보이지 않고, 고른 뒤에 공식 해설이 나옵니다. 배점은 시험지 표기를 따랐습니다(표기가 없으면 2.5점).</p>' +
      yearChips("ry", realYear) +
      '<div class="scorebar" id="rs"></div>' +
      '<div class="row"><select id="rjump" aria-label="문항 이동"></select>' + resetRow("rr") + "</div>" +
      '<div id="rb"></div>';
    function upd() {
      var s = score(realYear, 1, 40);
      $("#rs", el).innerHTML = '<span><b class="num">' + s.done + "</b>/40 풀이</span><span><b class=\"num\">" + s.ok + "</b> 정답</span><span><b class=\"num\">" + s.pts + "</b>/" + s.total + " 점</span>" +
        '<div class="bar"><i style="width:' + (s.done / 40 * 100) + '%"></i></div>';
    }
    function draw() {
      var ex = E[realYear], html = "", seenSec = {}, seenPsg = {};
      ex.questions.forEach(function (q) {
        if (q.sec != null && !seenSec[q.sec]) { seenSec[q.sec] = 1; html += '<h3 class="sechead">' + esc(ex.sections[q.sec]) + "</h3>"; }
        var first = q.psg != null && !seenPsg[q.psg];
        if (first) seenPsg[q.psg] = 1;
        html += '<div id="q' + q.q + '">' + qCard(realYear, q, { passage: first }) + "</div>";
      });
      $("#rb", el).innerHTML = html;
      $("#rjump", el).innerHTML = '<option value="">문항으로 이동</option>' + ex.questions.map(function (q) { return '<option value="' + q.q + '">' + q.q + "번 · " + qType(q.q) + "</option>"; }).join("");
      upd();
    }
    $("#ry", el).onclick = function (e) {
      var b = e.target.closest("[data-y]"); if (!b) return;
      realYear = +b.dataset.y; el.querySelectorAll("#ry .chip").forEach(function (c) { c.classList.toggle("on", c === b); }); draw();
    };
    $("#rjump", el).onchange = function () { var t = $("#q" + this.value, el); if (t) t.scrollIntoView({ block: "start" }); this.value = ""; };
    bindReset(el, "rr", function () { for (var n = 1; n <= 40; n++) delete state.ans[realYear + "-" + n]; save(); draw(); $("#rr [data-confirm]", el).hidden = true; });
    bindQ($("#rb", el), {}, upd);
    draw();
  };

  /* ---------- 풀이법 ---------- */
  views.tips = function (el) {
    el.innerHTML =
      '<div><div class="eyebrow">9~16번 · 26~40번</div><h2>문법·독해 풀이법</h2></div>' +
      '<h3>문법 핵심 유형</h3><div class="grid">' + D.grammar.map(function (g) {
        return '<div class="panel" style="display:flex;flex-direction:column;gap:6px"><b>' + esc(g.t) + '</b><span class="tag plain" style="align-self:flex-start">' + esc(g.ex) + '</span><p class="tip-how">' + esc(g.how) + '</p><p class="tip-eg">' + esc(g.eg) + " " + spk(g.eg.replace(/\s*\/\s*/g, ". ")) + "</p></div>";
      }).join("") + "</div>" +
      '<h3>독해 문항별 접근법</h3><div class="grid">' + D.reading.map(function (r) {
        return '<div class="panel" style="display:flex;flex-direction:column;gap:6px"><b>' + esc(r.t) + '</b><span class="tag plain" style="align-self:flex-start">' + esc(r.ex) + '</span><p class="tip-how">' + esc(r.how) + "</p></div>";
      }).join("") + "</div>";
  };

  /* ---------- 오늘 (간격 반복 복습 + 루틴) ---------- */
  // 상자 0~5. 맞힐수록 다음 복습까지 간격이 길어진다(일 단위).
  var GAPS = [1, 1, 3, 7, 14, 30];
  var ROUTINE_TIERS = ["직접 출제", "반복 학술", "심화", "일반"];
  state.srs = state.srs || {};
  state.days = state.days || {};
  state.cfg = Object.assign({ daily: 30, tiers: ["직접 출제", "반복 학술", "심화"], exam: "2027-01-15", scope: 3 }, state.cfg || {});
  var SCOPES = { 2: ["직접 출제", "반복 학술"], 3: ["직접 출제", "반복 학술", "심화"], 4: ["직접 출제", "반복 학술", "심화", "일반"] };
  var REVIEW_DAYS = 14; // 시험 전 이 기간은 새 단어 없이 복습만
  function examDay() { var p = (state.cfg.exam || "").split("-").map(Number); return p.length === 3 && p[0] ? dayNo(new Date(p[0], p[1] - 1, p[2])) : null; }
  function dateOf(n) { var d = new Date(); d.setDate(d.getDate() + (n - dayNo())); return d; }
  function md(n) { var d = dateOf(n); return (d.getMonth() + 1) + "/" + d.getDate(); }
  // 시험일까지 계획: 목표 범위에서 남은 단어, 마감일, 필요한 하루 개수, 지금 속도로 끝나는 날
  function plan() {
    var ex = examDay(); if (ex == null) return null;
    var t = dayNo(), scope = SCOPES[state.cfg.scope] || SCOPES[3];
    var remain = D.all.filter(function (a) { var k = a.w.toLowerCase(); return scope.indexOf(a.t) >= 0 && !state.srs[k] && !state.known[k]; }).length;
    var cutoff = ex - REVIEW_DAYS;
    var todayLeft = newLeft();
    var daysLeft = Math.max(0, cutoff - t + (todayLeft > 0 ? 1 : 0)); // 오늘 몫이 남았으면 오늘 포함
    var need = daysLeft ? Math.ceil(remain / daysLeft) : remain;
    var afterToday = Math.max(0, remain - todayLeft);
    var finish = remain === 0 ? t : (todayLeft >= remain ? t : t + Math.ceil(afterToday / state.cfg.daily));
    return { ex: ex, dd: ex - t, cutoff: cutoff, remain: remain, need: need, finish: finish, ok: finish <= cutoff, past: t > cutoff, scope: scope };
  }
  function dayNo(d) { d = d || new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000); }
  function dayLog(t) { t = t == null ? dayNo() : t; return state.days[t] || (state.days[t] = { rev: 0, nw: 0, quiz: 0, ok: 0, words: [] }); }
  function logWord(k) { var L = dayLog(); if (L.words.indexOf(k) < 0) L.words.push(k); }
  function streak() {
    var t = dayNo(), n = 0;
    function active(d) { var L = state.days[d]; return L && (L.rev + L.nw + L.quiz) > 0; }
    if (!active(t)) t--;
    while (active(t)) { n++; t--; }
    return n;
  }
  function dueList() {
    var t = dayNo();
    return Object.keys(state.srs).filter(function (k) { return state.srs[k].due <= t && BYW[k]; })
      .sort(function (a, b) { return state.srs[a].due - state.srs[b].due || state.srs[a].b - state.srs[b].b; });
  }
  function newList(n) {
    var out = [];
    for (var i = 0; i < D.all.length && out.length < n; i++) {
      var a = D.all[i], k = a.w.toLowerCase();
      if (state.cfg.tiers.indexOf(a.t) < 0 || state.srs[k] || state.known[k]) continue;
      out.push(k);
    }
    return out;
  }
  function newLeft() { return Math.max(0, state.cfg.daily - dayLog().nw); }
  function newLeftCapped() { var p = plan(); return p && p.past ? 0 : newLeft(); }
  // 답 처리: again 0 / hard 1 / good 2
  function grade(k, g, isNew) {
    var t = dayNo(), first = !state.srs[k], s = state.srs[k] || { b: 0, due: t };
    if (g === 0) { s.b = 0; s.due = t + 1; delete state.known[k]; markWrong(k); }
    else if (g === 1) { s.b = Math.max(1, s.b); s.due = t + Math.max(1, Math.ceil(GAPS[s.b] / 2)); }
    else { s.b = Math.min(5, s.b + 1); s.due = t + GAPS[s.b]; if (s.b >= 3) state.known[k] = 1; if (state.wrong[k] && s.b >= 2) delete state.wrong[k]; }
    s.last = t;
    state.srs[k] = s;
    var L = dayLog(); if (isNew) { if (first) L.nw++; } else L.rev++;
    logWord(k);
    save();
  }
  // 퀴즈·기출에서 틀린 단어는 내일 복습으로 넣는다
  var _markWrong = markWrong;
  markWrong = function (k) {
    _markWrong(k);
    if (BYW[k]) { var s = state.srs[k] || { b: 0 }; s.b = 0; s.due = dayNo() + 1; state.srs[k] = s; save(); }
  };
  var BYW = {};
  D.all.forEach(function (a) { BYW[a.w.toLowerCase()] = a; });

  views.today = function (el) {
    var session = null;
    function render() {
      var due = dueList(), L = dayLog(), left = newLeft(), st = streak();
      var P = plan(); if (P && P.past) left = 0;
      var reviewDone = due.length === 0, newDone = left === 0 || newList(1).length === 0;
      var todayWords = L.words.length, quizDone = L.quiz >= Math.min(10, todayWords) && todayWords > 0;
      var t = dayNo(), forecast = [];
      for (var i = 1; i <= 7; i++) forecast.push(Object.keys(state.srs).filter(function (k) { return state.srs[k].due === t + i; }).length);
      var fmax = Math.max.apply(null, forecast.concat([1]));
      var dow = new Date().getDay(), weekend = dow === 0 || dow === 6;
      var inSrs = Object.keys(state.srs).length, mastered = Object.keys(state.srs).filter(function (k) { return state.srs[k].b >= 4; }).length;
      el.innerHTML =
        '<div><div class="eyebrow">' + new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" }) + '</div><h2>오늘의 루틴</h2></div>' +
        dday(P) +
        '<div class="stats">' +
          '<div class="stat"><small>연속 학습</small><b>' + st + '<small>일</small></b><small>' + (L.rev + L.nw + L.quiz ? "오늘 공부함" : "오늘 아직 시작 전") + "</small></div>" +
          '<div class="stat"><small>복습 대기</small><b>' + due.length + '</b><small>오늘 복습 ' + L.rev + "개 완료</small></div>" +
          '<div class="stat"><small>새 단어</small><b>' + L.nw + "<small> / " + state.cfg.daily + '</small></b><div class="bar"><i style="width:' + Math.min(100, L.nw / state.cfg.daily * 100) + '%"></i></div></div>' +
          '<div class="stat"><small>복습 중인 단어</small><b>' + inSrs + '</b><small>그중 장기 기억 ' + mastered + "개</small></div>" +
        "</div>" +
        '<div class="panel routine">' +
          step(1, "복습 카드", reviewDone ? (L.rev ? "완료 · " + L.rev + "개 복습" : "오늘 복습할 단어 없음") : due.length + "개 남음 · 1·3·7·14·30일 간격으로 다시 나오는 단어", reviewDone, reviewDone ? "" : '<button class="btn primary" data-go="review">시작</button>') +
          step(2, "새 단어", P && P.past ? "시험 " + REVIEW_DAYS + "일 전부터는 복습 기간 · 새 단어 없이 복습과 실전 기출 위주" : newDone ? "완료 · " + L.nw + "개" : left + "개 남음 · " + state.cfg.tiers.join(" → ") + " 순서", newDone, newDone ? (newList(1).length ? '<button class="btn" data-go="more">10개 더</button>' : "") : '<button class="btn primary" data-go="new">시작</button>') +
          step(3, "오늘 단어 퀴즈", todayWords ? (quizDone ? "완료 · " + L.ok + "/" + L.quiz + " 정답" : "오늘 본 단어 " + todayWords + "개로 4지선다") : "복습이나 새 단어를 먼저 해 주세요", quizDone, todayWords ? '<button class="btn' + (quizDone ? "" : " primary") + '" data-go="quiz">' + (quizDone ? "한 번 더" : "시작") + "</button>" : "") +
          step(4, weekend ? "주말 실전 기출" : "실전 기출 (주말 추천)", "한 해 40문항을 풀고, 지문에서 막힌 단어는 단어장 별표를 꺼서 복습 대상으로", false, '<a class="btn" href="#real">열기</a>') +
        "</div>" +
        '<div id="ts"></div>' +
        '<div class="panel"><h3>다가오는 복습 (7일)</h3><div class="fc">' + forecast.map(function (n, i) {
          var d = new Date(Date.now() + (i + 1) * 86400000);
          return '<div class="fcd"><span class="fcb" style="height:' + Math.round(n / fmax * 60) + 'px"></span><b class="num">' + n + "</b><small>" + ["일", "월", "화", "수", "목", "금", "토"][d.getDay()] + "</small></div>";
        }).join("") + "</div></div>" +
        '<details class="panel"><summary><b>루틴 설정</b></summary><div class="cfg">' +
          '<label>시험 날짜 <input type="date" id="texam" value="' + esc(state.cfg.exam || "") + '"></label>' +
          '<label>목표 범위 <select id="tscope">' + [[2, "직접 출제 + 반복 학술"], [3, "+ 심화"], [4, "+ 일반"]].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === state.cfg.scope ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" +
          '<label>하루 새 단어 <select id="tdaily">' + [10, 15, 20, 25, 30, 35, 40, 50, 60, 80].concat(state.cfg.daily).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; }).map(function (n) { return '<option' + (n === state.cfg.daily ? " selected" : "") + ">" + n + "</option>"; }).join("") + "</select>개</label>" +
          '<div class="row">' + ROUTINE_TIERS.map(function (t) { return '<label class="chk"><input type="checkbox" data-tier="' + t + '"' + (state.cfg.tiers.indexOf(t) >= 0 ? " checked" : "") + "> " + t + "</label>"; }).join("") + "</div>" +
          '<p class="lead" style="font-size:.82rem">새 단어는 체크한 등급에서 단어장 순서(여러 해 나온 단어 먼저)대로 나옵니다. 별표로 외운 단어는 건너뜁니다.</p>' +
          '<div class="row"><button class="btn" id="treset">복습 기록 초기화</button><span id="tconfirm" hidden><button class="btn bad" id="tyes">정말 지우기</button> <button class="btn" id="tno">취소</button></span></div>' +
        "</div></details>";
      if (session) drawSession();
    }
    function dday(P) {
      if (!P) return '<div class="panel ddp"><b>시험일을 정해 주세요</b><small>아래 루틴 설정에서 시험 날짜를 넣으면 D-day와 하루 권장 개수를 계산합니다.</small></div>';
      var status;
      if (P.dd < 0) status = '<span class="tag plain">시험이 끝났습니다</span>';
      else if (P.past) status = '<span class="tag good">복습 기간</span> 새 단어는 멈추고 복습·오답노트·실전 기출에 집중하세요.';
      else if (P.remain === 0) status = '<span class="tag good">목표 범위 완료</span> 남은 기간은 복습과 실전 기출, 여유가 있으면 범위를 넓혀 보세요.';
      else if (P.ok) status = '<span class="tag good">일정 안</span> 지금 속도(하루 ' + state.cfg.daily + "개)면 " + md(P.finish) + "에 끝나 " + (P.cutoff === P.finish ? "새 단어 마감일에 딱 맞습니다." : "마감 " + md(P.cutoff) + "보다 " + (P.cutoff - P.finish) + "일 여유가 있습니다.");
      else status = '<span class="tag">늦어짐</span> 지금 속도(하루 ' + state.cfg.daily + "개)면 " + md(P.finish) + "에 끝나 마감 " + md(P.cutoff) + "보다 " + (P.finish - P.cutoff) + "일 늦습니다." +
        (P.need <= 80 ? ' <button class="btn primary" data-daily="' + P.need + '">하루 ' + P.need + "개로 바꾸기</button>" : " 범위를 줄이는 것도 방법입니다.");
      return '<div class="panel ddp"><div class="row" style="justify-content:space-between;align-items:baseline"><b class="dd num">' + (P.dd > 0 ? "D-" + P.dd : P.dd === 0 ? "D-DAY" : "D+" + (-P.dd)) + "</b>" +
        "<small>시험 " + md(P.ex) + " · 새 단어 마감 " + md(P.cutoff) + "</small></div>" +
        '<div class="ddgrid"><div><small>목표 범위 남은 단어</small><b class="num">' + P.remain + "</b><small>" + P.scope.join("·") + "</small></div>" +
        "<div><small>마감까지 하루 권장</small><b class=\"num\">" + (P.past ? 0 : P.need) + "</b><small>개</small></div>" +
        "<div><small>지금 속도로 끝나는 날</small><b class=\"num\">" + (P.remain ? md(P.finish) : "완료") + "</b><small>하루 " + state.cfg.daily + "개 기준</small></div></div>" +
        "<p>" + status + "</p></div>";
    }
    function step(n, title, desc, done, action) {
      return '<div class="rstep' + (done ? " done" : "") + '"><span class="rnum">' + (done ? "✓" : n) + '</span><div style="min-width:0"><b>' + title + "</b><small>" + desc + "</small></div><div>" + action + "</div></div>";
    }
    function start(kind) {
      if (kind === "review") session = { kind: kind, q: dueList(), i: 0, flip: false };
      else if (kind === "new" || kind === "more") { session = { kind: "new", q: newList(kind === "more" ? 10 : newLeftCapped()), i: 0, flip: false }; }
      else if (kind === "quiz") session = { kind: kind, q: shuffle(dayLog().words.filter(function (k) { return BYW[k]; })).slice(0, 20), i: 0, picked: null };
      render();
      var ts = $("#ts", el); if (ts) ts.scrollIntoView({ block: "start" });
    }
    function drawSession() {
      var ts = $("#ts", el), s = session;
      if (s.i >= s.q.length) {
        ts.innerHTML = '<div class="panel empty"><h3>' + (s.kind === "review" ? "복습 끝!" : s.kind === "new" ? "새 단어 끝!" : "퀴즈 끝!") + "</h3><p>" + s.q.length + "개를 마쳤습니다.</p><button class=\"btn primary\" data-go=\"close\">루틴으로</button></div>";
        return;
      }
      var a = BYW[s.q[s.i]];
      if (s.kind === "quiz") return drawQuiz(ts, a);
      var ex = s.flip ? examples(a, 1)[0] : null;
      ts.innerHTML = '<div class="card-stage"><div class="counter">' + (s.kind === "review" ? "복습 " : "새 단어 ") + (s.i + 1) + " / " + s.q.length + "</div>" +
        '<div class="flash tflash" id="tfc" tabindex="0" role="button" aria-label="카드 뒤집기">' +
          '<div class="row" style="justify-content:center"><span class="fw">' + esc(a.w) + "</span>" + spk(a.w) + "</div>" +
          (s.flip ? '<div class="fm">' + esc(a.m) + "</div>" + (a.s ? '<div class="syn"><b>동의어</b> ' + esc(a.s) + "</div>" : "") +
            (ex ? '<p class="exs tex"><span class="tag plain num">' + ex.y + " · " + ex.q + "번</span> " + ex.h + "</p>" : "") +
            '<div class="fx">' + esc(a.t) + (a.tg ? " · " + esc(a.tg) : "") + " · " + a.y + "개년 " + a.n + "회</div>"
            : '<div class="hint">뜻을 떠올린 뒤 눌러서 확인 (Space)</div>') +
        "</div>" +
        (s.flip ? '<div class="row" style="justify-content:center"><button class="btn bad" data-g="0">몰라요 <small>1</small></button><button class="btn" data-g="1">헷갈려요 <small>2</small></button><button class="btn good" data-g="2">알아요 <small>3</small></button></div>' +
          '<p class="lead" style="font-size:.78rem;text-align:center">몰라요: 내일 다시 · 헷갈려요: 조금 뒤 다시 · 알아요: 간격을 늘려 다시</p>'
          : '<div class="row" style="justify-content:center"><button class="btn primary" data-flip="1">뜻 확인</button></div>') +
        '<div class="row" style="justify-content:center"><button class="btn" data-go="close">그만하기</button></div></div>';
      if (s.flip && canSpeak) say(a.w);
    }
    function drawQuiz(ts, a) {
      var s = session;
      if (!s.choices) s.choices = shuffle([a].concat(shuffle(D.all.filter(function (x) { return x.w !== a.w && x.m !== a.m && x.t !== "고유명사"; })).slice(0, 3)));
      ts.innerHTML = '<div class="panel"><div class="row" style="justify-content:space-between"><span class="score">퀴즈 ' + (s.i + 1) + " / " + s.q.length + "</span></div>" +
        '<div class="row q-target" style="margin:14px 0">' + esc(a.w) + spk(a.w) + "</div>" +
        '<div class="opts">' + s.choices.map(function (c, i) {
          var cls = s.picked == null ? "" : c === a ? " correct" : s.picked === i ? " wrong" : "";
          return '<button class="opt' + cls + '" data-pick="' + i + '"' + (s.picked != null ? " disabled" : "") + '><span class="bubble">' + (i + 1) + "</span><span>" + esc(c.m) + (s.picked != null ? '<br><span class="om">' + esc(c.w) + "</span>" : "") + "</span></button>";
        }).join("") + "</div>" +
        (s.picked != null ? '<div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" data-next="1">다음 →</button></div>' : "") +
        '<div class="row" style="margin-top:8px"><button class="btn" data-go="close">그만하기</button></div></div>';
    }
    el.addEventListener("click", function (e) {
      var g = e.target.closest("[data-go]");
      if (g) {
        var k = g.dataset.go;
        if (k === "close") { session = null; render(); window.scrollTo(0, 0); } else start(k);
        return;
      }
      if (!session) return;
      if (e.target.closest("[data-flip]") || e.target.closest("#tfc")) { session.flip = !session.flip; drawSession(); return; }
      var gr = e.target.closest("[data-g]");
      if (gr) { answer(+gr.dataset.g); return; }
      var pk = e.target.closest("[data-pick]");
      if (pk && session.picked == null) {
        var s = session, i = +pk.dataset.pick, a = BYW[s.q[s.i]], ok = s.choices[i] === a;
        s.picked = i; var L = dayLog(); L.quiz++; if (ok) L.ok++; else grade(a.w.toLowerCase(), 0, false), L.rev--;
        state.quiz.total++; if (ok) state.quiz.right++;
        save(); drawSession(); return;
      }
      if (e.target.closest("[data-next]")) { session.i++; session.picked = null; session.choices = null; drawSession(); }
    });
    function answer(g) {
      var s = session, k = s.q[s.i];
      grade(k, g, s.kind === "new");
      if (g === 0) s.q.push(k); // 몰라요는 이번 세션 끝에 한 번 더
      s.i++; s.flip = false;
      render();
    }
    el._key = function (e) {
      if (!session || e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
      if (session.kind === "quiz") {
        var n = parseInt(e.key, 10);
        if (n >= 1 && n <= 4 && session.picked == null) { var b = el.querySelector('[data-pick="' + (n - 1) + '"]'); if (b) b.click(); }
        else if (e.key === "Enter" && session.picked != null) { var nx = el.querySelector("[data-next]"); if (nx) nx.click(); }
        return;
      }
      if (e.key === " ") { e.preventDefault(); session.flip = !session.flip; drawSession(); }
      else if (session.flip && (e.key === "1" || e.key === "2" || e.key === "3")) answer(+e.key - 1);
    };
    el.addEventListener("change", function (e) {
      if (e.target.id === "tdaily") { state.cfg.daily = +e.target.value; save(); render(); }
      if (e.target.id === "texam") { state.cfg.exam = e.target.value; save(); render(); }
      if (e.target.id === "tscope") { state.cfg.scope = +e.target.value; save(); render(); }
      if (e.target.dataset && e.target.dataset.tier) {
        var t = e.target.dataset.tier, arr = state.cfg.tiers.filter(function (x) { return x !== t; });
        if (e.target.checked) arr.push(t);
        state.cfg.tiers = ROUTINE_TIERS.filter(function (x) { return arr.indexOf(x) >= 0; });
        if (!state.cfg.tiers.length) state.cfg.tiers = ["직접 출제"];
        save(); render();
      }
    });
    el.addEventListener("click", function (e) {
      var dl = e.target.closest && e.target.closest("[data-daily]");
      if (dl) { state.cfg.daily = +dl.dataset.daily; save(); render(); return; }
      if (e.target.id === "treset") $("#tconfirm", el).hidden = false;
      if (e.target.id === "tno") $("#tconfirm", el).hidden = true;
      if (e.target.id === "tyes") { state.srs = {}; state.days = {}; save(); session = null; render(); }
    });
    render();
  };

  /* ---------- 오답노트 ---------- */
  views.review = function (el) {
    var list = pools.all.filter(function (x) { return state.wrong[x.k]; }).sort(function (a, b) { return state.wrong[b.k] - state.wrong[a.k]; });
    el.innerHTML =
      '<div><div class="eyebrow">오답노트</div><h2>틀린 단어 ' + list.length + "개</h2></div>" +
      '<p class="lead">퀴즈·카드·기출에서 틀린 단어가 틀린 횟수 순으로 모입니다. 카드에서 "알아요"를 누르면 목록에서 빠집니다.</p>' +
      '<div class="row"><a class="btn primary" href="#cards" id="rc" style="text-decoration:none">오답 카드로 복습</a><a class="btn" href="#quiz" id="rq" style="text-decoration:none">오답 퀴즈</a><button class="btn" id="rclear">오답노트 비우기</button><span id="rconfirm" hidden><button class="btn bad" id="ryes">정말 비우기</button> <button class="btn" id="rno">취소</button></span></div>' +
      '<div class="wlist">' + (list.length ? list.map(function (x) {
        return '<div class="witem"><span class="tag num" style="justify-self:start">' + state.wrong[x.k] + '회</span><div style="min-width:0"><span class="w">' + esc(x.w) + '</span><div class="m">' + esc(x.m) + '</div><div class="meta">' + esc(x.src) + "</div></div>" +
          '<div class="side">' + spk(x.w) + "</div></div>";
      }).join("") : '<div class="empty">아직 틀린 단어가 없습니다. <a href="#quiz">퀴즈</a>를 풀어 보세요.</div>') + "</div>";
    $("#rc", el).onclick = function () { cardPool = "wrong"; };
    $("#rq", el).onclick = function () { quizPool = "wrong"; };
    $("#rclear", el).onclick = function () { $("#rconfirm", el).hidden = false; };
    $("#rno", el).onclick = function () { $("#rconfirm", el).hidden = true; };
    $("#ryes", el).onclick = function () { state.wrong = {}; save(); route(); };
  };

  route();
})();
