/* 자료 학습 노트: 화면 (태블릿·노트북 기준)
   - 첫 화면: 왼쪽 새 자료 입력 / 오른쪽 AI 팀 설정·보관함
   - 자료 화면: 왼쪽 메뉴(요약·용어 카드·문제·상의 기록·원문) / 오른쪽 내용
   주소: # 없음 = 첫 화면, #item-<id> = 자료 하나. 로직은 local.js(기본 모드), ai.js(Claude·GPT 상의). */
(function () {
  "use strict";
  var S = window.Study, AI = S.AI, TYPE_NAMES = S.TYPE_NAMES;
  var SKEY = "study-notes-v1", KKEY = "study-notes-keys";
  var MAX_TEXT = 300000, MAX_SAVE_TEXT = 40000;
  var KIND = { draft: "초안 작성", review: "검토", revise: "검토 반영·수정", solo: "자료 만들기" };

  /* ---------- 저장 ---------- */
  var st = { items: [], cfg: { n: 10, level: "보통", types: { mcq: 1, ox: 1, blank: 1, short: 1 }, claudeModel: AI.claude.models[0][0], gptModel: AI.gpt.models[0][0], lead: "claude", rounds: 1 } };
  try { var sv = JSON.parse(localStorage.getItem(SKEY) || "null"); if (sv) { st.items = sv.items || []; st.presetsAdded = sv.presetsAdded || {}; Object.assign(st.cfg, sv.cfg || {}); } } catch (e) {}
  if (sv && sv.cfg && sv.cfg.model && !sv.cfg.claudeModel) st.cfg.claudeModel = sv.cfg.model;
  function save() {
    try { localStorage.setItem(SKEY, JSON.stringify(st)); return true; }
    catch (e) {
      for (var i = st.items.length - 1; i >= 0; i--) { if (st.items[i].text) { st.items[i].text = ""; try { localStorage.setItem(SKEY, JSON.stringify(st)); return true; } catch (e2) {} } }
      return false;
    }
  }
  // 기본 제공 학습 세트(sets.js)를 처음 한 번만 보관함 맨 위에 넣는다. 지운 세트는 다시 넣지 않는다.
  st.presetsAdded = st.presetsAdded || {};
  (S.PRESETS || []).slice().reverse().forEach(function (p) {
    if (st.presetsAdded[p.id]) return;
    st.items.unshift({ id: p.id, title: p.title, created: Date.now(), mode: "preset", preset: true, source: p.source, text: p.text, result: JSON.parse(JSON.stringify(p.result)), ans: {} });
    st.presetsAdded[p.id] = 1;
  });
  save();
  var keys = { claude: "", gpt: "" }, remember = true;
  try {
    var kv = JSON.parse(localStorage.getItem(KKEY) || "null");
    if (kv) keys = Object.assign(keys, kv);
    else { var old = localStorage.getItem("study-notes-key"); if (old) keys.claude = old; }
  } catch (e) {}
  function saveKeys() { try { if (remember && (keys.claude || keys.gpt)) localStorage.setItem(KKEY, JSON.stringify(keys)); else localStorage.removeItem(KKEY); localStorage.removeItem("study-notes-key"); } catch (e) {} }
  function aiSet() { return { claude: { key: keys.claude, model: st.cfg.claudeModel }, gpt: { key: keys.gpt, model: st.cfg.gptModel }, lead: st.cfg.lead, rounds: +st.cfg.rounds }; }

  /* ---------- 공통 ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmtDate(t) { var d = new Date(t); return (d.getMonth() + 1) + "/" + d.getDate() + " " + d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0"); }
  function who(w) { return '<span class="who who-' + w + '">' + AI[w].name + "</span>"; }
  function modeTag(it) {
    var r = it.result || {};
    if (it.preset) return '<span class="tag good">기본 제공 · Claude 제작</span>';
    if (it.mode !== "ai") return '<span class="tag plain">기본 모드</span>';
    if (r.team && r.team.solo) return '<span class="tag plain">' + AI[r.team.solo].name + " 단독</span>";
    return '<span class="tag duo">Claude × GPT</span>';
  }
  var el = document.getElementById("app");
  function setHdr() { var h = document.querySelector("header.top"); if (h) document.documentElement.style.setProperty("--hdr", h.offsetHeight + "px"); }
  setHdr(); window.addEventListener("resize", setHdr);

  /* ---------- 파일 읽기 ---------- */
  function readFile(f) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onerror = function () { rej(new Error(f.name + "을(를) 읽지 못했습니다.")); };
      if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") { r.onload = function () { res({ kind: "pdf", name: f.name, data: String(r.result).split(",")[1] }); }; r.readAsDataURL(f); }
      else if (/^image\/(png|jpeg|gif|webp)$/.test(f.type)) { r.onload = function () { res({ kind: "image", name: f.name, type: f.type, data: String(r.result).split(",")[1] }); }; r.readAsDataURL(f); }
      else if (/\.(txt|md|csv|tsv|html?|json|srt|vtt)$/i.test(f.name) || /^text\//.test(f.type)) {
        r.onload = function () { var t = String(r.result); if (/\.html?$/i.test(f.name)) { var d = document.createElement("div"); d.innerHTML = t; t = d.textContent; } res({ kind: "text", name: f.name, data: t }); }; r.readAsText(f);
      } else rej(new Error(f.name + ": 지원하지 않는 형식입니다. 텍스트(.txt .md), PDF, 이미지(PNG·JPG)를 넣어 주세요. Word·한글 파일은 내용을 복사해 붙여 넣어 주세요."));
    });
  }

  /* ---------- 첫 화면 ---------- */
  var files = [], draft = { title: "", text: "", focus: "" }, busy = false;
  function home() {
    var cfg = st.cfg;
    el.innerHTML =
      '<div class="home">' +
      '<section class="col-main">' +
        '<div><div class="eyebrow">새 자료</div><h2>자료로 요약·문제 만들기</h2><p class="lead">교재·필기·기사·지문을 넣으면 Claude와 GPT가 상의해서 요약, 용어 카드, 연습 문제를 만듭니다. 한 AI가 초안을 쓰면 다른 AI가 검토하고, 작성자가 의견을 따져 보고 고칩니다.</p></div>' +
        '<div class="panel stu-in">' +
          '<label class="fld"><span>제목</span><input id="stitle" class="stu-text" placeholder="비우면 자동으로 붙습니다" maxlength="80" value="' + esc(draft.title) + '"></label>' +
          '<label class="fld"><span>자료</span><textarea id="stext" class="stu-text" rows="14" placeholder="내용을 붙여 넣거나, 아래에서 파일을 고르세요. 이 칸에 파일을 끌어다 놓아도 됩니다.">' + esc(draft.text) + "</textarea></label>" +
          '<div class="row"><label class="btn" for="sfile">파일 선택</label><input type="file" id="sfile" multiple accept=".txt,.md,.csv,.tsv,.html,.htm,.json,.srt,.vtt,.pdf,image/png,image/jpeg,image/gif,image/webp" hidden>' +
          '<small class="stu-mut">텍스트 · PDF · 이미지(사진 찍은 필기·교재)</small><span id="sfiles" class="row"></span></div>' +
          '<div class="opts-grid">' +
            '<label class="fld"><span>문제 수</span><select id="sn">' + [5, 10, 15, 20, 30].map(function (n) { return "<option" + (n === cfg.n ? " selected" : "") + ">" + n + "</option>"; }).join("") + "</select></label>" +
            '<label class="fld"><span>난이도</span><select id="slv">' + ["쉬움", "보통", "어려움"].map(function (l) { return "<option" + (l === cfg.level ? " selected" : "") + ">" + l + "</option>"; }).join("") + "</select></label>" +
            '<div class="fld wide"><span>문제 유형</span><div class="row" id="stypes">' + Object.keys(TYPE_NAMES).map(function (t) { return '<button class="chip' + (cfg.types[t] ? " on" : "") + '" data-t="' + t + '" aria-pressed="' + !!cfg.types[t] + '">' + TYPE_NAMES[t] + "</button>"; }).join("") + "</div></div>" +
            '<label class="fld wide"><span>집중할 부분 (선택)</span><input id="sfocus" class="stu-text" placeholder="예: 3장 실험 결과 위주로" maxlength="200" value="' + esc(draft.focus) + '"></label>' +
          "</div>" +
          '<div class="go-row"><button class="btn primary big" id="sgo">요약·문제 만들기</button><span id="sstatus" class="stu-mut"></span></div>' +
          '<div id="smsg" class="stu-err" role="alert" hidden></div>' +
          '<div id="sprog" hidden></div>' +
        "</div>" +
      "</section>" +
      '<aside class="col-side">' +
        '<div class="panel team">' +
          '<div class="row" style="justify-content:space-between"><h3>AI 팀</h3><span id="tstate"></span></div>' +
          aiRow("claude", "sk-ant-…", AI.claude.models, cfg.claudeModel) +
          aiRow("gpt", "sk-…", AI.gpt.models, cfg.gptModel) +
          '<label class="chk"><input type="checkbox" id="srem"' + (remember ? " checked" : "") + "> 이 브라우저에 키 기억하기</label>" +
          '<div class="fld"><span>상의 방식</span><select id="slead"><option value="claude"' + (cfg.lead === "claude" ? " selected" : "") + ">Claude가 쓰고 GPT가 검토</option><option value=\"gpt\"" + (cfg.lead === "gpt" ? " selected" : "") + ">GPT가 쓰고 Claude가 검토</option></select></div>" +
          '<div class="fld"><span>검토 횟수</span><select id="srounds"><option value="1"' + (+cfg.rounds === 1 ? " selected" : "") + '>1번 (초안 → 검토 → 수정)</option><option value="2"' + (+cfg.rounds === 2 ? " selected" : "") + ">2번 (한 번 더 검토·수정)</option></select></div>" +
          '<p class="stu-mut small">키는 이 브라우저에만 저장되고 각 회사 서버로만 전송됩니다. 쓴 만큼 각 API 요금이 나옵니다. 키 발급: <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener">Claude Console</a> · <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">OpenAI Platform</a>. 공용 컴퓨터에서는 "기억하기"를 끄세요.</p>' +
        "</div>" +
        '<div class="lib"><h3>보관함 <span class="stu-mut">' + st.items.length + "</span></h3>" +
        '<div class="wlist" id="slib">' + (st.items.length ? st.items.map(function (it) {
          var a = it.ans || {}, qn = (it.result.questions || []).length, done = Object.keys(a).length, ok = Object.keys(a).filter(function (k) { return a[k].ok; }).length;
          return '<div class="witem stu-item" data-open="' + it.id + '"><div style="min-width:0"><span class="w stu-it">' + esc(it.title) + '</span><div class="meta">' + fmtDate(it.created) + " · 문제 " + qn + " · 푼 문제 " + done + " · 정답 " + ok + '</div><div class="meta">' + modeTag(it) + "</div></div>" +
            '<div class="side"><button class="btn sm" data-del="' + it.id + '">삭제</button></div></div>';
        }).join("") : '<div class="empty">아직 만든 자료가 없습니다.<br>왼쪽에 자료를 넣고 만들어 보세요.</div>') + "</div></div>" +
      "</aside></div>";

    var $ = function (s) { return el.querySelector(s); }, ta = $("#stext");
    function teamState() {
      var p = S.plan(aiSet()), t = $("#tstate"), s = $("#sstatus");
      if (p.length > 1) { t.innerHTML = '<span class="tag duo">상의 모드</span>'; s.innerHTML = p.map(function (x) { return who(x.who) + " " + KIND[x.kind]; }).join(' <span class="arrow">→</span> '); }
      else if (p.length) { t.innerHTML = '<span class="tag plain">' + AI[p[0].who].name + " 단독</span>"; s.textContent = AI[p[0].who].name + " 혼자 만듭니다. 다른 AI 키도 넣으면 서로 상의합니다."; }
      else { t.innerHTML = '<span class="tag plain">키 없음</span>'; s.textContent = "키가 없어 기본 모드로 만듭니다 (문장 추출 요약 + 핵심어 문제)."; }
      $("#slead").disabled = $("#srounds").disabled = p.length < 2;
    }
    function drawFiles() { $("#sfiles").innerHTML = files.map(function (f, i) { return '<span class="tag plain">' + (f.kind === "pdf" ? "PDF" : "이미지") + " · " + esc(f.name) + ' <button class="stu-x" data-rm="' + i + '" aria-label="' + esc(f.name) + ' 빼기">×</button></span>'; }).join(""); }
    function msg(t) { var m = $("#smsg"); m.textContent = t || ""; m.hidden = !t; }
    function addFiles(fl) {
      Promise.all([].slice.call(fl).map(function (f) { return readFile(f).catch(function (e) { return { err: e.message }; }); })).then(function (rs) {
        var errs = [];
        rs.forEach(function (r) {
          if (r.err) errs.push(r.err);
          else if (r.kind === "text") ta.value = (ta.value ? ta.value + "\n\n" : "") + r.data;
          else files.push(r);
          if (!r.err && !$("#stitle").value) $("#stitle").value = r.name.replace(/\.[^.]+$/, "");
        });
        drawFiles(); msg(errs.join(" ")); keep();
      });
    }
    function keep() { draft = { title: $("#stitle").value, text: ta.value, focus: $("#sfocus").value }; }
    drawFiles(); teamState();
    ["#stitle", "#stext", "#sfocus"].forEach(function (s) { $(s).oninput = keep; });
    $("#sfile").onchange = function () { addFiles(this.files); this.value = ""; };
    var box = el.querySelector(".stu-in");
    box.addEventListener("dragover", function (e) { e.preventDefault(); box.classList.add("drop"); });
    box.addEventListener("dragleave", function () { box.classList.remove("drop"); });
    box.addEventListener("drop", function (e) { e.preventDefault(); box.classList.remove("drop"); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
    $("#sfiles").onclick = function (e) { var b = e.target.closest("[data-rm]"); if (b) { files.splice(+b.dataset.rm, 1); drawFiles(); } };
    $("#stypes").onclick = function (e) {
      var b = e.target.closest("[data-t]"); if (!b) return;
      cfg.types[b.dataset.t] = cfg.types[b.dataset.t] ? 0 : 1;
      if (!Object.keys(cfg.types).some(function (t) { return cfg.types[t]; })) cfg.types[b.dataset.t] = 1;
      b.classList.toggle("on", !!cfg.types[b.dataset.t]); b.setAttribute("aria-pressed", !!cfg.types[b.dataset.t]); save();
    };
    $("#sn").onchange = function () { cfg.n = +this.value; save(); };
    $("#slv").onchange = function () { cfg.level = this.value; save(); };
    $("#slead").onchange = function () { cfg.lead = this.value; save(); teamState(); };
    $("#srounds").onchange = function () { cfg.rounds = +this.value; save(); teamState(); };
    ["claude", "gpt"].forEach(function (w) {
      $("#k-" + w).oninput = function () { keys[w] = this.value.trim(); saveKeys(); teamState(); };
      $("#m-" + w).onchange = function () { cfg[w + "Model"] = this.value.trim() || AI[w].models[0][0]; save(); };
    });
    $("#srem").onchange = function () { remember = this.checked; saveKeys(); };
    $("#slib").onclick = function (e) {
      var d = e.target.closest("[data-del]");
      if (d) {
        e.stopPropagation();
        if (d.dataset.sure) { st.items = st.items.filter(function (x) { return x.id !== d.dataset.del; }); save(); home(); }
        else { d.dataset.sure = 1; d.textContent = "정말 삭제"; d.classList.add("bad"); }
        return;
      }
      var o = e.target.closest("[data-open]"); if (o) go(o.dataset.open);
    };
    $("#sgo").onclick = function () {
      if (busy) return;
      keep(); msg("");
      var text = draft.text.trim(), title = draft.title.trim();
      cfg.focus = draft.focus.trim();
      if (!text && !files.length) { msg("자료를 붙여 넣거나 파일을 골라 주세요."); ta.focus(); return; }
      if (text.length > MAX_TEXT) { msg("자료가 너무 깁니다(" + text.length.toLocaleString() + "자). " + MAX_TEXT.toLocaleString() + "자 이하로 나눠서 넣어 주세요."); return; }
      var set = aiSet(), steps = S.plan(set);
      if (!steps.length) {
        if (files.length && !text) { msg("PDF·이미지는 AI 모드에서만 읽을 수 있습니다. 오른쪽 AI 팀에 키를 넣거나 내용을 텍스트로 붙여 넣어 주세요."); return; }
        if (S.splitSents(text).length < 3) { msg("기본 모드는 문장이 세 개 이상인 자료가 필요합니다. 더 긴 자료를 넣거나 AI 키를 넣어 주세요."); return; }
        var r = S.buildLocal(text, cfg);
        return finish("local", title || r.title, text, r, files.length ? "PDF·이미지는 키가 없어 빼고 텍스트만 썼습니다." : "");
      }
      var pdfs = files.filter(function (f) { return f.kind === "pdf"; });
      if (pdfs.length > 1) { msg("PDF는 한 번에 하나씩 넣어 주세요."); return; }
      var src = { text: text, name: title || (pdfs[0] && pdfs[0].name), pdf: pdfs[0] && pdfs[0].data, images: files.filter(function (f) { return f.kind === "image"; }) };
      busy = true; this.disabled = true;
      var prog = $("#sprog"), t0 = Date.now(), state = steps.map(function () { return { s: "wait" }; });
      function drawProg() {
        prog.hidden = false;
        prog.innerHTML = '<ol class="steps-live">' + steps.map(function (x, i) {
          var s = state[i];
          return '<li class="sl sl-' + s.s + " sl-" + x.who + '"><span class="dot"></span><div>' + who(x.who) + " " + KIND[x.kind] +
            '<small>' + (s.s === "run" ? "진행 중" + (s.chars ? " · " + s.chars.toLocaleString() + "자" : "") + " · " + Math.round((Date.now() - s.t) / 1000) + "초" : s.s === "done" ? "완료 · " + s.sec + "초" : "대기") + "</small></div></li>";
        }).join("") + "</ol>";
      }
      var timer = setInterval(drawProg, 1000); drawProg();
      S.generate(src, cfg, set, function (ev) {
        var s = state[ev.i];
        if (ev.state === "run") { if (s.s !== "run") { s.s = "run"; s.t = Date.now(); } if (ev.chars) s.chars = ev.chars; }
        else { s.s = "done"; s.sec = Math.round((Date.now() - s.t) / 1000); }
        drawProg();
      }).then(function (r) {
        clearInterval(timer); busy = false;
        finish("ai", title || r.title, text, r, r.partial ? "상의 도중 오류가 나서 마지막으로 끝난 단계까지의 결과를 저장했습니다: " + r.partial : "");
      }, function (e) {
        clearInterval(timer); busy = false;
        var b = $("#sgo"); if (b) b.disabled = false;
        msg(e.message); prog.hidden = true;
      });
    };
  }
  function aiRow(w, ph, models, cur) {
    var listed = models.some(function (m) { return m[0] === cur; });
    return '<div class="ai-row ai-' + w + '"><div class="ai-name">' + who(w) + "</div>" +
      '<input id="k-' + w + '" type="password" class="stu-text" placeholder="' + AI[w].name + " API 키 (" + ph + ')" value="' + esc(keys[w]) + '" autocomplete="off" aria-label="' + AI[w].name + ' API 키">' +
      (w === "gpt"
        ? '<input id="m-gpt" class="stu-text" list="gpt-models" value="' + esc(cur) + '" aria-label="GPT 모델"><datalist id="gpt-models">' + models.map(function (m) { return '<option value="' + m[0] + '">'; }).join("") + "</datalist>"
        : '<select id="m-claude" aria-label="Claude 모델">' + models.map(function (m) { return '<option value="' + m[0] + '"' + (m[0] === cur ? " selected" : "") + ">" + m[1] + "</option>"; }).join("") + (listed ? "" : '<option selected value="' + esc(cur) + '">' + esc(cur) + "</option>") + "</select>") +
      "</div>";
  }
  function finish(mode, title, text, result, note) {
    var it = { id: String(Date.now()), title: title || "제목 없음", created: Date.now(), mode: mode, text: text.slice(0, MAX_SAVE_TEXT), result: result, ans: {}, note: note };
    st.items.unshift(it);
    if (!save()) it.note = (note ? note + " " : "") + "브라우저 저장 공간이 부족해 이 자료가 저장되지 않을 수 있습니다.";
    files = []; draft = { title: "", text: "", focus: "" };
    go(it.id);
  }

  /* ---------- 자료 화면 ---------- */
  var cur = null, tab = "sum", qFilter = "all";
  function go(id) { location.hash = id ? "#item-" + id : ""; }
  function open(id) {
    cur = st.items.filter(function (x) { return x.id === id; })[0];
    if (!cur) return home();
    tab = "sum"; qFilter = "all"; draw(); window.scrollTo(0, 0);
  }
  function stats() { var a = cur.ans, done = Object.keys(a).length, ok = Object.keys(a).filter(function (k) { return a[k].ok; }).length; return { done: done, ok: ok, wrong: done - ok, n: (cur.result.questions || []).length }; }
  function draw() {
    var r = cur.result, s = stats(), log = r.log || [];
    var tabs = [["sum", "요약"], ["terms", "용어 카드", (r.terms || []).length], ["quiz", "문제", s.n]];
    if (log.length) tabs.push(["talk", "상의 기록", log.length]);
    tabs.push(["src", "원문"]);
    el.innerHTML =
      '<div class="item">' +
      '<nav class="side-nav" aria-label="자료 메뉴">' +
        '<button class="btn sm" id="sback">← 보관함</button>' +
        '<div class="side-title"><small>' + fmtDate(cur.created) + "</small><h2>" + esc(cur.title) + "</h2>" + modeTag(cur) + (cur.source ? '<small class="src">출처: ' + esc(cur.source) + "</small>" : "") + "</div>" +
        '<div class="vtabs" role="tablist">' + tabs.map(function (t) { return '<button role="tab" aria-selected="' + (tab === t[0]) + '" class="vtab' + (tab === t[0] ? " on" : "") + '" data-tab="' + t[0] + '">' + t[1] + (t[2] != null ? '<span class="num">' + t[2] + "</span>" : "") + "</button>"; }).join("") + "</div>" +
        '<div class="side-score"><small>문제 풀이</small><b class="num" id="sscore">' + s.ok + " / " + s.done + '</b><small id="sscore2">' + s.n + "문제 중 " + s.done + "개 풀이" + (s.done ? " · 정답률 " + Math.round(s.ok / s.done * 100) + "%" : "") + '</small><div class="bar"><i id="sbar" style="width:' + (s.n ? s.done / s.n * 100 : 0) + '%"></i></div></div>' +
      "</nav>" +
      '<div class="item-main">' +
        (r.note || cur.note ? '<p class="stu-note">' + esc([r.note, cur.note].filter(Boolean).join(" ")) + "</p>" : "") +
        '<div id="sbody"></div>' +
      "</div></div>";
    var body = el.querySelector("#sbody");
    if (tab === "sum") drawSum(body, r);
    else if (tab === "terms") drawTerms(body, r);
    else if (tab === "quiz") drawQuiz(body);
    else if (tab === "talk") drawTalk(body, r);
    else body.innerHTML = cur.text ? '<div class="panel stu-src">' + esc(cur.text).replace(/\n/g, "<br>") + "</div>" + (cur.text.length >= MAX_SAVE_TEXT ? '<p class="stu-mut">원문은 앞부분 ' + MAX_SAVE_TEXT.toLocaleString() + "자만 저장됩니다.</p>" : "")
      : '<div class="empty">저장된 원문이 없습니다 (PDF·이미지로 넣었거나 저장 공간 때문에 지워졌습니다).</div>';
    el.querySelector("#sback").onclick = function () { go(""); };
    el.querySelectorAll("[data-tab]").forEach(function (b) { b.onclick = function () { tab = b.dataset.tab; draw(); window.scrollTo(0, 0); }; });
  }
  function drawSum(body, r) {
    var s = r.summary || {};
    body.innerHTML = '<div class="sum-grid">' +
      (s.one_line ? '<div class="panel stu-one"><small>한 줄 요약</small><p>' + esc(s.one_line) + "</p></div>" : "") +
      ((s.key_points || []).length ? '<div class="panel"><h3>핵심 정리</h3><ul class="stu-ul">' + s.key_points.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul></div>" : "") +
      ((s.sections || []).length ? '<div class="panel notes"><h3>정리 노트</h3>' + s.sections.map(function (x) { return '<h4 class="stu-h4">' + esc(x.heading) + '</h4><p class="stu-p">' + esc(x.body) + "</p>"; }).join("") + "</div>" : "") +
      "</div>" +
      '<div class="row"><button class="btn primary" data-tab="quiz">문제 풀기 →</button><button class="btn" data-tab="terms">용어 카드</button>' + ((r.log || []).length ? '<button class="btn" data-tab="talk">두 AI의 상의 기록 보기</button>' : "") + "</div>";
  }
  function drawTerms(body, r) {
    var ts = r.terms || [];
    body.innerHTML = ts.length ? '<div class="row" style="justify-content:space-between"><p class="stu-mut" style="margin:0">카드를 누르면 뜻이 보입니다. 먼저 스스로 떠올려 보세요.</p><button class="btn" id="sflip">모두 뒤집기</button></div><div class="stu-cards">' + ts.map(function (t, i) {
      return '<button class="stu-card" data-i="' + i + '" aria-expanded="false"><b>' + esc(t.term) + '</b><span class="stu-def" hidden>' + esc(t.definition) + '</span><span class="stu-hint">눌러서 뜻 보기</span></button>';
    }).join("") + "</div>" : '<div class="empty">이 자료에서 뽑은 용어가 없습니다.</div>';
    var all = false;
    function set(c, open) { c.querySelector(".stu-def").hidden = !open; c.querySelector(".stu-hint").hidden = open; c.setAttribute("aria-expanded", open); }
    var fb = body.querySelector("#sflip"); if (fb) fb.onclick = function () { all = !all; body.querySelectorAll(".stu-card").forEach(function (c) { set(c, all); }); };
    body.onclick = function (e) { var c = e.target.closest(".stu-card"); if (c) set(c, c.querySelector(".stu-def").hidden); };
  }

  /* ---------- 문제 ---------- */
  function drawQuiz(body) {
    var qs = cur.result.questions || [], a = cur.ans, s = stats();
    var idx = qs.map(function (q, i) { return i; }).filter(function (i) { return qFilter === "all" || (qFilter === "wrong" ? a[i] && !a[i].ok : !a[i]); });
    body.innerHTML =
      '<div class="scorebar row" style="justify-content:space-between"><span class="row">' + [["all", "전체 " + s.n], ["todo", "안 푼 문제 " + (s.n - s.done)], ["wrong", "틀린 문제 " + s.wrong]].map(function (f) { return '<button class="chip' + (qFilter === f[0] ? " on" : "") + '" data-f="' + f[0] + '">' + f[1] + "</button>"; }).join("") + "</span>" +
      '<button class="btn sm" id="sreset">다시 풀기</button></div>' +
      '<div class="qgrid">' + (idx.length ? idx.map(function (i) { return qHtml(qs[i], i); }).join("") : '<div class="empty">' + (qFilter === "wrong" ? "틀린 문제가 없습니다." : "모두 풀었습니다.") + "</div>") + "</div>";
    body.querySelectorAll(".stu-q").forEach(function (c) { var i = +c.dataset.q; if (a[i]) showAns(c, qs[i], a[i]); });
    body.onclick = onQuizClick;
  }
  function qHtml(q, i) {
    var opts = q.type === "ox" ? ["O", "X"] : (q.options || []);
    return '<div class="qcard stu-q" data-q="' + i + '" id="sq' + i + '">' +
      '<div class="qhead"><span class="tag num">' + (i + 1) + '</span><span class="tag plain">' + (TYPE_NAMES[q.type] || q.type) + "</span></div>" +
      '<div class="stem">' + esc(q.question).replace(/\n/g, "<br>").replace(/_{3,}/g, '<span class="blank"></span>') + "</div>" +
      (q.type === "short" || !opts.length
        ? '<textarea class="stu-text stu-ans" rows="3" placeholder="답을 적어 보세요" aria-label="' + (i + 1) + '번 답"></textarea><div class="row"><button class="btn primary" data-show>정답 확인</button></div>'
        : '<div class="opts' + (q.type === "ox" ? " stu-ox" : "") + '">' + opts.map(function (o, k) { return '<button class="opt" data-o="' + k + '"><span class="bubble">' + (q.type === "ox" ? o : k + 1) + '</span><span class="otext">' + (q.type === "ox" ? (o === "O" ? "맞다" : "틀리다") : esc(o)) + "</span></button>"; }).join("") + "</div>") +
      '<div class="stu-res"></div></div>';
  }
  function norm(s) { return String(s || "").replace(/^\s*[①②③④⑤1-5][.)]?\s*/, "").trim().toLowerCase(); }
  var VERDICT = { correct: "정답", partial: "부분 정답", wrong: "오답" };
  function gradeHtml(g) {
    if (!g) return "";
    if (g.error) return '<p class="stu-err">' + esc(g.error) + "</p>";
    var last = g.rounds[g.rounds.length - 1], ws = Object.keys(last);
    return '<div class="grade"><div class="grade-head"><b>AI 채점</b>' + (ws.length > 1 ? (g.agreed ? '<span class="tag good">두 AI 의견 일치 · ' + VERDICT[g.verdict] + "</span>" : '<span class="tag">의견이 갈림 · 직접 판단해 주세요</span>') : '<span class="tag plain">' + AI[ws[0]].name + " 단독</span>") +
      (g.rounds.length > 1 ? '<small class="stu-mut">처음엔 의견이 달라서 서로의 채점을 보고 다시 판단했습니다.</small>' : "") + "</div>" +
      ws.map(function (w) {
        var x = last[w], f = g.rounds[0][w];
        return '<div class="gline gl-' + w + '">' + who(w) + ' <b class="v-' + x.verdict + '">' + VERDICT[x.verdict] + " · " + x.score + "점</b>" + (g.rounds.length > 1 && f.verdict !== x.verdict ? ' <small class="stu-mut">(처음 ' + VERDICT[f.verdict] + "에서 바꿈)</small>" : "") +
          "<p>" + esc(x.feedback) + "</p>" + (x.reply ? '<p class="stu-mut">“' + esc(x.reply) + "”</p>" : "") + "</div>";
      }).join("") + "</div>";
  }
  function showAns(card, q, rec) {
    card.querySelectorAll(".opt").forEach(function (o) {
      o.disabled = true;
      var txt = q.type === "ox" ? (o.dataset.o === "0" ? "O" : "X") : (q.options || [])[+o.dataset.o];
      if (norm(txt) === norm(q.answer)) o.classList.add("correct");
      else if (rec.pick != null && String(rec.pick) === o.dataset.o) o.classList.add("wrong");
    });
    var short = q.type === "short" || (!(q.options || []).length && q.type !== "ox");
    var ta = card.querySelector(".stu-ans"); if (ta) { ta.value = rec.text || ""; ta.disabled = true; var sb = card.querySelector("[data-show]"); if (sb) sb.parentNode.remove(); }
    var canAI = keys.claude || keys.gpt;
    card.querySelector(".stu-res").innerHTML = '<div class="explain">' +
      (short ? "" : '<p class="' + (rec.ok ? "ok" : "ng") + '"><b>' + (rec.ok ? "정답" : "오답") + "</b></p>") +
      "<p><b>" + (short ? "모범 답안" : "정답") + "</b> " + esc(q.answer) + "</p>" +
      (q.explanation ? "<p>" + esc(q.explanation) + "</p>" : "") +
      (q.evidence ? '<p class="stu-ev">근거: “' + esc(q.evidence) + "”</p>" : "") +
      (short ? gradeHtml(rec.ai) : "") +
      (short && rec.self == null ? '<div class="row self"><span class="stu-mut">내 답이 맞았나요?</span><button class="btn good sm" data-self="1">맞았어요</button><button class="btn bad sm" data-self="0">틀렸어요</button>' + (canAI && !rec.ai ? '<button class="btn sm" data-grade>' + (keys.claude && keys.gpt ? "Claude·GPT에게 채점 맡기기" : "AI에게 채점 맡기기") + "</button>" : "") + '<span class="stu-mut gmsg"></span></div>' : "") +
      (short && rec.self != null ? '<p class="' + (rec.ok ? "ok" : "ng") + '"><b>' + (rec.by === "ai" ? VERDICT[rec.ai.verdict] : rec.ok ? "맞음" : "틀림") + "</b> (" + (rec.by === "ai" ? (Object.keys(rec.ai.rounds[0]).length > 1 ? "두 AI의 일치된 채점" : "AI 채점") + (rec.ai.verdict === "partial" ? " · 틀린 문제에 넣어 다시 풀게 했어요" : "") : "스스로 채점") + ")</p>" : "") +
      "</div>";
  }
  function onQuizClick(e) {
    var qs = cur.result.questions, card = e.target.closest(".stu-q");
    var f = e.target.closest("[data-f]"); if (f) { qFilter = f.dataset.f; drawQuiz(el.querySelector("#sbody")); return; }
    if (e.target.id === "sreset") {
      if (e.target.dataset.sure) { cur.ans = {}; save(); qFilter = "all"; draw(); }
      else { e.target.dataset.sure = 1; e.target.textContent = "기록 지우고 다시 풀기"; e.target.classList.add("bad"); }
      return;
    }
    if (!card) return;
    var i = +card.dataset.q, q = qs[i], rec = cur.ans[i];
    var o = e.target.closest(".opt");
    if (o && !o.disabled) {
      var txt = q.type === "ox" ? (o.dataset.o === "0" ? "O" : "X") : q.options[+o.dataset.o];
      cur.ans[i] = { ok: norm(txt) === norm(q.answer), pick: +o.dataset.o };
      save(); showAns(card, q, cur.ans[i]); upd(); return;
    }
    if (e.target.closest("[data-show]")) { cur.ans[i] = { ok: false, text: card.querySelector(".stu-ans").value, self: null }; save(); showAns(card, q, cur.ans[i]); upd(); return; }
    var sf = e.target.closest("[data-self]");
    if (sf) { rec.self = +sf.dataset.self; rec.ok = !!rec.self; rec.by = "me"; save(); showAns(card, q, rec); upd(); return; }
    var gb = e.target.closest("[data-grade]");
    if (gb) {
      gb.disabled = true;
      var gm = card.querySelector(".gmsg");
      S.grade(q, rec.text, aiSet(), function (t) { gm.textContent = t; }).then(function (g) {
        rec.ai = g;
        if (g.agreed) { rec.ok = g.verdict === "correct"; rec.self = rec.ok ? 1 : 0; rec.by = "ai"; }
        save(); showAns(card, q, rec); upd();
      }, function (err) { rec.ai = { error: err.message }; showAns(card, q, rec); delete rec.ai; });
    }
  }
  function upd() {
    var s = stats();
    var a = el.querySelector("#sscore"); if (a) a.textContent = s.ok + " / " + s.done;
    var b = el.querySelector("#sscore2"); if (b) b.textContent = s.n + "문제 중 " + s.done + "개 풀이" + (s.done ? " · 정답률 " + Math.round(s.ok / s.done * 100) + "%" : "");
    var c = el.querySelector("#sbar"); if (c) c.style.width = (s.n ? s.done / s.n * 100 : 0) + "%";
    var chips = el.querySelectorAll(".scorebar [data-f]");
    if (chips.length) { chips[0].textContent = "전체 " + s.n; chips[1].textContent = "안 푼 문제 " + (s.n - s.done); chips[2].textContent = "틀린 문제 " + s.wrong; }
  }

  /* ---------- 상의 기록 ---------- */
  var VLABEL = { good: "좋음", fix: "수정 필요", replace: "교체 필요" };
  function drawTalk(body, r) {
    var t = r.team || {}, log = r.log || [];
    var head = t.solo ? AI[t.solo].name + " 혼자 만들었습니다." :
      AI[t.lead].name + "가 초안을 쓰고 " + AI[t.lead === "claude" ? "gpt" : "claude"].name + "가 검토했습니다. 검토 " + t.rounds + "번.";
    body.innerHTML = '<div class="talk-head"><h3>두 AI의 상의 기록</h3><p class="stu-mut">' + esc(head) + (t.models ? " 모델: " + esc(t.models.claude) + " · " + esc(t.models.gpt) : "") + "</p></div>" +
      '<div class="talk">' + log.map(function (m) {
        var d = m.data, h = "";
        if (m.kind === "draft" || m.kind === "solo") h = "<p>" + (m.kind === "draft" ? "초안을 만들었어요." : "자료를 만들었어요.") + " 문제 " + d.questions + "개, 용어 " + d.terms + "개.</p>" + (d.one_line ? '<p class="q">“' + esc(d.one_line) + "”</p>" : "");
        else if (m.kind === "review") {
          var bad = d.question_reviews.filter(function (x) { return x.verdict !== "good"; });
          h = "<p>" + esc(d.overall) + "</p>" +
            list("요약에 대한 의견", d.summary_feedback) + list("빠진 핵심 내용", d.missing_points) + list("용어에 대한 의견", d.term_feedback) +
            '<div class="qrev"><b>문제별 검토</b> <span class="stu-mut">좋음 ' + (d.question_reviews.length - bad.length) + " · 고칠 점 " + bad.length + "</span>" +
            (bad.length ? "<ul>" + bad.map(function (x) { return '<li><span class="tag ' + (x.verdict === "replace" ? "" : "plain") + '">' + x.number + "번 " + VLABEL[x.verdict] + "</span> " + esc(x.comment) + "</li>"; }).join("") + "</ul>" : "") + "</div>";
        } else if (m.kind === "revise") {
          h = "<p>" + esc(d.message) + "</p>" + list("반영한 점", d.accepted) +
            ((d.rejected || []).length ? '<div class="lst"><b>반영하지 않은 점</b><ul>' + d.rejected.map(function (x) { return "<li>" + esc(x.point) + ' <span class="stu-mut">— 이유: ' + esc(x.reason) + "</span></li>"; }).join("") + "</ul></div>" : "");
        }
        return '<div class="msg msg-' + m.who + '"><div class="msg-head">' + who(m.who) + " <b>" + KIND[m.kind] + '</b><small class="stu-mut">' + m.sec + "초</small></div>" + h + "</div>";
      }).join("") + "</div>" +
      (r.partial ? '<p class="stu-err">상의가 끝까지 진행되지 못했습니다: ' + esc(r.partial) + "</p>" : "");
  }
  function list(t, xs) { return (xs || []).length ? '<div class="lst"><b>' + t + "</b><ul>" + xs.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>" : ""; }

  /* ---------- 주소 ---------- */
  function route() {
    var m = location.hash.match(/^#item-(.+)$/);
    if (m) open(m[1]); else { cur = null; home(); window.scrollTo(0, 0); }
  }
  window.addEventListener("hashchange", route);
  route();
})();
