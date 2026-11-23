(function () {
  "use strict";
  var D = window.WORD_DATA;
  var YEARS3 = [2024, 2025, 2026];
  var CIRC = ["", "①", "②", "③", "④"];

  /* ---------- 저장소 (실패해도 동작) ---------- */
  var KEY = "kpu-word-v1";
  var state = { known: {}, wrong: {}, quiz: { right: 0, total: 0 }, exam: {} };
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

  /* ---------- 단어 풀 ---------- */
  var pools = {};
  function add(pool, w, m, src) {
    if (!w || !m) return;
    var k = w.toLowerCase();
    if (pool.some(function (x) { return x.k === k; })) return;
    pool.push({ k: k, w: w, m: m, src: src });
  }
  pools.p1 = []; pools.p2 = []; pools.p3 = []; pools.core = []; pools.opts = []; pools.all = [];
  D.vocab.forEach(function (v) {
    var key = v.p.indexOf("1순위") === 0 ? "p1" : v.p.indexOf("2순위") === 0 ? "p2" : "p3";
    add(pools[key], v.w, v.m, v.p);
  });
  D.core.forEach(function (c) {
    add(pools.core, c.tw, c.m, c.yr + "년 " + c.q + "번 " + (c.t === "동의어" ? "표적어" : "정답"));
    c.o.forEach(function (o) { add(pools.opts, o.w, o.m, c.yr + "년 " + c.q + "번 보기"); });
  });
  ["p1", "p2", "p3", "core", "opts"].forEach(function (k) { pools[k].forEach(function (x) { add(pools.all, x.w, x.m, x.src); }); });
  var POOL_NAMES = {
    p1: "1순위 (직접출제·3개년 반복)", p2: "2순위 (2개년 반복)", p3: "3순위 (심화)",
    core: "5개년 1~8번 핵심 40", opts: "1~8번 보기 단어", all: "전체", wrong: "오답노트", unknown: "아직 모르는 단어"
  };
  function getPool(key) {
    if (key === "wrong") return pools.all.filter(function (x) { return state.wrong[x.k]; });
    if (key === "unknown") return pools.all.filter(function (x) { return !state.known[x.k]; });
    return pools[key] || [];
  }
  function poolSelect(id, cur) {
    return '<select id="' + id + '">' + Object.keys(POOL_NAMES).map(function (k) {
      return '<option value="' + k + '"' + (k === cur ? " selected" : "") + ">" + POOL_NAMES[k] + " · " + getPool(k).length + "</option>";
    }).join("") + "</select>";
  }
  function markWrong(k) { state.wrong[k] = (state.wrong[k] || 0) + 1; save(); }

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

  /* ---------- 홈 ---------- */
  views.home = function (el) {
    var total = pools.all.length;
    var known = pools.all.filter(function (x) { return state.known[x.k]; }).length;
    var wrongN = Object.keys(state.wrong).length;
    var examDone = Object.keys(state.exam).length;
    var examRight = Object.keys(state.exam).filter(function (k) { return state.exam[k]; }).length;
    var pct = total ? Math.round(known / total * 100) : 0;
    el.innerHTML =
      '<div><div class="eyebrow">한국공학대학교 편입영어 · 2022–2026 기출</div><h2>기출 단어로 공부하기</h2></div>' +
      '<p class="lead">5개년 200문항에서 뽑은 기출 어휘입니다. 직접 출제된 단어와 여러 해 반복된 단어부터 외우고, 1~8번 기출 문제를 실제 보기 그대로 다시 풀어 보세요.</p>' +
      '<div class="stats">' +
        '<div class="stat"><small>외운 단어</small><b>' + known + '<small> / ' + total + '</small></b><div class="bar"><i style="width:' + pct + '%"></i></div></div>' +
        '<div class="stat"><small>오답노트</small><b>' + wrongN + '</b><small>틀린 단어</small></div>' +
        '<div class="stat"><small>기출 1~8번</small><b>' + examRight + '<small> / ' + examDone + ' 정답</small></b><small>전체 40문항</small></div>' +
        '<div class="stat"><small>퀴즈 누적</small><b>' + state.quiz.right + '<small> / ' + state.quiz.total + '</small></b><small>정답 / 문제</small></div>' +
      "</div>" +
      '<div class="panel"><h3>추천 학습 순서</h3><ol class="steps" style="margin-top:10px">' +
        '<li><a href="#words">단어장</a>에서 1순위(직접 출제·3개년 반복) 70개부터 뜻 가리고 외우기</li>' +
        '<li><a href="#cards">카드</a>로 넘기며 아는 단어 체크 → 모르는 단어만 반복</li>' +
        '<li><a href="#exam">기출 1~8번</a>을 실제 보기로 풀고, 오답 보기의 뜻까지 확인</li>' +
        '<li><a href="#quiz">퀴즈</a>로 점검, 틀린 단어는 <a href="#review">오답노트</a>에 자동 저장</li>' +
        '<li><a href="#context">문맥 빈칸</a>과 <a href="#tips">풀이법</a>으로 17~40번 대비</li>' +
      "</ol></div>" +
      '<div class="panel"><h3>시험 구성 (40문항 / 60분)</h3><div class="table-wrap" style="margin-top:8px"><table>' +
        '<thead><tr><th>문항</th><th>유형</th><th class="num">문항 수</th><th>비중</th></tr></thead><tbody>' +
        [["1~5", "동의어", 5, "12.5%"], ["6~8", "어휘 빈칸", 3, "7.5%"], ["9~14", "문법 빈칸", 6, "15%"], ["15~16", "문법 오류", 2, "5%"], ["17~25", "문맥·논리 빈칸", 9, "22.5%"], ["26~40", "장문 독해", 15, "37.5%"]].map(function (r) {
          return "<tr><td class=num>" + r[0] + "</td><td>" + r[1] + "</td><td class=num>" + r[2] + "</td><td class=num>" + r[3] + "</td></tr>";
        }).join("") +
      "</tbody></table></div>" +
      '<p class="lead" style="margin-top:10px;font-size:.88rem">권장 시간: 1~8번 6분 · 9~16번 9분 · 17~25번 15분 · 26~40번 26분 · 검토 4분. 오답 감점이 없으니 모든 문항에 답하세요.</p></div>' +
      '<p class="lead" style="font-size:.82rem">빈도는 과거 기출의 출현 횟수이며 출제 확률이 아닙니다. 1~8번 표적·정답 어휘가 그대로 다시 나온 경우는 5년간 1번(2024 plead → 2025 pleaded)뿐이므로, 보기 단어와 반복 학술어까지 넓게 익히는 것이 좋습니다. 학습 기록은 이 브라우저에만 저장됩니다.</p>';
  };

  /* ---------- 단어장 ---------- */
  views.words = function (el) {
    var filter = "all", q = "", hide = false, limit = 60;
    el.innerHTML =
      '<div><div class="eyebrow">우선 암기 단어장</div><h2>3개년 기출 어휘 217개</h2></div>' +
      '<p class="lead">우선순위는 직접 출제 > 3개년 반복 > 2개년 반복 순입니다. 별표를 누르면 외운 단어로 표시됩니다.</p>' +
      '<div class="row" id="wf"></div>' +
      '<div class="row"><input type="search" id="wq" placeholder="영단어나 뜻으로 검색"><button class="btn" id="wh">뜻 가리기</button></div>' +
      '<div class="counter" id="wc"></div><div class="wlist" id="wl"></div>';
    var cats = [["all", "전체"], ["1순위 · 직접 출제", "직접 출제"], ["1순위 · 3개년 반복", "3개년 반복"], ["2순위 · 2개년 반복", "2개년 반복"], ["2순위 · 같은 연도 고빈도", "같은 연도 고빈도"], ["3순위 · 심화 어휘", "심화"], ["unknown", "안 외운 단어"]];
    $("#wf", el).innerHTML = cats.map(function (c) { return '<button class="chip' + (c[0] === filter ? " on" : "") + '" data-f="' + esc(c[0]) + '">' + c[1] + "</button>"; }).join("");
    $("#wf", el).onclick = function (e) {
      var b = e.target.closest("[data-f]"); if (!b) return;
      filter = b.dataset.f; limit = 60;
      el.querySelectorAll("#wf .chip").forEach(function (c) { c.classList.toggle("on", c === b); });
      draw();
    };
    $("#wq", el).oninput = function () { q = this.value.trim().toLowerCase(); limit = 60; draw(); };
    $("#wh", el).onclick = function () { hide = !hide; this.textContent = hide ? "뜻 보이기" : "뜻 가리기"; $("#wl", el).classList.toggle("hide-m", hide); };
    function draw() {
      var list = D.vocab.filter(function (v) {
        if (filter === "unknown") { if (state.known[v.w.toLowerCase()]) return false; }
        else if (filter !== "all" && v.p !== filter) return false;
        return !q || v.w.toLowerCase().indexOf(q) >= 0 || v.m.indexOf(q) >= 0;
      });
      $("#wc", el).textContent = list.length + "개";
      var html = list.slice(0, limit).map(function (v) {
        var k = v.w.toLowerCase();
        var yrs = YEARS3.map(function (y, i) { return v.c[i] ? y + "(" + v.q[i] + "번)" : ""; }).filter(Boolean).join(" · ");
        return '<div class="witem"><button class="star' + (state.known[k] ? " on" : "") + '" data-k="' + esc(k) + '" aria-label="외운 단어 표시">★</button>' +
          '<div style="min-width:0"><div class="row" style="gap:8px"><span class="w">' + esc(v.w) + "</span>" +
          (canSpeak ? '<button class="say" data-say="' + esc(v.w) + '">발음</button>' : "") + "</div>" +
          '<div class="m">' + esc(v.m) + '</div><div class="meta">' + esc(yrs) + (v.f && v.f !== v.w ? " · 어형: " + esc(v.f) : "") + "</div></div>" +
          '<div class="side"><span class="tag' + (v.p.indexOf("3순위") === 0 ? " plain" : "") + '">' + esc(v.p.split(" · ")[1] || v.p) + '</span> <span class="meta num">' + v.n + "회</span></div></div>";
      }).join("");
      if (!list.length) html = '<div class="empty">조건에 맞는 단어가 없습니다.</div>';
      $("#wl", el).innerHTML = html + (list.length > limit ? '<button class="btn more" id="wm" style="margin:12px">더 보기 (' + (list.length - limit) + "개 남음)</button>" : "");
      var m = $("#wm", el); if (m) m.onclick = function () { limit += 100; draw(); };
    }
    $("#wl", el).onclick = function (e) {
      var s = e.target.closest(".star");
      if (s) { var k = s.dataset.k; if (state.known[k]) delete state.known[k]; else state.known[k] = 1; save(); s.classList.toggle("on"); return; }
      var sp = e.target.closest("[data-say]"); if (sp) { say(sp.dataset.say); return; }
      var m = e.target.closest(".m"); if (m) m.classList.toggle("peek");
    };
    draw();
  };

  /* ---------- 카드 ---------- */
  var cardPool = "p1";
  views.cards = function (el) {
    var deck = [], i = 0, flipped = false, front = "en";
    el.innerHTML =
      '<div><div class="eyebrow">플래시카드</div><h2>넘기며 외우기</h2></div>' +
      '<div class="row">' + poolSelect("cp", cardPool) +
      '<select id="cf"><option value="en">영어 → 뜻</option><option value="ko">뜻 → 영어</option></select>' +
      '<button class="btn" id="cs">섞기</button></div>' +
      '<div class="card-stage"><div class="counter" id="cn"></div><div class="flash" id="fc" tabindex="0" role="button" aria-label="카드 뒤집기"></div>' +
      '<div class="row" style="justify-content:center"><button class="btn bad" id="cno">몰라요</button><button class="btn good" id="cyes">알아요</button></div>' +
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
  var quizPool = "p1";
  views.quiz = function (el) {
    var mode = "en", queue = [], cur = null, n = 0, right = 0;
    el.innerHTML =
      '<div><div class="eyebrow">4지선다 퀴즈</div><h2>뜻 고르기</h2></div>' +
      '<div class="row">' + poolSelect("qp", quizPool) +
      '<select id="qm"><option value="en">영어 보고 뜻 고르기</option><option value="ko">뜻 보고 영어 고르기</option></select>' +
      '<button class="btn" id="qr">다시 시작</button></div>' +
      '<div class="panel" id="qb"></div>';
    function start() { queue = shuffle(getPool(quizPool)); n = 0; right = 0; next(); }
    function next() {
      var box = $("#qb", el);
      if (!queue.length) {
        box.innerHTML = n ? '<div class="empty"><h3>끝!</h3><p>' + n + "문제 중 " + right + '개 정답</p><button class="btn primary" id="qa">다시 풀기</button></div>'
          : '<div class="empty">이 묶음에 단어가 없습니다.</div>';
        var a = $("#qa", el); if (a) a.onclick = start;
        return;
      }
      cur = queue.shift();
      var others = shuffle(pools.all.filter(function (x) { return x.k !== cur.k && x.m !== cur.m; })).slice(0, 3);
      var choices = shuffle([cur].concat(others));
      box.innerHTML = '<div class="row" style="justify-content:space-between"><span class="score">' + (n + 1) + "번째 · 정답 " + right + '</span><span class="tag plain">' + esc(cur.src) + "</span></div>" +
        '<div style="margin:16px 0" class="' + (mode === "en" ? "q-target" : "fm") + '">' + esc(mode === "en" ? cur.w : cur.m) + "</div>" +
        '<div class="opts">' + choices.map(function (c, idx) {
          return '<button class="opt" data-k="' + esc(c.k) + '"><span class="bubble">' + (idx + 1) + '</span><span><span class="' + (mode === "en" ? "" : "ow") + '">' + esc(mode === "en" ? c.m : c.w) + '</span><br><span class="om reveal-m" hidden>' + esc(mode === "en" ? c.w : c.m) + "</span></span></button>";
        }).join("") + "</div>" +
        '<div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn primary" id="qn" hidden>다음 →</button></div>';
      box.querySelectorAll(".opt").forEach(function (b) { b.onclick = function () { answer(b); }; });
      $("#qn", el).onclick = next;
      if (mode === "en" && canSpeak) say(cur.w);
    }
    function answer(b) {
      var box = $("#qb", el); if (!$("#qn", el).hidden) return;
      var ok = b.dataset.k === cur.k;
      box.querySelectorAll(".opt").forEach(function (o) {
        o.disabled = true; o.querySelector(".reveal-m").hidden = false;
        if (o.dataset.k === cur.k) o.classList.add("correct");
      });
      if (!ok) { b.classList.add("wrong"); markWrong(cur.k); } else { right++; }
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
  views.exam = function (el) {
    var years = [2022, 2023, 2024, 2025, 2026];
    el.innerHTML =
      '<div><div class="eyebrow">기출 재현 · 1~8번</div><h2>실제 보기로 다시 풀기</h2></div>' +
      '<p class="lead">1~5번은 밑줄 친 표적어와 뜻이 가장 가까운 보기, 6~8번은 문맥상 빈칸에 들어갈 보기를 고르는 문제입니다. 답을 고르면 네 보기의 뜻이 모두 나옵니다.</p>' +
      '<div class="row" id="ey">' + years.map(function (y) { return '<button class="chip' + (y === examYear ? " on" : "") + '" data-y="' + y + '">' + y + "학년도</button>"; }).join("") +
      '</div><div class="score" id="es"></div><div class="grid" id="eg" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))"></div>';
    $("#ey", el).onclick = function (e) {
      var b = e.target.closest("[data-y]"); if (!b) return;
      examYear = +b.dataset.y;
      el.querySelectorAll("#ey .chip").forEach(function (c) { c.classList.toggle("on", c === b); });
      draw();
    };
    function draw() {
      var qs = D.core.filter(function (c) { return c.yr === examYear; });
      var done = qs.filter(function (c) { return (c.yr + "-" + c.q) in state.exam; });
      var ok = done.filter(function (c) { return state.exam[c.yr + "-" + c.q]; }).length;
      $("#es", el).innerHTML = examYear + "학년도 " + done.length + "/" + qs.length + "문항 풀이 · " + ok + "개 정답" + (done.length ? ' · <button class="chip" id="ereset">이 연도 다시 풀기</button>' : "");
      var r = $("#ereset", el); if (r) r.onclick = function () { qs.forEach(function (c) { delete state.exam[c.yr + "-" + c.q]; }); save(); draw(); };
      $("#eg", el).innerHTML = qs.map(function (c) {
        var id = c.yr + "-" + c.q, solved = id in state.exam;
        return '<div class="panel" data-id="' + id + '" style="display:flex;flex-direction:column;gap:10px">' +
          '<div class="row" style="justify-content:space-between"><b class="num">' + c.q + '번</b><span class="tag">' + esc(c.t) + "</span></div>" +
          (c.t === "동의어" ? '<div><small style="color:var(--muted)">밑줄 친 표현과 뜻이 가장 가까운 것은?</small><div class="q-target" style="text-decoration:underline;text-underline-offset:6px;text-decoration-color:var(--omr)">' + esc(c.tw) + "</div></div>"
            : '<div><small style="color:var(--muted)">문맥상 빈칸에 들어갈 가장 적절한 것은?</small><div class="q-target">[&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;]</div></div>') +
          '<div class="opts">' + c.o.map(function (o) {
            var cls = solved && o.ok ? " correct" : "";
            return '<button class="opt' + cls + '" data-no="' + o.no + '"' + (solved ? " disabled" : "") + '><span class="bubble">' + CIRC[o.no] + '</span><span><span class="ow">' + esc(o.w) + '</span><br><span class="om"' + (solved ? "" : " hidden") + ">" + esc(o.m) + "</span></span></button>";
          }).join("") + "</div>" +
          '<div class="explain"' + (solved ? "" : " hidden") + "><p><b>" + esc(c.tw) + (c.t === "동의어" ? " = " + esc(c.a) : "") + "</b> · " + esc(c.m) + "</p>" +
          (c.h ? "<p style=\"color:var(--muted);font-size:.88rem\">단서: " + esc(c.h) + "</p>" : "") +
          (c.re ? "<p style=\"color:var(--omr);font-size:.88rem\">재출제: " + esc(c.re) + "</p>" : "") + "</div></div>";
      }).join("");
    }
    $("#eg", el).onclick = function (e) {
      var b = e.target.closest(".opt"); if (!b || b.disabled) return;
      var card = b.closest("[data-id]"), id = card.dataset.id;
      var c = D.core.filter(function (x) { return x.yr + "-" + x.q === id; })[0];
      var picked = +b.dataset.no, ok = c.o.some(function (o) { return o.no === picked && o.ok; });
      state.exam[id] = ok;
      if (!ok) { var t = c.o.filter(function (o) { return o.ok; })[0]; markWrong(c.tw.toLowerCase()); if (t) markWrong(t.w.toLowerCase()); }
      save();
      card.querySelectorAll(".opt").forEach(function (o) {
        o.disabled = true; o.querySelector(".om").hidden = false;
        if (c.o.some(function (x) { return x.no === +o.dataset.no && x.ok; })) o.classList.add("correct");
      });
      if (!ok) b.classList.add("wrong");
      card.querySelector(".explain").hidden = false;
      var qs = D.core.filter(function (x) { return x.yr === examYear; });
      var done = qs.filter(function (x) { return (x.yr + "-" + x.q) in state.exam; });
      $("#es", el).textContent = examYear + "학년도 " + done.length + "/" + qs.length + "문항 풀이 · " + done.filter(function (x) { return state.exam[x.yr + "-" + x.q]; }).length + "개 정답";
    };
    draw();
  };

  /* ---------- 문맥 빈칸 17~25 ---------- */
  views.context = function (el) {
    var yr = "all";
    el.innerHTML =
      '<div><div class="eyebrow">17~25번 · 문맥·논리 빈칸</div><h2>정답 표현과 판단 근거</h2></div>' +
      '<p class="lead">2024~2026학년도 27문항입니다. 근거를 먼저 읽고 어떤 표현이 들어갈지 떠올린 뒤, 카드를 눌러 정답을 확인하세요.</p>' +
      '<div class="row" id="xy">' + ["all"].concat(YEARS3).map(function (y) { return '<button class="chip' + (y === yr ? " on" : "") + '" data-y="' + y + '">' + (y === "all" ? "전체" : y + "학년도") + "</button>"; }).join("") +
      '<button class="btn" id="xa">정답 모두 보기</button></div><div class="grid" id="xg"></div>';
    function draw() {
      $("#xg", el).innerHTML = D.ctx.filter(function (c) { return yr === "all" || c.yr === +yr; }).map(function (c) {
        return '<button class="panel ctx" style="text-align:left">' +
          '<div class="row" style="justify-content:space-between"><b class="num">' + c.yr + " · " + c.q + '번</b><span class="tag plain">' + esc(c.tip) + "</span></div>" +
          "<div><small>판단 근거</small><div>" + esc(c.why) + "</div></div>" +
          '<div class="reveal" hidden><small>정답 ' + (CIRC[c.no] || c.no) + '</small><span class="ans">' + esc(c.a) + "</span><span>" + esc(c.m) + "</span></div>" +
          '<small class="tap">눌러서 정답 보기</small></button>';
      }).join("");
    }
    $("#xy", el).onclick = function (e) {
      var b = e.target.closest("[data-y]"); if (!b) return;
      yr = b.dataset.y; el.querySelectorAll("#xy .chip").forEach(function (c) { c.classList.toggle("on", c === b); }); draw();
    };
    $("#xa", el).onclick = function () { el.querySelectorAll(".ctx").forEach(function (c) { c.querySelector(".reveal").hidden = false; c.querySelector(".tap").hidden = true; }); };
    $("#xg", el).onclick = function (e) {
      var c = e.target.closest(".ctx"); if (!c) return;
      var r = c.querySelector(".reveal"); r.hidden = !r.hidden; c.querySelector(".tap").hidden = !r.hidden;
    };
    draw();
  };

  /* ---------- 풀이법 ---------- */
  views.tips = function (el) {
    el.innerHTML =
      '<div><div class="eyebrow">9~16번 · 26~40번</div><h2>문법·독해 풀이법</h2></div>' +
      '<h3>문법 핵심 유형</h3><div class="grid">' + D.grammar.map(function (g) {
        return '<div class="panel" style="display:flex;flex-direction:column;gap:6px"><b>' + esc(g.t) + '</b><span class="tag plain" style="align-self:flex-start">' + esc(g.ex) + '</span><p class="tip-how">' + esc(g.how) + '</p><p class="tip-eg">' + esc(g.eg) + "</p></div>";
      }).join("") + "</div>" +
      '<h3>독해 문항별 접근법</h3><div class="grid">' + D.reading.map(function (r) {
        return '<div class="panel" style="display:flex;flex-direction:column;gap:6px"><b>' + esc(r.t) + '</b><span class="tag plain" style="align-self:flex-start">' + esc(r.ex) + '</span><p class="tip-how">' + esc(r.how) + "</p></div>";
      }).join("") + "</div>";
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
          (canSpeak ? '<div class="side"><button class="say" data-say="' + esc(x.w) + '">발음</button></div>' : "<div></div>") + "</div>";
      }).join("") : '<div class="empty">아직 틀린 단어가 없습니다. <a href="#quiz">퀴즈</a>를 풀어 보세요.</div>') + "</div>";
    $("#rc", el).onclick = function () { cardPool = "wrong"; };
    $("#rq", el).onclick = function () { quizPool = "wrong"; };
    $("#rclear", el).onclick = function () { $("#rconfirm", el).hidden = false; };
    $("#rno", el).onclick = function () { $("#rconfirm", el).hidden = true; };
    $("#ryes", el).onclick = function () { state.wrong = {}; save(); route(); };
    el.onclick = function (e) { var sp = e.target.closest("[data-say]"); if (sp) say(sp.dataset.say); };
  };

  route();
})();
