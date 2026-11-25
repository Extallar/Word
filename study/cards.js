/* 그림 카드: 앞면은 그림(단계별로 넘겨 보기·자동 재생), 뒷면은 쉬운 설명·비유·핵심.
   카드 모양: {title, subtitle, page, visual, easy, analogy, points}
   visual.type: array(칸 배열 단계) · heap(힙 트리 단계) · tree(라벨 트리) · list(문자열 목록 단계)
                rows(이름 붙은 줄 단계) · flow(흐름 상자) · venn(np | nph) */
(function () {
  "use strict";
  var S = window.Study = window.Study || {};
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function has(a, i) { return arr(a).indexOf(i) >= 0; }

  /* ---------- 그림 그리기 ---------- */
  function cells(step) {
    var a = arr(step.a);
    return '<div class="cv-arr' + (a.length > 10 ? " dense" : "") + '">' + a.map(function (v, i) {
      var cls = "cv-cell" + (has(step.hl, i) ? " hl" : "") + (has(step.done, i) ? " done" : "") + (step.groups ? " g" + (step.groups[i] % 5) : "");
      return '<div class="' + cls + '"><b>' + esc(v) + "</b><small>" + i + "</small></div>";
    }).join("") + "</div>";
  }
  function treeSvg(nodes, opt) {
    // nodes: 0-based 완전 이진 트리 위치의 {label, cls} (없으면 null)
    var n = nodes.length, depth = Math.max(1, Math.floor(Math.log2(n)) + 1), PAD = 12, W = opt.leafRect ? 520 : 440, LH = 62, R = opt.leafRect ? 0 : 19, H = depth * LH + 10;
    function pos(i) { var d = Math.floor(Math.log2(i + 1)), k = i + 1 - Math.pow(2, d); return { x: PAD + (k + 0.5) / Math.pow(2, d) * (W - 2 * PAD), y: 26 + d * LH }; }
    var lines = "", dots = "";
    nodes.forEach(function (nd, i) {
      if (!nd) return;
      var p = pos(i);
      [2 * i + 1, 2 * i + 2].forEach(function (c, side) {
        if (c < n && nodes[c]) {
          var q = pos(c);
          lines += '<line class="cv-edge' + (nodes[c].cls === "out" ? " out" : "") + '" x1="' + p.x + '" y1="' + p.y + '" x2="' + q.x + '" y2="' + q.y + '"/>';
          if (opt.branchLabels) lines += '<text class="cv-blabel" x="' + ((p.x + q.x) / 2 + (side ? 10 : -10)) + '" y="' + ((p.y + q.y) / 2) + '" text-anchor="middle">' + (side ? "거짓" : "참") + "</text>";
        }
      });
      var leaf = !(2 * i + 1 < n && nodes[2 * i + 1]) && !(2 * i + 2 < n && nodes[2 * i + 2]);
      var lab = esc(nd.label), w = Math.max(36, String(nd.label).length * (opt.leafRect ? 7.2 : 9) + 12);
      if (opt.leafRect && leaf) dots += '<g class="cv-node leaf ' + (nd.cls || "") + '"><rect x="' + (pos(i).x - w / 2) + '" y="' + (p.y - 14) + '" width="' + w + '" height="28" rx="5"/><text x="' + p.x + '" y="' + (p.y + 5) + '" text-anchor="middle">' + lab + "</text></g>";
      else if (opt.leafRect) dots += '<g class="cv-node ' + (nd.cls || "") + '"><ellipse cx="' + p.x + '" cy="' + p.y + '" rx="' + (w / 2) + '" ry="15"/><text x="' + p.x + '" y="' + (p.y + 5) + '" text-anchor="middle">' + lab + "</text></g>";
      else dots += '<g class="cv-node ' + (nd.cls || "") + '"><circle cx="' + p.x + '" cy="' + p.y + '" r="' + R + '"/><text x="' + p.x + '" y="' + (p.y + 5) + '" text-anchor="middle">' + lab + "</text></g>";
    });
    return '<svg class="cv-tree" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(opt.aria || "트리") + '">' + lines + dots + "</svg>";
  }
  function heapView(step) {
    var a = arr(step.a), size = step.size == null ? a.length : step.size;
    var nodes = a.map(function (v, i) { return { label: v, cls: (i >= size ? "out" : "") + (has(step.hl, i) ? " hl" : "") }; });
    var row = '<div class="cv-arr small"><div class="cv-cell dim"><b>–</b><small>0</small></div>' + a.map(function (v, i) {
      return '<div class="cv-cell' + (has(step.hl, i) ? " hl" : "") + (i >= size ? " done" : "") + '"><b>' + esc(v) + "</b><small>" + (i + 1) + "</small></div>" + (i === size - 1 && size < a.length ? '<div class="cv-bar" aria-hidden="true"></div>' : "");
    }).join("") + "</div>";
    // 힙에서 빠진 노드(정렬이 끝난 부분)도 자리를 지키며 흐리게 보여 준다.
    return treeSvg(nodes, { aria: "최대 힙 트리" }) + row;
  }
  function listView(step) {
    return '<div class="cv-list">' + arr(step.items).map(function (it) {
      var s = String(it), inner = esc(s);
      if (step.digit != null && step.digit < s.length) inner = esc(s.slice(0, step.digit)) + "<u>" + esc(s[step.digit]) + "</u>" + esc(s.slice(step.digit + 1));
      return '<div class="cv-item' + (has(step.mark, s) ? " mark" : "") + '">' + inner + "</div>";
    }).join("") + "</div>";
  }
  function rowsView(step) {
    return '<div class="cv-rows">' + arr(step.rows).map(function (r) {
      return '<div class="cv-row"><span class="cv-rlabel">' + esc(r.label) + '</span><div class="cv-rchips">' + (arr(r.items).length ? arr(r.items).map(function (x, k) { return '<span class="cv-chip' + (has(r.hl, k) ? " hl" : "") + '">' + esc(x) + "</span>"; }).join("") : '<span class="cv-empty">비어 있음</span>') + "</div></div>";
    }).join("") + "</div>";
  }
  function flowView(v) {
    return '<div class="cv-flow">' + arr(v.boxes).map(function (b, i) { return (i ? '<span class="cv-arrow" aria-hidden="true">↓</span>' : "") + '<div class="cv-box' + (i === 0 ? " first" : "") + '">' + esc(b) + "</div>"; }).join("") + "</div>";
  }
  function vennView(v) {
    if (v.variant === "nph") return '<svg class="cv-venn" viewBox="0 0 420 220" role="img" aria-label="NP, P, NP-하드, NP-완전 관계">' +
      '<ellipse class="v-np" cx="150" cy="115" rx="135" ry="92"/><ellipse class="v-nph" cx="270" cy="115" rx="135" ry="92"/><circle class="v-p" cx="95" cy="118" r="52"/>' +
      '<text x="70" y="22">NP</text><text x="330" y="22" class="strong">NP-하드</text><text x="95" y="123" text-anchor="middle">P</text><text x="210" y="112" text-anchor="middle" class="strong">NP-완전</text><text x="210" y="132" text-anchor="middle" class="small">(NP ∩ NP-하드)</text></svg>';
    return '<svg class="cv-venn" viewBox="0 0 420 220" role="img" aria-label="NP 안의 P와 NP-완전">' +
      '<ellipse class="v-np" cx="210" cy="115" rx="190" ry="95"/><circle class="v-p" cx="130" cy="118" r="62"/><circle class="v-npc" cx="295" cy="118" r="62"/>' +
      '<text x="205" y="16" text-anchor="middle">NP</text><text x="130" y="124" text-anchor="middle">P</text><text x="295" y="124" text-anchor="middle" class="strong">NP-완전</text></svg>';
  }
  function stepView(v, step) {
    if (v.type === "array") return cells(step);
    if (v.type === "heap") return heapView(step);
    if (v.type === "list") return listView(step);
    if (v.type === "rows") return rowsView(step);
    return "";
  }
  function staticView(v) {
    if (v.type === "flow") return flowView(v);
    if (v.type === "venn") return vennView(v);
    if (v.type === "tree") return treeSvg(arr(v.labels).map(function (l) { return l == null ? null : { label: l }; }), { leafRect: true, branchLabels: true, aria: "결정 트리" });
    return "";
  }
  S.cardSteps = function (v) { return v && /^(array|heap|list|rows)$/.test(v.type) ? arr(v.steps).filter(Boolean) : []; };

  /* ---------- 카드 ---------- */
  function front(c, k) {
    var v = c.visual || {}, steps = S.cardSteps(v), st = steps[k] || {};
    var pic = steps.length ? stepView(v, st) : staticView(v);
    var note = steps.length ? st.note : v.note;
    return '<div class="pc-pic">' + (pic || '<div class="pc-big">' + esc((c.title || "?").slice(0, 1)) + "</div>") + "</div>" +
      (note ? '<p class="pc-note">' + esc(note) + "</p>" : "") +
      (steps.length > 1 ? '<div class="pc-step"><button class="btn sm" data-prev aria-label="이전 단계"' + (k ? "" : " disabled") + '>◀</button><span class="num">' + (k + 1) + " / " + steps.length + '</span><button class="btn sm" data-next aria-label="다음 단계"' + (k < steps.length - 1 ? "" : " disabled") + '>▶</button><button class="btn sm" data-play>' + (k < steps.length - 1 ? "자동 재생" : "처음부터") + "</button></div>" : "");
  }
  function back(c) {
    return (c.easy ? '<div class="pc-sec"><small>쉬운 설명</small><p>' + esc(c.easy) + "</p></div>" : "") +
      (c.analogy ? '<div class="pc-sec analogy"><small>비유하면</small><p>' + esc(c.analogy) + "</p></div>" : "") +
      (arr(c.points).length ? '<div class="pc-sec"><small>꼭 기억할 것</small><ul>' + c.points.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul></div>" : "");
  }
  S.renderCards = function (box, cards, onFlip) {
    var state = cards.map(function () { return { k: 0, flip: false }; }), timers = {};
    box.innerHTML = '<div class="pcards">' + cards.map(function (c, i) {
      return '<article class="pcard" data-c="' + i + '"><header class="pc-head"><div><h4>' + esc(c.title) + "</h4>" + (c.subtitle ? "<p>" + esc(c.subtitle) + "</p>" : "") + '</div><span class="pc-num num">' + (i + 1) + "</span></header>" +
        '<div class="pc-body"></div><footer class="pc-foot">' + (c.page ? '<span class="stu-mut small">' + esc(c.page) + "</span>" : "<span></span>") + '<button class="btn sm" data-flip>설명 보기</button></footer></article>';
    }).join("") + "</div>";
    function draw(i) {
      var card = box.querySelector('[data-c="' + i + '"]'), c = cards[i], s = state[i];
      card.classList.toggle("flipped", s.flip);
      card.querySelector(".pc-body").innerHTML = s.flip ? back(c) : front(c, s.k);
      card.querySelector("[data-flip]").textContent = s.flip ? "그림 보기" : "설명 보기";
    }
    function stop(i) { if (timers[i]) { clearInterval(timers[i]); delete timers[i]; } }
    cards.forEach(function (c, i) { draw(i); });
    box.onclick = function (e) {
      var card = e.target.closest(".pcard"); if (!card) return;
      var i = +card.dataset.c, s = state[i], n = S.cardSteps(cards[i].visual).length;
      if (e.target.closest("[data-flip]")) { stop(i); s.flip = !s.flip; draw(i); card.classList.add("turn"); setTimeout(function () { card.classList.remove("turn"); }, 350); if (onFlip) onFlip(i, s.flip); return; }
      if (e.target.closest("[data-prev]")) { stop(i); s.k = Math.max(0, s.k - 1); draw(i); return; }
      if (e.target.closest("[data-next]")) { stop(i); s.k = Math.min(n - 1, s.k + 1); draw(i); return; }
      if (e.target.closest("[data-play]")) {
        if (timers[i]) { stop(i); draw(i); return; }
        if (s.k >= n - 1) s.k = 0;
        draw(i);
        timers[i] = setInterval(function () {
          if (!card.isConnected || s.flip) return stop(i);
          if (s.k >= n - 1) { stop(i); draw(i); return; }
          s.k++; draw(i); var b = card.querySelector("[data-play]"); if (b && timers[i]) b.textContent = "멈춤";
        }, 1300);
        var b = card.querySelector("[data-play]"); if (b) b.textContent = "멈춤";
      }
    };
  };

  /* ---------- AI가 준 카드 정리 ---------- */
  S.normCards = function (list) {
    return arr(list).map(function (c) {
      if (!c || typeof c !== "object" || !c.title) return null;
      var v = c.visual && typeof c.visual === "object" ? c.visual : null, ok = null;
      if (v) {
        var t = String(v.type || "");
        if (/^(array|heap|list|rows)$/.test(t)) {
          var steps = arr(v.steps).filter(function (s) {
            if (!s || typeof s !== "object") return false;
            if (t === "array" || t === "heap") return arr(s.a).length > 0 && arr(s.a).length <= 20;
            if (t === "list") return arr(s.items).length > 0 && arr(s.items).length <= 20;
            return arr(s.rows).length > 0;
          }).slice(0, 30);
          if (steps.length) ok = { type: t, steps: steps };
        } else if (t === "flow" && arr(v.boxes).length >= 2) ok = { type: t, boxes: arr(v.boxes).slice(0, 8).map(String) };
        else if (t === "venn" && /^(np|nph)$/.test(v.variant)) ok = { type: t, variant: v.variant };
        else if (t === "tree" && arr(v.labels).length && arr(v.labels).length <= 31) ok = { type: t, labels: v.labels, note: v.note };
      }
      return { title: String(c.title), subtitle: c.subtitle ? String(c.subtitle) : "", page: c.page ? String(c.page) : "", visual: ok, easy: c.easy ? String(c.easy) : "", analogy: c.analogy ? String(c.analogy) : "", points: arr(c.points).map(String).slice(0, 6) };
    }).filter(Boolean).slice(0, 24);
  };
})();
