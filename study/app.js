/* 자료 학습 노트: 화면 (태블릿·노트북 기준)
   - 첫 화면: 왼쪽 새 자료 입력 / 오른쪽 AI(Claude) 설정·보관함
   - 자료 화면: 왼쪽 메뉴(요약·용어 카드·문제·질문하기·검토 기록·원문) / 오른쪽 내용
   주소: # 없음 = 첫 화면, #item-<id> = 자료 하나.
   로직: local.js(기본 모드), ai.js(claude.ai 요금제로 Claude 쓰기), sets.js(기본 제공 세트). */
(function () {
  "use strict";
  var S = window.Study, ROLES = S.ROLES, TYPE_NAMES = S.TYPE_NAMES;
  var SKEY = "study-notes-v1";
  var MAX_TEXT = 300000, MAX_SAVE_TEXT = 60000;
  var KIND = { draft: "초안 작성", review: "검토", revise: "검토 반영·수정", solo: "자료 만들기" };
  var PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";

  /* ---------- 저장 ---------- */
  var st = { items: [], presetsAdded: {}, cfg: { n: 10, level: "보통", types: { mcq: 1, ox: 1, blank: 1, short: 1 }, tier: "default", rounds: 1 } };
  try {
    var sv = JSON.parse(localStorage.getItem(SKEY) || "null");
    if (sv) { st.items = sv.items || []; st.presetsAdded = sv.presetsAdded || {}; Object.assign(st.cfg, sv.cfg || {}); }
    // 예전 버전의 API 키는 더 이상 쓰지 않으므로 지운다.
    localStorage.removeItem("study-notes-keys"); localStorage.removeItem("study-notes-key");
  } catch (e) {}
  if (st.cfg.rounds == null || st.cfg.rounds > 2) st.cfg.rounds = 1;
  if (!/^(quick|default|complex)$/.test(st.cfg.tier)) st.cfg.tier = "default";
  // 사용량 아끼기 모드: 처음 한 번 기본으로 켠다(빠르게 · 검토 없음 · PDF 그림 쪽 전송 끔).
  var SAVER = { tier: "quick", rounds: 0 }, NORMAL = { tier: "default", rounds: 1 };
  if (!st.cfg.saverSet) { st.cfg.saverSet = 1; st.cfg.saver = true; st.cfg.tier = SAVER.tier; st.cfg.rounds = SAVER.rounds; }
  function save(strict) {
    try { localStorage.setItem(SKEY, JSON.stringify(st)); return true; }
    catch (e) {
      if (strict) return false; // 그림 붙이기처럼 실패해도 되는 저장은 원문을 지우지 않는다
      for (var i = st.items.length - 1; i >= 0; i--) { if (st.items[i].text && !st.items[i].preset) { st.items[i].text = ""; try { localStorage.setItem(SKEY, JSON.stringify(st)); return true; } catch (e2) {} } }
      return false;
    }
  }
  // 기본 제공 세트를 처음 한 번만 보관함 맨 위에 넣는다. 지운 세트는 다시 넣지 않는다.
  // 이미 넣은 세트는 새 판(ver)이 나오면 내용만 바꾸고 풀이 기록은 그대로 둔다(문제는 뒤에만 추가되므로 번호가 유지됨).
  (S.PRESETS || []).slice().reverse().forEach(function (p) {
    var ver = p.ver || 1;
    if (st.presetsAdded[p.id]) {
      var it = st.items.filter(function (x) { return x.id === p.id; })[0];
      if (it && (it.presetVer || 1) < ver) { it.result = JSON.parse(JSON.stringify(p.result)); it.text = p.text; it.title = p.title; it.source = p.source; it.presetVer = ver; it.updatedNote = true; }
      return;
    }
    st.items.unshift({ id: p.id, title: p.title, created: Date.now(), mode: "preset", preset: true, presetVer: ver, source: p.source, text: p.text, result: JSON.parse(JSON.stringify(p.result)), ans: {} });
    st.presetsAdded[p.id] = ver;
  });
  save();

  /* ---------- Claude 연결 상태 ---------- */
  var aiState = "checking"; // checking | on | off
  var imgLimits = null;
  S.ai().then(function (s) {
    aiState = s ? "on" : "off";
    if (s) S.imageLimits().then(function (l) { imgLimits = l; refreshAI(); });
    refreshAI();
  });
  function refreshAI() { var f = el._aiRefresh; if (typeof f === "function") f(); }

  /* ---------- 공통 ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmtDate(t) { var d = new Date(t); return (d.getMonth() + 1) + "/" + d.getDate() + " " + d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0"); }
  function who(w) { return '<span class="who who-' + w + '">' + (w === "writer" || w === "reviewer" ? "Claude " : "") + (ROLES[w] || { name: w }).name + "</span>"; }
  function modeTag(it) {
    var r = it.result || {};
    if (it.preset) return '<span class="tag good">기본 제공 · Claude 제작</span>';
    if (it.mode !== "ai") return '<span class="tag plain">기본 모드</span>';
    if (r.team && r.team.claude) return '<span class="tag duo">Claude' + (r.team.rounds ? " · 검토 " + r.team.rounds + "번" : "") + "</span>";
    if (r.team && r.team.solo) return '<span class="tag plain">' + (ROLES[r.team.solo] || { name: "AI" }).name + "</span>";
    return '<span class="tag duo">Claude × GPT</span>';
  }
  var el = document.getElementById("app");
  function setHdr() { var h = document.querySelector("header.top"); if (h) document.documentElement.style.setProperty("--hdr", h.offsetHeight + "px"); }
  setHdr(); window.addEventListener("resize", setHdr);

  /* ---------- PDF 읽기 (pdf.js, 브라우저 안에서) ---------- */
  var pdfLib = null;
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = function () { rej(new Error("PDF 읽기 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.")); }; document.head.appendChild(s); }); }
  function getPdfLib() {
    // 워커 파일을 먼저 스크립트로 불러 두면(pdfjsWorker) pdf.js가 별도 워커 없이 이 페이지에서 처리한다.
    if (!pdfLib) pdfLib = loadScript(PDFJS + "pdf.worker.min.js").then(function () { return loadScript(PDFJS + "pdf.min.js"); }).then(function () {
      var lib = window.pdfjsLib; if (!lib) throw new Error("PDF 읽기 도구를 불러오지 못했습니다.");
      return lib;
    }, function (e) { pdfLib = null; throw e; });
    return pdfLib;
  }
  function openPdf(buf) { return getPdfLib().then(function (lib) { return lib.getDocument({ data: buf, isEvalSupported: false }).promise; }); }
  function pdfText(doc, from, to) {
    var out = [], p = Promise.resolve();
    for (var n = from; n <= to; n++) (function (n) {
      p = p.then(function () { return doc.getPage(n); }).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
        var lines = [], line = "", lastY = null;
        tc.items.forEach(function (it) {
          var y = it.transform ? Math.round(it.transform[5]) : null;
          if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) { if (line.trim()) lines.push(line.trim()); line = ""; }
          line += it.str + (it.hasEOL ? "\n" : ""); lastY = y;
        });
        if (line.trim()) lines.push(line.trim());
        var t = lines.join("\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
        if (t) out.push("[p." + n + "]\n" + t);
      });
    })(n);
    return p.then(function () { return out.join("\n\n"); });
  }

  // 그림이 있거나 글자가 거의 없는 쪽을 골라(그림이 있는 쪽 먼저, 글자가 적은 쪽 먼저) 최대 max쪽까지
  function figurePages(doc, from, to, max) {
    if (max <= 0) return Promise.resolve([]);
    var lib = window.pdfjsLib, OPS = lib && lib.OPS || {}, IMG = [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintJpegXObject].filter(function (x) { return x != null; });
    var info = [], p = Promise.resolve();
    for (var n = from; n <= to; n++) (function (n) {
      p = p.then(function () { return doc.getPage(n); }).then(function (pg) {
        return Promise.all([pg.getOperatorList(), pg.getTextContent()]).then(function (r) {
          var img = r[0].fnArray.some(function (f) { return IMG.indexOf(f) >= 0; });
          var len = r[1].items.reduce(function (a, it) { return a + it.str.replace(/\s+/g, "").length; }, 0);
          if (img || len < 40) info.push({ n: n, img: img, len: len });
        });
      });
    })(n);
    return p.then(function () {
      return info.sort(function (a, b) { return (b.img - a.img) || (a.len - b.len); }).slice(0, max).sort(function (a, b) { return a.n - b.n; }).map(function (x) { return x.n; });
    });
  }
  function pageImage(doc, n) {
    return doc.getPage(n).then(function (pg) {
      var v1 = pg.getViewport({ scale: 1 }), scale = Math.min(2, 1400 / v1.width), v = pg.getViewport({ scale: scale });
      var c = document.createElement("canvas"); c.width = Math.round(v.width); c.height = Math.round(v.height);
      var ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      return pg.render({ canvasContext: ctx, viewport: v }).promise.then(function () {
        return new Promise(function (res) { c.toBlob(function (b) { res(b); }, "image/jpeg", 0.85); });
      });
    });
  }

  /* ---------- 파일 읽기 ---------- */
  function readFile(f) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onerror = function () { rej(new Error(f.name + "을(를) 읽지 못했습니다.")); };
      if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
        r.onload = function () { openPdf(new Uint8Array(r.result)).then(function (doc) { res({ kind: "pdf", name: f.name, doc: doc, pages: doc.numPages, from: 1, to: doc.numPages, figs: !st.cfg.saver }); }, function (e) { rej(new Error(f.name + ": PDF를 열지 못했습니다. " + (e.message || ""))); }); };
        r.readAsArrayBuffer(f);
      } else if (/^image\/(png|jpeg|gif|webp)$/.test(f.type)) res({ kind: "image", name: f.name, type: f.type, blob: f });
      else if (/\.(txt|md|csv|tsv|html?|json|srt|vtt)$/i.test(f.name) || /^text\//.test(f.type)) {
        r.onload = function () { var t = String(r.result); if (/\.html?$/i.test(f.name)) { var d = document.createElement("div"); d.innerHTML = t; t = d.textContent; } res({ kind: "text", name: f.name, data: t }); }; r.readAsText(f);
      } else rej(new Error(f.name + ": 지원하지 않는 형식입니다. 텍스트(.txt .md), PDF, 이미지(PNG·JPG)를 넣어 주세요. Word·한글 파일은 PDF로 저장하거나 내용을 복사해 붙여 넣어 주세요."));
    });
  }

  /* ---------- 첫 화면 ---------- */
  var files = [], draft = { title: "", text: "", focus: "" }, busy = null;
  function home() {
    var cfg = st.cfg;
    el._aiRefresh = null;
    el.innerHTML =
      '<div class="home">' +
      '<section class="col-main">' +
        '<div><div class="eyebrow">새 자료</div><h2>자료로 요약·문제 만들기</h2><p class="lead">교재·강의 PDF·필기·지문을 넣으면 Claude가 요약, 정리 노트, 용어 카드, 연습 문제를 만듭니다. 검토를 켜면 Claude 검토자가 초안을 원문과 대조해 지적하고, 작성자가 그 의견을 따져 보고 고칩니다.</p></div>' +
        '<div class="panel stu-in">' +
          '<label class="fld"><span>제목</span><input id="stitle" class="stu-text" placeholder="비우면 자동으로 붙습니다" maxlength="80" value="' + esc(draft.title) + '"></label>' +
          '<label class="fld"><span>자료</span><textarea id="stext" class="stu-text" rows="12" placeholder="내용을 붙여 넣거나, 아래에서 파일을 고르세요. 이 칸에 파일을 끌어다 놓아도 됩니다.">' + esc(draft.text) + "</textarea></label>" +
          '<div class="row"><label class="btn" for="sfile">파일 선택</label><input type="file" id="sfile" multiple accept=".txt,.md,.csv,.tsv,.html,.htm,.json,.srt,.vtt,.pdf,image/png,image/jpeg,image/gif,image/webp" hidden>' +
          '<small class="stu-mut">PDF(쪽 범위 선택 가능) · 텍스트 · 이미지(사진 찍은 필기·교재)</small></div>' +
          '<div id="sfiles" class="files"></div>' +
          '<div class="opts-grid">' +
            '<label class="fld"><span>문제 수</span><select id="sn">' + [5, 10, 15, 20, 30].map(function (n) { return "<option" + (n === cfg.n ? " selected" : "") + ">" + n + "</option>"; }).join("") + "</select></label>" +
            '<label class="fld"><span>난이도</span><select id="slv">' + ["쉬움", "보통", "어려움"].map(function (l) { return "<option" + (l === cfg.level ? " selected" : "") + ">" + l + "</option>"; }).join("") + "</select></label>" +
            '<div class="fld wide"><span>문제 유형</span><div class="row" id="stypes">' + Object.keys(TYPE_NAMES).map(function (t) { return '<button class="chip' + (cfg.types[t] ? " on" : "") + '" data-t="' + t + '" aria-pressed="' + !!cfg.types[t] + '">' + TYPE_NAMES[t] + "</button>"; }).join("") + "</div></div>" +
            '<label class="fld wide"><span>집중할 부분 (선택)</span><input id="sfocus" class="stu-text" placeholder="예: 힙 정렬과 외부 정렬 위주로" maxlength="200" value="' + esc(draft.focus) + '"></label>' +
          "</div>" +
          '<div class="go-row"><button class="btn primary big" id="sgo">요약·문제 만들기</button><button class="btn" id="sstop" hidden>중단</button><span id="sstatus" class="stu-mut"></span></div>' +
          '<div id="smsg" class="stu-err" role="alert" hidden></div>' +
          '<div id="sprog" hidden></div>' +
        "</div>" +
      "</section>" +
      '<aside class="col-side">' +
        '<div class="panel team">' +
          '<div class="row" style="justify-content:space-between"><h3>AI · Claude</h3><span id="tstate"></span></div>' +
          '<p class="stu-mut small" id="tinfo"></p>' +
          '<label class="chk saver"><input type="checkbox" id="ssaver"' + (cfg.saver ? " checked" : "") + '> <span><b>사용량 아끼기 모드</b><small>생각 수준 "빠르게", 검토 없음, PDF 그림 쪽 전송 끔. 요금제 사용량을 가장 적게 씁니다.</small></span></label>' +
          '<label class="fld"><span>생각 수준</span><select id="stier">' + S.TIERS.map(function (t) { return '<option value="' + t[0] + '"' + (cfg.tier === t[0] ? " selected" : "") + ">" + t[1] + "</option>"; }).join("") + "</select></label>" +
          '<label class="fld"><span>검토</span><select id="srounds"><option value="0"' + (+cfg.rounds === 0 ? " selected" : "") + '>검토 없이 빠르게</option><option value="1"' + (+cfg.rounds === 1 ? " selected" : "") + '>1번 (초안 → 검토 → 수정)</option><option value="2"' + (+cfg.rounds === 2 ? " selected" : "") + ">2번 (한 번 더 검토·수정)</option></select></label>" +
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
      var t = $("#tstate"), info = $("#tinfo"), s = $("#sstatus"); if (!t) return;
      if (aiState === "on") {
        t.innerHTML = '<span class="tag good">연결됨</span>';
        info.textContent = "내 claude.ai 요금제로 Claude를 씁니다. API 키나 별도 결제는 필요 없고, 쓴 만큼 요금제 사용량에서 차감됩니다. 처음 쓸 때 허락을 한 번 묻습니다.";
        var p = S.plan(cfg);
        s.innerHTML = p.map(function (x) { return who(x.who) + " " + KIND[x.kind]; }).join(' <span class="arrow">→</span> ');
      } else if (aiState === "off") {
        t.innerHTML = '<span class="tag plain">사용 불가</span>';
        info.textContent = "AI 기능은 claude.ai에서 이 페이지를 열었을 때만 쓸 수 있습니다. 지금은 AI 없이 기본 모드(문장 추출 요약 + 핵심어 문제)로 만듭니다.";
        s.textContent = "기본 모드로 만듭니다 (AI 없음, 무료).";
      } else { t.innerHTML = '<span class="tag plain">확인 중</span>'; info.textContent = "Claude 연결을 확인하고 있습니다…"; s.textContent = ""; }
      $("#stier").disabled = $("#srounds").disabled = aiState !== "on";
      drawFiles();
    }
    el._aiRefresh = teamState;
    function drawFiles() {
      var box = $("#sfiles"); if (!box) return;
      box.innerHTML = files.map(function (f, i) {
        if (f.kind === "pdf") return '<div class="file"><span class="tag plain">PDF</span><b>' + esc(f.name) + '</b><span class="stu-mut">' + f.pages + '쪽 중</span>' +
          '<input type="number" class="pg" data-pf="' + i + '" min="1" max="' + f.pages + '" value="' + f.from + '" aria-label="시작 쪽">~<input type="number" class="pg" data-pt="' + i + '" min="1" max="' + f.pages + '" value="' + f.to + '" aria-label="끝 쪽"><span class="stu-mut">쪽</span>' +
          '<button class="stu-x" data-rm="' + i + '" aria-label="' + esc(f.name) + ' 빼기">×</button>' +
          (aiState === "on" ? '<label class="chk fig"><input type="checkbox" data-fig="' + i + '"' + (f.figs ? " checked" : "") + '> 그림·표가 있는 쪽은 이미지로도 Claude에게 보여 주기' + (imgLimits ? ' <span class="stu-mut">(최대 ' + imgLimits.maxCount + "쪽)</span>" : "") + "</label>" : "") + "</div>";
        return '<div class="file"><span class="tag plain">이미지</span><b>' + esc(f.name) + "</b>" + (aiState === "on" ? "" : '<span class="stu-mut">(AI 모드에서만 읽음)</span>') + '<button class="stu-x" data-rm="' + i + '" aria-label="' + esc(f.name) + ' 빼기">×</button></div>';
      }).join("");
    }
    function msg(t) { var m = $("#smsg"); m.textContent = t || ""; m.hidden = !t; }
    function addFiles(fl) {
      msg(""); $("#sstatus").textContent = "파일을 읽는 중…";
      Promise.all([].slice.call(fl).map(function (f) { return readFile(f).catch(function (e) { return { err: e.message }; }); })).then(function (rs) {
        var errs = [];
        rs.forEach(function (r) {
          if (r.err) errs.push(r.err);
          else if (r.kind === "text") ta.value = (ta.value ? ta.value + "\n\n" : "") + r.data;
          else files.push(r);
          if (!r.err && !$("#stitle").value) $("#stitle").value = r.name.replace(/\.[^.]+$/, "");
        });
        keep(); teamState(); msg(errs.join(" "));
      });
    }
    function keep() { draft = { title: $("#stitle").value, text: ta.value, focus: $("#sfocus").value }; }
    teamState();
    ["#stitle", "#stext", "#sfocus"].forEach(function (s) { $(s).oninput = keep; });
    $("#sfile").onchange = function () { addFiles(this.files); this.value = ""; };
    var box = el.querySelector(".stu-in");
    box.addEventListener("dragover", function (e) { e.preventDefault(); box.classList.add("drop"); });
    box.addEventListener("dragleave", function () { box.classList.remove("drop"); });
    box.addEventListener("drop", function (e) { e.preventDefault(); box.classList.remove("drop"); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
    $("#sfiles").onclick = function (e) { var b = e.target.closest("[data-rm]"); if (b) { files.splice(+b.dataset.rm, 1); drawFiles(); } };
    $("#sfiles").onchange = function (e) {
      var t = e.target;
      if (t.dataset.fig != null) { var ff = files[+t.dataset.fig]; if (ff) ff.figs = t.checked; return; }
      var i = +(t.dataset.pf || t.dataset.pt), f = files[i]; if (!f) return;
      var v = Math.max(1, Math.min(f.pages, Math.round(+t.value) || 1));
      if (t.dataset.pf != null) f.from = Math.min(v, f.to); else f.to = Math.max(v, f.from);
      drawFiles();
    };
    $("#stypes").onclick = function (e) {
      var b = e.target.closest("[data-t]"); if (!b) return;
      cfg.types[b.dataset.t] = cfg.types[b.dataset.t] ? 0 : 1;
      if (!Object.keys(cfg.types).some(function (t) { return cfg.types[t]; })) cfg.types[b.dataset.t] = 1;
      b.classList.toggle("on", !!cfg.types[b.dataset.t]); b.setAttribute("aria-pressed", !!cfg.types[b.dataset.t]); save();
    };
    $("#sn").onchange = function () { cfg.n = +this.value; save(); };
    $("#slv").onchange = function () { cfg.level = this.value; save(); };
    function syncSaver() { cfg.saver = cfg.tier === SAVER.tier && +cfg.rounds === SAVER.rounds; var c = $("#ssaver"); if (c) c.checked = cfg.saver; }
    $("#stier").onchange = function () { cfg.tier = this.value; syncSaver(); save(); };
    $("#ssaver").onchange = function () {
      var m = this.checked ? SAVER : NORMAL; cfg.saver = this.checked; cfg.tier = m.tier; cfg.rounds = m.rounds;
      files.forEach(function (f) { if (f.kind === "pdf") f.figs = !cfg.saver; });
      save(); $("#stier").value = cfg.tier; $("#srounds").value = String(cfg.rounds); teamState();
    };
    $("#srounds").onchange = function () { cfg.rounds = +this.value; syncSaver(); save(); teamState(); };
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
    $("#sstop").onclick = function () { if (busy) busy.abort(); };
    $("#sgo").onclick = function () {
      if (busy) return;
      keep(); msg("");
      var btn = this, title = draft.title.trim();
      cfg.focus = draft.focus.trim();
      var pdfs = files.filter(function (f) { return f.kind === "pdf"; }), imgs = files.filter(function (f) { return f.kind === "image"; });
      if (!draft.text.trim() && !files.length) { msg("자료를 붙여 넣거나 파일을 골라 주세요."); ta.focus(); return; }
      btn.disabled = true; $("#sstatus").textContent = pdfs.length ? "PDF에서 글자를 읽는 중…" : "";
      // PDF는 고른 쪽 범위의 글자를 [p.N] 표시와 함께 뽑아 자료에 붙인다.
      Promise.all(pdfs.map(function (f) { return pdfText(f.doc, f.from, f.to).then(function (t) { return { f: f, t: t }; }); })).then(function (ps) {
        var parts = [];
        if (draft.text.trim()) parts.push(draft.text.trim());
        var empty = [];
        ps.forEach(function (x) { if (x.t) parts.push("=== " + x.f.name + " (" + x.f.from + "~" + x.f.to + "쪽) ===\n" + x.t); else empty.push(x.f.name); });
        var text = parts.join("\n\n");
        var source = ps.map(function (x) { return x.f.name + " (" + x.f.from + "~" + x.f.to + "쪽)"; }).join(", ");
        var warn = empty.length ? empty.join(", ") + "에서 글자를 찾지 못했습니다(스캔한 그림 PDF일 수 있습니다). " : "";
        if (!text && !imgs.length) throw new Error(warn + "읽을 수 있는 글자가 없습니다. 스캔한 PDF라면 페이지를 사진(이미지)으로 넣어 주세요.");
        if (text.length > MAX_TEXT) throw new Error("자료가 너무 깁니다(" + text.length.toLocaleString() + "자). 쪽 범위를 줄여 " + MAX_TEXT.toLocaleString() + "자 이하로 나눠 주세요.");
        if (aiState !== "on") {
          if (S.splitSents(text).length < 3) throw new Error("기본 모드는 문장이 세 개 이상인 자료가 필요합니다." + (imgs.length ? " 이미지는 AI 모드에서만 읽을 수 있습니다." : ""));
          var r = S.buildLocal(text, cfg);
          return finish("local", title || r.title, text, r, warn + (imgs.length ? "이미지는 AI 모드에서만 읽을 수 있어 빼고 만들었습니다." : ""), source);
        }
        if (imgs.length && imgLimits && imgs.length > imgLimits.maxCount) throw new Error("이미지는 한 번에 " + imgLimits.maxCount + "장까지 넣을 수 있습니다.");
        var room = imgLimits ? imgLimits.maxCount - imgs.length : 0;
        var figPdfs = pdfs.filter(function (f) { return f.figs; });
        var pre = Promise.resolve([]);
        if (room > 0 && figPdfs.length) {
          $("#sstatus").textContent = "그림이 있는 쪽을 찾아 이미지로 바꾸는 중…";
          pre = figPdfs.reduce(function (acc, f) {
            return acc.then(function (out) {
              var left = room - out.length; if (left <= 0) return out;
              return figurePages(f.doc, f.from, f.to, left).then(function (ns) {
                return ns.reduce(function (a2, n) { return a2.then(function (o2) { return pageImage(f.doc, n).then(function (b) { if (b) o2.push({ blob: b, label: (pdfs.length > 1 ? f.name + " " : "") + "p." + n }); return o2; }); }); }, Promise.resolve(out));
              });
            });
          }, Promise.resolve([]));
        }
        return pre.then(function (figImgs) {
        var allImgs = imgs.map(function (im) { return { blob: im.blob, label: "사진 " + im.name }; }).concat(figImgs);
        var steps = S.plan(cfg), state = steps.map(function () { return { s: "wait" }; }), prog = $("#sprog");
        if (figImgs.length) warn += "그림 쪽 " + figImgs.map(function (x) { return x.label; }).join(", ") + "을(를) 이미지로 함께 보냈습니다. ";
        var ctl = new AbortController(); busy = ctl; $("#sstop").hidden = false;
        function drawProg() {
          if (!prog.isConnected) return;
          prog.hidden = false;
          prog.innerHTML = '<ol class="steps-live">' + steps.map(function (x, i) {
            var s = state[i];
            return '<li class="sl sl-' + s.s + " sl-" + x.who + '"><span class="dot"></span><div>' + who(x.who) + " " + KIND[x.kind] +
              "<small>" + (s.s === "run" ? (s.chars ? "쓰는 중 · " + s.chars.toLocaleString() + "자" : "생각하는 중") + " · " + Math.round((Date.now() - s.t) / 1000) + "초" : s.s === "done" ? "완료 · " + s.sec + "초" : "대기") + "</small></div></li>";
          }).join("") + "</ol>";
        }
        var timer = setInterval(drawProg, 1000); drawProg();
        return S.generate({ text: text, name: title, images: allImgs }, cfg, function (ev) {
          var s = state[ev.i];
          if (ev.state === "run") { if (s.s !== "run") { s.s = "run"; s.t = Date.now(); } if (ev.chars) s.chars = ev.chars; }
          else { s.s = "done"; s.sec = Math.round((Date.now() - s.t) / 1000); }
          drawProg();
        }, ctl.signal).then(function (r) {
          clearInterval(timer); busy = null;
          finish("ai", title || r.title, text, r, warn + (r.partial ? "검토 도중 문제가 생겨 마지막으로 끝난 단계까지의 결과를 저장했습니다: " + r.partial : ""), source);
        }, function (e) { clearInterval(timer); busy = null; prog.hidden = true; throw e; });
        });
      }).catch(function (e) {
        var b = $("#sgo"); if (b) b.disabled = false;
        var st2 = $("#sstop"); if (st2) st2.hidden = true;
        if ($("#sstatus")) teamState();
        if (e && e.code === "cancelled") msg("중단했습니다."); else msg(e && e.code ? S.errText(e) : (e && e.message) || String(e));
      });
    };
  }
  function finish(mode, title, text, result, note, source) {
    var it = { id: String(Date.now()), title: title || "제목 없음", created: Date.now(), mode: mode, text: text.slice(0, MAX_SAVE_TEXT), result: result, ans: {}, note: note, source: source || "" };
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
    if (cur.updatedNote) { cur.updatedNote = false; save(); }
  }
  function stats() { var a = cur.ans, done = Object.keys(a).length, ok = Object.keys(a).filter(function (k) { return a[k].ok; }).length; return { done: done, ok: ok, wrong: done - ok, n: (cur.result.questions || []).length }; }
  function draw() {
    var r = cur.result, s = stats(), log = r.log || [];
    var tabs = [["sum", "요약"]];
    if ((r.cards || []).length) tabs.push(["cards", "그림 카드", r.cards.length]);
    tabs = tabs.concat([["terms", "용어 카드", (r.terms || []).length], ["quiz", "문제", s.n], ["ask", "질문하기", (cur.chat || []).filter(function (m) { return m.role === "user"; }).length || null]]);
    if (log.length) tabs.push(["talk", "검토 기록", log.length]);
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
        (cur.updatedNote ? '<p class="stu-note">이 기본 제공 세트가 새 판으로 바뀌었습니다: 그림 내용과 의사 코드, 새 문제가 추가됐습니다. 이전 풀이 기록은 그대로 남아 있어요.</p>' : "") +
        '<div id="sbody"></div>' +
      "</div></div>";
    var body = el.querySelector("#sbody");
    el._aiRefresh = null;
    if (tab === "sum") drawSum(body, r);
    else if (tab === "terms") drawTerms(body, r);
    else if (tab === "cards") { body.innerHTML = '<div class="row" style="justify-content:space-between"><p class="stu-mut" style="margin:0">앞면의 그림을 ◀ ▶로 한 단계씩 넘겨 보거나 자동 재생해 보세요. "설명 보기"를 누르면 뒷면에 쉬운 설명과 비유가 있어요.</p></div><div id="pcbox"></div>'; cur.cardImages = cur.cardImages || {}; var cit = cur;
      S.renderCards(body.querySelector("#pcbox"), r.cards, { images: cit.cardImages, onImage: function (i, url) { if (url) cit.cardImages[i] = url; else delete cit.cardImages[i]; var ok = save(true); if (!ok && url) { delete cit.cardImages[i]; save(true); } return ok; } }); }
    else if (tab === "quiz") drawQuiz(body);
    else if (tab === "ask") drawAsk(body);
    else if (tab === "talk") drawTalk(body, r);
    else body.innerHTML = cur.text ? '<div class="panel stu-src">' + esc(cur.text).replace(/\n/g, "<br>") + "</div>" + (cur.text.length >= MAX_SAVE_TEXT ? '<p class="stu-mut">원문은 앞부분 ' + MAX_SAVE_TEXT.toLocaleString() + "자만 저장됩니다.</p>" : "")
      : '<div class="empty">저장된 원문이 없습니다 (이미지로 넣었거나 저장 공간 때문에 지워졌습니다).</div>';
    el.querySelector("#sback").onclick = function () { go(""); };
    el.querySelectorAll("[data-tab]").forEach(function (b) { b.onclick = function () { tab = b.dataset.tab; draw(); window.scrollTo(0, 0); }; });
  }
  function drawSum(body, r) {
    var s = r.summary || {};
    body.innerHTML = '<div class="sum-grid">' +
      (s.one_line ? '<div class="panel stu-one"><small>한 줄 요약</small><p>' + esc(s.one_line) + "</p></div>" : "") +
      ((s.key_points || []).length ? '<div class="panel"><h3>핵심 정리</h3><ul class="stu-ul">' + s.key_points.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul></div>" : "") +
      ((s.code || []).length ? '<div class="panel"><h3>의사 코드</h3><p class="stu-mut">시험에 빈칸으로 나올 수 있는 부분입니다. 줄 번호와 반복 범위·비교 조건·인덱스를 눈여겨보세요.</p><div class="codes">' + s.code.map(function (c) { return '<div class="codebox"><div class="code-head"><b>' + esc(c.title) + "</b>" + (c.page ? '<span class="stu-mut">' + esc(c.page) + "</span>" : "") + '</div><pre class="code">' + esc(c.code) + "</pre></div>"; }).join("") + "</div></div>" : "") +
      ((s.sections || []).length ? '<div class="panel notes"><h3>정리 노트</h3>' + s.sections.map(function (x) { return '<h4 class="stu-h4">' + esc(x.heading) + '</h4><p class="stu-p">' + esc(x.body) + "</p>"; }).join("") + "</div>" : "") +
      "</div>" +
      '<div class="row">' + ((r.cards || []).length ? '<button class="btn primary" data-tab="cards">그림 카드로 기초 이해하기</button>' : "") + '<button class="btn' + ((r.cards || []).length ? "" : " primary") + '" data-tab="quiz">문제 풀기 →</button><button class="btn" data-tab="terms">용어 카드</button><button class="btn" data-tab="ask">모르는 것 질문하기</button></div>';
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
  var moreBusy = null;
  function drawQuiz(body) {
    var qs = cur.result.questions || [], a = cur.ans, s = stats();
    var idx = qs.map(function (q, i) { return i; }).filter(function (i) { return qFilter === "all" || (qFilter === "wrong" ? a[i] && !a[i].ok : !a[i]); });
    body.innerHTML =
      '<div class="scorebar row" style="justify-content:space-between"><span class="row">' + [["all", "전체 " + s.n], ["todo", "안 푼 문제 " + (s.n - s.done)], ["wrong", "틀린 문제 " + s.wrong]].map(function (f) { return '<button class="chip' + (qFilter === f[0] ? " on" : "") + '" data-f="' + f[0] + '">' + f[1] + "</button>"; }).join("") + "</span>" +
      '<span class="row"><button class="btn sm" id="smore"' + (aiState === "on" && cur.text ? "" : " hidden") + ">Claude에게 문제 " + st.cfg.n + "개 더 받기</button>" + resetBtn(s) + "</span></div>" +
      (cur.ansUndo ? '<p class="stu-note undo">' + esc(cur.ansUndo.what) + ' 기록을 지웠어요. <button class="btn sm" id="sundo">되돌리기</button></p>' : "") +
      '<p class="stu-mut" id="smoremsg" hidden></p>' +
      '<div class="qgrid">' + (idx.length ? idx.map(function (i) { return qHtml(qs[i], i); }).join("") : '<div class="empty">' + (qFilter === "wrong" ? "틀린 문제가 없습니다." : "모두 풀었습니다.") + "</div>") + "</div>";
    body.querySelectorAll(".stu-q").forEach(function (c) { var i = +c.dataset.q; if (a[i]) showAns(c, qs[i], a[i]); });
    body.onclick = onQuizClick;
    el._aiRefresh = function () { var m = body.querySelector("#smore"); if (m) m.hidden = !(aiState === "on" && cur.text); };
  }
  // 문제 본문: ``` 로 감싼 부분은 코드 블록으로, _____ 는 빈칸으로 보여 준다.
  function fmtStem(t) {
    return String(t || "").split("```").map(function (part, k) {
      if (k % 2) return '<pre class="code">' + esc(part.replace(/^\n|\n$/g, "")).replace(/_{3,}/g, '<span class="blank code-blank"></span>') + "</pre>";
      return esc(part).replace(/\n/g, "<br>").replace(/_{3,}/g, '<span class="blank"></span>');
    }).join("");
  }
  // 지금 보는 화면(전체/틀린 문제)에 맞는 기록만 지운다. 안 푼 문제 화면에서는 버튼을 숨긴다.
  function dropUndo() { if (cur.ansUndo) { delete cur.ansUndo; var u = el.querySelector(".stu-note.undo"); if (u) u.remove(); } }
  function resetBtn(s) {
    if (qFilter === "todo" || !s.done) return "";
    if (qFilter === "wrong") return s.wrong ? '<button class="btn sm" id="sreset" data-scope="wrong">틀린 문제 ' + s.wrong + "개 다시 풀기</button>" : "";
    return '<button class="btn sm" id="sreset" data-scope="all">전체 다시 풀기</button>';
  }
  function qHtml(q, i) {
    var opts = q.type === "ox" ? ["O", "X"] : (q.options || []), isCode = /```/.test(q.question);
    return '<div class="qcard stu-q" data-q="' + i + '" id="sq' + i + '">' +
      '<div class="qhead"><span class="tag num">' + (i + 1) + '</span><span class="tag plain">' + (TYPE_NAMES[q.type] || q.type) + "</span></div>" +
      '<div class="stem">' + fmtStem(q.question) + "</div>" +
      (q.type === "short" || !opts.length
        ? '<textarea class="stu-text stu-ans" rows="3" placeholder="답을 적어 보세요" aria-label="' + (i + 1) + '번 답"></textarea><div class="row"><button class="btn primary" data-show>정답 확인</button></div>'
        : '<div class="opts' + (q.type === "ox" ? " stu-ox" : "") + '">' + opts.map(function (o, k) { return '<button class="opt" data-o="' + k + '"><span class="bubble">' + (q.type === "ox" ? o : k + 1) + '</span><span class="otext' + (isCode ? " mono" : "") + '">' + (q.type === "ox" ? (o === "O" ? "맞다" : "틀리다") : esc(o)) + "</span></button>"; }).join("") + "</div>") +
      '<div class="stu-res"></div></div>';
  }
  function norm(s) { return String(s || "").replace(/^\s*[①②③④⑤1-5][.)]?\s*/, "").trim().toLowerCase(); }
  var VERDICT = { correct: "정답", partial: "부분 정답", wrong: "오답" };
  function gradeHtml(g) {
    if (!g) return "";
    if (g.error) return '<p class="stu-err">' + esc(g.error) + "</p>";
    if (g.rounds) { // 예전 버전(Claude × GPT) 채점 기록
      var last = g.rounds[g.rounds.length - 1];
      return '<div class="grade"><div class="grade-head"><b>AI 채점 (예전 기록)</b></div>' + Object.keys(last).map(function (w) { var x = last[w]; return '<div class="gline gl-' + w + '">' + who(w) + ' <b class="v-' + x.verdict + '">' + VERDICT[x.verdict] + " · " + x.score + "점</b><p>" + esc(x.feedback) + "</p></div>"; }).join("") + "</div>";
    }
    return '<div class="grade"><div class="grade-head"><b>Claude 채점</b> <b class="v-' + g.verdict + '">' + VERDICT[g.verdict] + " · " + g.score + "점</b></div><p>" + esc(g.feedback) + "</p></div>";
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
    var canAI = aiState === "on";
    card.querySelector(".stu-res").innerHTML = '<div class="explain">' +
      (short ? "" : '<p class="' + (rec.ok ? "ok" : "ng") + '"><b>' + (rec.ok ? "정답" : "오답") + "</b></p>") +
      (short && /\n/.test(q.answer) ? '<p><b>모범 답안</b></p><pre class="code">' + esc(q.answer) + "</pre>" : "<p><b>" + (short ? "모범 답안" : "정답") + "</b> " + esc(q.answer) + "</p>") +
      (q.explanation ? "<p>" + esc(q.explanation) + "</p>" : "") +
      (q.evidence ? '<p class="stu-ev">근거: “' + esc(q.evidence) + "”</p>" : "") +
      (short ? gradeHtml(rec.ai) : "") +
      (short && rec.self == null ? '<div class="row self"><span class="stu-mut">내 답이 맞았나요?</span><button class="btn good sm" data-self="1">맞았어요</button><button class="btn bad sm" data-self="0">틀렸어요</button>' + (canAI && !rec.ai ? '<button class="btn sm" data-grade>Claude에게 채점 맡기기</button>' : "") + '<span class="stu-mut gmsg"></span></div>' : "") +
      '<div class="row redo"><button class="linkbtn" data-redo>이 문제 다시 풀기</button></div>' +
      (short && rec.self != null ? '<p class="' + (rec.ok ? "ok" : "ng") + '"><b>' + (rec.by === "ai" && rec.ai && rec.ai.verdict ? VERDICT[rec.ai.verdict] : rec.ok ? "맞음" : "틀림") + "</b> (" + (rec.by === "ai" ? "Claude 채점" + (rec.ai && rec.ai.verdict === "partial" ? " · 틀린 문제에 넣어 다시 풀게 했어요" : "") : "스스로 채점") + ")</p>" : "") +
      "</div>";
  }
  function onQuizClick(e) {
    var qs = cur.result.questions, card = e.target.closest(".stu-q");
    var f = e.target.closest("[data-f]"); if (f) { qFilter = f.dataset.f; drawQuiz(el.querySelector("#sbody")); return; }
    if (e.target.id === "sreset") {
      var scope = e.target.dataset.scope, st0 = stats();
      if (scope === "wrong") {
        // 틀린 문제만 지운다(맞은 기록은 그대로)
        var backup = JSON.parse(JSON.stringify(cur.ans)), n = 0;
        Object.keys(cur.ans).forEach(function (k) { if (!cur.ans[k].ok) { delete cur.ans[k]; n++; } });
        cur.ansUndo = { ans: backup, what: "틀린 문제 " + n + "개의" };
        save(); qFilter = "todo"; draw(); return;
      }
      if (e.target.dataset.sure) {
        cur.ansUndo = { ans: JSON.parse(JSON.stringify(cur.ans)), what: "전체 " + st0.done + "문제(정답 " + st0.ok + "개 포함)의" };
        cur.ans = {}; save(); qFilter = "all"; draw();
      } else { e.target.dataset.sure = 1; e.target.textContent = "정답 " + st0.ok + "개를 포함해 전부 지우기"; e.target.classList.add("bad"); }
      return;
    }
    if (e.target.id === "sundo") { if (cur.ansUndo) { cur.ans = cur.ansUndo.ans; delete cur.ansUndo; save(); draw(); } return; }
    if (e.target.id === "smore") { moreQuestions(e.target); return; }
    if (!card) return;
    var i = +card.dataset.q, q = qs[i], rec = cur.ans[i];
    if (e.target.closest("[data-redo]")) {
      delete cur.ans[i]; save();
      var tmp = document.createElement("div"); tmp.innerHTML = qHtml(q, i); card.replaceWith(tmp.firstChild); upd(); return;
    }
    var o = e.target.closest(".opt");
    if ((o && !o.disabled) || e.target.closest("[data-show]")) dropUndo();
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
      var gm = card.querySelector(".gmsg"); gm.textContent = "Claude가 채점하는 중…";
      S.grade(q, rec.text, st.cfg).then(function (g) {
        rec.ai = g; rec.ok = g.verdict === "correct"; rec.self = rec.ok ? 1 : 0; rec.by = "ai";
        save(); if (card.isConnected) showAns(card, q, rec); upd();
      }, function (err) {
        gb.disabled = false; gm.textContent = err && err.code ? S.errText(err) : (err && err.message) || "채점하지 못했습니다.";
      });
    }
  }
  function moreQuestions(btn) {
    if (moreBusy) { moreBusy.abort(); return; }
    var m = el.querySelector("#smoremsg"), it = cur, ctl = new AbortController(); moreBusy = ctl;
    btn.textContent = "중단"; m.hidden = false; m.textContent = "Claude가 새 문제를 만드는 중…";
    S.moreQuestions({ text: it.text, name: it.title }, st.cfg, it.result.questions || [], function (n) { m.textContent = "Claude가 새 문제를 쓰는 중… " + n.toLocaleString() + "자"; }, ctl.signal).then(function (qs) {
      moreBusy = null;
      it.result.questions = (it.result.questions || []).concat(qs); save();
      if (cur === it && tab === "quiz") { qFilter = "todo"; draw(); var mm = el.querySelector("#smoremsg"); if (mm) { mm.hidden = false; mm.textContent = "새 문제 " + qs.length + "개를 추가했습니다. '안 푼 문제'에서 보여 줍니다."; } }
    }, function (e) {
      moreBusy = null;
      if (!btn.isConnected) return;
      btn.textContent = "Claude에게 문제 " + st.cfg.n + "개 더 받기";
      m.textContent = e && e.code === "cancelled" ? "중단했습니다." : e && e.code ? S.errText(e) : (e && e.message) || "문제를 받지 못했습니다.";
    });
  }
  function upd() {
    var s = stats();
    var a = el.querySelector("#sscore"); if (a) a.textContent = s.ok + " / " + s.done;
    var b = el.querySelector("#sscore2"); if (b) b.textContent = s.n + "문제 중 " + s.done + "개 풀이" + (s.done ? " · 정답률 " + Math.round(s.ok / s.done * 100) + "%" : "");
    var c = el.querySelector("#sbar"); if (c) c.style.width = (s.n ? s.done / s.n * 100 : 0) + "%";
    var chips = el.querySelectorAll(".scorebar [data-f]");
    if (chips.length) { chips[0].textContent = "전체 " + s.n; chips[1].textContent = "안 푼 문제 " + (s.n - s.done); chips[2].textContent = "틀린 문제 " + s.wrong; }
  }

  /* ---------- 질문하기 (자료 기반 채팅) ---------- */
  var chatBusy = null;
  var SUGGEST = ["핵심 개념을 쉽게 다시 설명해 줘", "헷갈리기 쉬운 개념끼리 비교해 줘", "시험에 나올 만한 문제 하나 내 줘", "내가 틀린 문제를 다시 설명해 줘"];
  function drawAsk(body) {
    cur.chat = cur.chat || [];
    function render() {
      var on = aiState === "on";
      body.innerHTML =
        '<div class="ask-head"><h3>질문하기</h3><p class="stu-mut">이 자료를 근거로 Claude에게 물어봅니다. 자료에 없는 내용이면 없다고 먼저 알려 줍니다.</p></div>' +
        (on ? "" : '<p class="stu-note">' + (aiState === "checking" ? "Claude 연결을 확인하고 있습니다…" : "질문하기는 claude.ai에서 이 페이지를 열었을 때만 쓸 수 있습니다.") + "</p>") +
        '<div class="chat" id="chat">' + (cur.chat.length ? cur.chat.map(function (m) { return '<div class="bub bub-' + m.role + '">' + esc(m.content) + "</div>"; }).join("") : '<div class="empty">아직 주고받은 질문이 없습니다.</div>') + "</div>" +
        '<div class="row sugg">' + SUGGEST.map(function (t) { return '<button class="chip" data-sug="' + esc(t) + '"' + (on ? "" : " disabled") + ">" + esc(t) + "</button>"; }).join("") + "</div>" +
        '<div class="ask-box"><textarea id="askin" class="stu-text" rows="3" placeholder="예: DownHeap이 왜 O(logn)이야?"' + (on ? "" : " disabled") + '></textarea>' +
        '<div class="row"><button class="btn primary" id="asksend"' + (on ? "" : " disabled") + '>보내기</button><button class="btn" id="askstop" hidden>중단</button>' + (cur.chat.length ? '<button class="btn sm" id="askclear">대화 지우기</button>' : "") + '<span class="stu-mut" id="askmsg"></span></div></div>';
      var chat = body.querySelector("#chat"); chat.scrollTop = chat.scrollHeight;
      body.querySelector("#asksend").onclick = function () { send(body.querySelector("#askin").value); };
      body.querySelector("#askin").onkeydown = function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(this.value); };
      body.querySelector("#askstop").onclick = function () { if (chatBusy) chatBusy.abort(); };
      var cl = body.querySelector("#askclear"); if (cl) cl.onclick = function () { if (cl.dataset.sure) { cur.chat = []; save(); render(); } else { cl.dataset.sure = 1; cl.textContent = "정말 지우기"; cl.classList.add("bad"); } };
      body.querySelectorAll("[data-sug]").forEach(function (b) { b.onclick = function () { var t = b.dataset.sug; if (/틀린 문제/.test(t)) t += "\n\n" + wrongList(); send(t); }; });
    }
    function wrongList() {
      var qs = cur.result.questions || [], w = Object.keys(cur.ans).filter(function (k) { return !cur.ans[k].ok; }).map(function (k) { return qs[k]; }).filter(Boolean).slice(0, 8);
      return w.length ? "내가 틀린 문제:\n" + w.map(function (q, i) { return (i + 1) + ". " + q.question + " (정답: " + q.answer + ")"; }).join("\n") : "(아직 틀린 문제가 없어요. 대신 헷갈리기 쉬운 부분을 골라 설명해 줘.)";
    }
    function send(text) {
      text = (text || "").trim(); if (!text || chatBusy || aiState !== "on") return;
      var it = cur;
      it.chat.push({ role: "user", content: text }); save(); render();
      var chat = body.querySelector("#chat"), bub = document.createElement("div");
      bub.className = "bub bub-assistant thinking"; bub.textContent = "생각하는 중…"; chat.appendChild(bub); chat.scrollTop = chat.scrollHeight;
      var ctl = new AbortController(); chatBusy = ctl;
      body.querySelector("#asksend").disabled = true; body.querySelector("#askstop").hidden = false;
      S.chat(it, it.chat.slice(), function (t) { bub.classList.remove("thinking"); bub.textContent = t; chat.scrollTop = chat.scrollHeight; }, ctl.signal, st.cfg.tier).then(function (res) {
        chatBusy = null; it.chat.push({ role: "assistant", content: res.text + (res.truncated ? "\n\n(답이 길어 중간에 끊겼습니다.)" : "") }); save();
        if (cur === it && tab === "ask") render();
      }, function (e) {
        chatBusy = null;
        if (e && e.text) it.chat.push({ role: "assistant", content: e.text + "\n\n(중간에 멈췄습니다.)" });
        save();
        if (cur === it && tab === "ask") { render(); var m = body.querySelector("#askmsg"); if (m && !(e && e.code === "cancelled")) m.textContent = S.errText(e); }
      });
    }
    render();
    el._aiRefresh = function () { if (!chatBusy) render(); };
  }

  /* ---------- 검토 기록 ---------- */
  var VLABEL = { good: "좋음", fix: "수정 필요", replace: "교체 필요" };
  function drawTalk(body, r) {
    var t = r.team || {}, log = r.log || [];
    var head = t.claude ? "Claude 작성자가 초안을 쓰고 Claude 검토자가 원문과 대조해 검토했습니다. 검토 " + t.rounds + "번." : "예전 버전에서 Claude와 GPT가 상의한 기록입니다.";
    body.innerHTML = '<div class="talk-head"><h3>검토 기록</h3><p class="stu-mut">' + esc(head) + "</p></div>" +
      '<div class="talk">' + log.map(function (m) {
        var d = m.data || {}, h = "";
        if (m.kind === "draft" || m.kind === "solo") h = "<p>" + (m.kind === "draft" ? "초안을 만들었어요." : "자료를 만들었어요.") + " 문제 " + d.questions + "개, 용어 " + d.terms + "개.</p>" + (d.one_line ? '<p class="q">“' + esc(d.one_line) + "”</p>" : "");
        else if (m.kind === "review") {
          var qr = d.question_reviews || [], bad = qr.filter(function (x) { return x.verdict !== "good"; });
          h = "<p>" + esc(d.overall) + "</p>" + list("요약에 대한 의견", d.summary_feedback) + list("빠진 핵심 내용", d.missing_points) + list("용어에 대한 의견", d.term_feedback) +
            '<div class="qrev"><b>문제별 검토</b> <span class="stu-mut">좋음 ' + (qr.length - bad.length) + " · 고칠 점 " + bad.length + "</span>" +
            (bad.length ? "<ul>" + bad.map(function (x) { return '<li><span class="tag ' + (x.verdict === "replace" ? "" : "plain") + '">' + x.number + "번 " + VLABEL[x.verdict] + "</span> " + esc(x.comment) + "</li>"; }).join("") + "</ul>" : "") + "</div>";
        } else if (m.kind === "revise") {
          h = "<p>" + esc(d.message) + "</p>" + list("반영한 점", d.accepted) +
            ((d.rejected || []).length ? '<div class="lst"><b>반영하지 않은 점</b><ul>' + d.rejected.map(function (x) { return "<li>" + esc(x.point) + ' <span class="stu-mut">— 이유: ' + esc(x.reason) + "</span></li>"; }).join("") + "</ul></div>" : "");
        }
        return '<div class="msg msg-' + m.who + '"><div class="msg-head">' + who(m.who) + " <b>" + KIND[m.kind] + '</b><small class="stu-mut">' + m.sec + "초</small></div>" + h + "</div>";
      }).join("") + "</div>" +
      (r.partial ? '<p class="stu-err">검토가 끝까지 진행되지 못했습니다: ' + esc(r.partial) + "</p>" : "");
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
