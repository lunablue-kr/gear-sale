let ROWMAP = new Map();
function buildRows() {
  const map = group(BIDS);
  const rows = [];
  ROWMAP = new Map();
  map.forEach(list => {
    list.forEach(b => {
      b.rs = b.resolved;
      b.uid = b.resolved.key + "|" + b.name + "|" + b.row;
      if (b.rawPrice === undefined) b.rawPrice = b.price;   // 원본 보존
      b.price = priceOf(b);
      b.edited = b.price !== b.rawPrice;
      if (b.rawQty === undefined) b.rawQty = b.qty;        // 시트 원본 수량 보존
      b.qty = qtyOverride(b.uid) ?? b.rawQty;              // 어드민에서 고친 수량이 우선
    });
    const max = Math.max(...list.map(b => +b.price || 0));
    list.forEach(b => {
      b.isTop = (+b.price || 0) === max && max > 0;
      b.competing = list.length > 1;
      b.diff = (+b.price || 0) - (b.rs.ask || 0);
      ROWMAP.set(b.uid, b);
      rows.push(b);
    });
  });
  return rows;
}

function filtered(rows) {
  const q = document.getElementById("q").value.trim().toLowerCase();
  const cat = document.getElementById("cat").value;
  const who = document.getElementById("who").value;
  const st = document.getElementById("state").value;
  return rows.filter(r =>
    (!cat || r.rs.catKey === cat) &&
    (!who || r.name === who) &&
    (!st || (st === "active" ? !["done", "drop"].includes(stateOf(r)) : stateOf(r) === st)) &&
    (!q || (r.rs.name + " " + r.item + " " + r.name + " " + r.contact + " " + r.rs.cat)
      .toLowerCase().includes(q)));
}

function fillSelects(rows) {
  const cs = document.getElementById("cat"), ws = document.getElementById("who");
  /* 매번 다시 채운다. 예전에는 최초 1회만 채워서 새 입찰자가 목록에 안 나왔고,
     덧붙이기만 해서 다시 채울 때마다 항목이 한 벌씩 늘어났다.
     고르고 있던 값은 유지한다. */
  const keepC = cs.value, keepW = ws.value;
  cs.length = 1; ws.length = 1;
  const cats = [...new Set(rows.map(r => r.rs.catKey))].filter(Boolean);
  cats.forEach(c => cs.insertAdjacentHTML("beforeend", `<option value="${c}">${esc(CATS[c] || c)}</option>`));
  /* 입찰자 목록엔 진행중(완료·취소 제외) 입찰이 있는 사람만 */
  [...new Set(rows.filter(r => !["done", "drop"].includes(stateOf(r))).map(r => r.name))]
    .filter(Boolean).sort((a, b) => a.localeCompare(b, "ko"))
    .forEach(n => ws.insertAdjacentHTML("beforeend", `<option value="${esc(n)}">${esc(n)}</option>`));
  cs.value = keepC; ws.value = keepW;      // 고르던 필터 복원
}

/* 표가 비었을 때: 필터 때문인지, 시트를 못 읽은 것인지 화면에 밝힌다.
   (예전에는 숨겨진 영역에 안내를 그려서 원인이 전혀 안 보였다)            */
function emptyGridHTML() {
  const isFiltered = document.getElementById("q").value.trim() ||
    document.getElementById("cat").value || document.getElementById("who").value ||
    document.getElementById("state").value;

  if (BIDS.length && isFiltered)
    return `<div class="empty">조건에 맞는 입찰이 없어요.<br>
      <span style="font-size:13px">검색어·필터를 지우면 전체 ${BIDS.length}건이 보여요.</span></div>`;

  if (BIDS.length) return `<div class="empty">조건에 맞는 입찰이 없어요.</div>`;

  if (PREVIEW) return `<div class="empty">표시할 품목이 없어요.</div>`;

  const info = TRIED.length
    ? TRIED.map(t => `· <b>${esc(t.name)}</b> — ${t.rows}행 중 입찰로 인식된 것 ${t.bids}건`).join("<br>")
    : "읽을 수 있는 후보 시트가 없었어요.";
  const all = (DATA && DATA.sheets || []).map(s => `${esc(s.sheet)}(${(s.rows||[]).length}행)`).join(" · ") || "-";

  // 원인 파악에 꼭 필요한 것: 실제 헤더와, 어느 열을 무엇으로 인식했는지
  const bid = (DATA && DATA.sheets || []).find(s => String(s.sheet).trim() === "입찰");
  const heads = bid ? esc(JSON.stringify(bid.headers)) : "-";
  const row1 = bid && (bid.rows || [])[0] ? esc(JSON.stringify(bid.rows[0])) : "-";
  const colmap = LAST_COLMAP ? esc(JSON.stringify(LAST_COLMAP)) : "-";

  return `<div class="empty" style="text-align:left;max-width:620px;margin:0 auto;padding:26px 4px">
    <b style="display:block;font-size:15px;color:var(--ink);margin-bottom:8px">입찰을 하나도 읽지 못했어요.</b>
    <div style="font-size:13px;line-height:1.7">
      시도한 시트<br>${info}
      <div style="margin-top:10px;color:var(--sub)">시트 전체: ${all}</div>
      <div style="margin-top:12px;padding:10px;background:#f3f3f1;border-radius:8px;
                  font-family:ui-monospace,monospace;font-size:11.5px;word-break:break-all">
        헤더: ${heads}<br><br>첫 행: ${row1}<br><br>열 인식: ${colmap}
        ${COLMAP_NOTE ? `<br><br>${esc(COLMAP_NOTE)}` : ""}
      </div>
      <div style="margin-top:10px;color:var(--sub)">이 내용을 알려주시면 원인을 바로 잡을 수 있어요.</div>
    </div></div>`;
}

function renderGrid() {
  closeNotePop();          // 표를 새로 그리면 떠 있던 메모 카드는 닫는다
  const all = buildRows();
  BRIEF = makeBrief(all);  // 필터와 무관하게 품목 전체 현황을 요약한다
  fillSelects(all);
  let rows = filtered(all);

  const c = COLS.find(x => x.k === SORT.col) || COLS[0];
  rows.sort((a, b) => {
    const va = c.get(a), vb = c.get(b);
    let d = typeof va === "number" && typeof vb === "number"
      ? va - vb : String(va ?? "").localeCompare(String(vb ?? ""), "ko");
    if (!d && c.k === "cat") d = (a.rs.num || 0) - (b.rs.num || 0);
    return d * SORT.dir;
  });

  const grouping = document.getElementById("group").value;
  const head = `<thead><tr><th class="cbx"><input type="checkbox" id="cbAll"></th>` +
    COLS.map(x => `<th class="${(x.cls || "").includes("hide-m") ? "hide-m" : ""}" ${x.k === "act" ? "" : `data-k="${x.k}"`}>${x.label}${SORT.col === x.k ? `<span class="arw">${SORT.dir > 0 ? "▲" : "▼"}</span>` : ""}</th>`).join("") +
    `</tr></thead>`;

  const tr = r => `<tr data-uid="${esc(r.uid)}" class="st-${stateOf(r)} ${r.rs.settle ? "settle-row" : ""} ${SEL.has(r.uid) ? "sel" : ""}">` +
    `<td class="cbx"><input type="checkbox" class="cb" ${SEL.has(r.uid) ? "checked" : ""}></td>` +
    COLS.map(x => `<td class="${x.cls || ""}" data-uid="${esc(r.uid)}" data-k="${x.k}">` +
      `${x.html ? x.html(r) : esc(x.get(r) ?? "")}</td>`).join("") + `</tr>`;

  let body = "";
  if (grouping === "none") {
    body = rows.map(tr).join("");
  } else {
    const key = r => grouping === "bidder" ? r.name : r.rs.cat + " " + r.rs.num + " " + r.rs.name;
    const groups = new Map();
    rows.forEach(r => { const k = key(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
    groups.forEach((list, k) => {
      const sum = list.reduce((s, r) => s + (+r.price || 0), 0);
      const gnote = grouping === "bidder" ? noteOf(list[0]) : "";
      body += `<tr class="grouphead"><td colspan="${COLS.length + 1}">${esc(k)} · ${list.length}건` +
        (gnote ? ` <span class="gnote">📌 ${esc(gnote)}</span>` : "") +
        `<span class="gsum">합계 ${won(sum) || "₩0"}</span></td></tr>` + list.map(tr).join("");
    });
  }

  // 다시 그리면 스크롤이 처음으로 돌아가므로 위치를 기억했다 복원한다
  const oldWrap = document.querySelector(".gridwrap");
  const keep = oldWrap ? { x: oldWrap.scrollLeft, y: oldWrap.scrollTop } : null;

  document.getElementById("grid").innerHTML = rows.length
    ? `<div class="gridwrap"><table class="grid">${head}<tbody>${body}</tbody></table></div>`
    : emptyGridHTML();

  const newWrap = document.querySelector(".gridwrap");
  if (keep && newWrap) { newWrap.scrollLeft = keep.x; newWrap.scrollTop = keep.y; }

  document.querySelectorAll("table.grid thead th[data-k]").forEach(th => {
    th.onclick = () => {
      const k = th.dataset.k;
      SORT = { col: k, dir: SORT.col === k ? -SORT.dir : 1 };
      renderGrid();
    };
  });
  // 메모 카드는 바깥을 누르거나 표를 스크롤하면 닫힘
  if (!window.__notepopBound) {
    window.__notepopBound = true;
    document.addEventListener("click", e => { if (!e.target.closest("td.note, td.msg, td.price, td.item, #notepop")) closeNotePop(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeNotePop(); });
    window.addEventListener("scroll", closeNotePop, true);
  }
  const all2 = document.getElementById("cbAll");
  if (all2) all2.onclick = () => {
    rows.forEach(r => all2.checked ? SEL.add(r.uid) : SEL.delete(r.uid));
    renderGrid(); updateSelBar(all);
  };
  applySticky();

  document.querySelectorAll("table.grid td.ts").forEach(td => {
    td.onclick = () => td.classList.toggle("open");
  });
  document.querySelectorAll("table.grid td.msg").forEach(td => {
    td.onclick = () => {
      const txt = td.querySelector(".msgtxt");
      if (!txt || !txt.textContent.trim()) return;
      const was = td.classList.contains("open");
      closeNotePop();
      if (!was) openNotePop(td, txt.textContent);
    };
  });

  // 품목 칸 탭 → 이름 펼침 + 그 품목의 거래 현황 팝업 (누구랑 몇 개 진행중인지)
  document.querySelectorAll("table.grid td.item").forEach(td => {
    td.onclick = () => {
      const was = td.classList.contains("open");
      closeNotePop();
      if (was) return;
      td.classList.add("open");
      const row = ROWMAP.get(td.dataset.uid);
      if (row) openNotePop(td, itemPopText(row.rs.key));
    };
  });

  // 입찰 고치기 / 삭제
  /* 연락하기 — 문자 양식을 만들어 열고(모바일) 또는 복사하고(PC/카톡), 미처리 건을 '연락함'으로 */
  document.querySelectorAll("button.bcontact").forEach(b => {
    b.onclick = async e => {
      e.stopPropagation();
      const r = ROWMAP.get(b.dataset.uid);
      if (!r) return;
      const mine = [...ROWMAP.values()].filter(x => x.name === r.name && x.contact === r.contact && stateOf(x) !== "drop");
      const first = (mine[0] || r).rs.name, extra = Math.max(0, mine.length - 1);
      const msg = `안녕하세요, ${r.name}님.\n장비 구매 신청하신 스튜디오 루나블루입니다.\n신청해주신 ${first}${extra ? ` 외 ${extra}건` : ""} 확인하고 연락드립니다.`;
      const d = String(r.contact || "").replace(/[^\d]/g, "");
      const phone = /^1\d{9}$/.test(d) ? "0" + d : (/^01\d{8,9}$/.test(d) ? d : null);
      const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const android = /Android/i.test(navigator.userAgent);
      const mac = !ios && /Mac/i.test(navigator.userAgent);   // 맥은 메시지 앱이 sms: 를 받는다
      if (phone && (ios || android || mac)) {
        // 맥 메시지 앱은 본문(body)을 무시하는 버전이 있어 클립보드에도 같이 넣어둔다
        try { await navigator.clipboard.writeText(msg); } catch { /* 무시 */ }
        location.href = "sms:" + phone + (android ? "?" : "&") + "body=" + encodeURIComponent(msg);
        if (mac) syncFlag(`메시지 앱 열림 · 본문이 안 채워지면 붙여넣기 (복사해뒀어요)`, "ok");
      } else {
        try {
          await navigator.clipboard.writeText(msg);
          syncFlag(phone ? `양식 복사됨 — 문자로 붙여넣기 (${fmtContact(r.contact)})` : "양식 복사됨 — 카톡에 붙여넣기", "ok");
        } catch { prompt("복사해서 보내세요", msg); }
      }
      mine.filter(x => stateOf(x) === "bid")
        .forEach(x => { setOV(x.uid, { state: "contact" }); pushOverride("state", x.uid, "contact", `${x.name} 연락함`); });
      renderGrid(); renderStats();
    };
  });
  document.querySelectorAll("button.bedit").forEach(b => {
    b.onclick = e => {
      e.stopPropagation();
      const r = ROWMAP.get(b.dataset.uid);
      if (r) openBidModal(r.row);
    };
  });

  // 내 메모 (입찰자 단위) — 칸 클릭해서 바로 입력
  document.querySelectorAll("table.grid td.note").forEach(td => {
    td.onclick = e => {
      if (td.querySelector("input")) return;
      // 메모 글자를 누르면 펼침/접기, ✎ 를 눌러야 편집 (구매자 메모와 같은 방식)
      if (e.target.classList.contains("notetxt")) {
        const was = td.classList.contains("open");
        closeNotePop();
        if (!was) openNotePop(td, e.target.textContent);
        return;
      }
      const row = ROWMAP.get(td.dataset.uid);
      if (!row) return;
      const k = noteKey(row);
      td.innerHTML = `<input class="nedit" value="${esc(NOTES[k] || "")}" placeholder="만날 시간·장소·거래 방법">`;
      const inp = td.querySelector("input");
      inp.focus();
      let closed = false;
      const commit = () => {
        if (closed) return; closed = true;
        const v = inp.value.trim();
        setNote(k, v);
        /* 메모를 적었다 = 연락해서 내용이 오갔다. 그 사람의 미처리·연락함 건을 진행중으로 올린다 */
        if (v) [...ROWMAP.values()]
          .filter(b => noteKey(b) === k && ["bid", "contact"].includes(stateOf(b)))
          .forEach(b => { setOV(b.uid, { state: "prog" }); pushOverride("state", b.uid, "prog", `${b.name} 진행중`); });
        renderGrid(); renderStats();
        pushOverride("note", k, v, `${row.name} 메모`);
      };
      inp.onblur = commit;
      inp.onkeydown = e => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { closed = true; renderGrid(); }
      };
    };
  });

  // 상태 바꾸기 → 로컬 저장 후 시트에도 반영(구매페이지 실시간 연동)
  document.querySelectorAll("select.stsel").forEach(sel => {
    sel.onchange = async () => {
      const uid = sel.dataset.uid, row = ROWMAP.get(uid);
      if (sel.value === "drop") {          // 취소는 확인을 거쳐야 하므로 따로 처리
        if (!row) return;
        sel.value = selState(stateOf(row));   // 확인창을 접으면 원래 상태로 되돌림
        await cancelBid(row);
        return;
      }
      if (!row) return;
      const it = ITEMS.find(x => x.sku === row.rs.sku) || {};
      const total = it.qty || 1;
      let remain = null;
      if (sel.value === "done" && total > 1) {
        const cur = it.remain != null ? it.remain : total;
        const ans = prompt(`${row.rs.name}\n\n지금 ${cur}개 남아 있어요. 몇 개 파셨나요?\n(전부면 ${cur} 입력)`, String(cur));
        if (ans === null) { sel.value = selState(stateOf(row)); return; }   // 취소하면 상태를 되돌린다
        const sold = Math.max(0, Math.min(cur, parseInt(ans, 10) || 0));
        remain = cur - sold;
        it.remain = remain;
      }
      const next = remain != null && remain > 0 ? "bid" : sel.value;
      setOV(uid, { state: next });
      renderGrid(); renderStats();
      /* 상태는 입찰 한 건 단위로 시트에 남겨야 한다.
         'bid' 도 이제 명시적으로 저장한다 — 미처리로 되돌린 건이 다른 기기에서
         메모 자동 승격(promoteNoted)으로 다시 진행중이 되지 않게 하기 위해서다. */
      pushOverride("state", uid, next,
        `${row.name} ${next === "bid" ? "미처리로 되돌림" : (STATE_LABEL[next] || next)}`);
      pushStatus(row.rs.name,
        sel.value === "done" && (remain == null || remain === 0) ? "sold" : "sale",
        { sku: row.rs.sku, remain, skip: row.rs.settle || row.rs.matched === false });
    };
    sel.onclick = e => e.stopPropagation();
  });

  // 연락처 칸 아무 데나 눌러도 ✉ 와 같게
  document.querySelectorAll("table.grid td[data-k='contact']").forEach(td => {
    td.onclick = e => {
      const b = td.querySelector(".bcontact");
      if (b && !e.target.closest(".bcontact")) b.click();
    };
  });

  // 입찰가 수정: 칸 클릭 → 입력창 + 원래 희망가 힌트, Enter/포커스아웃 저장, Esc 취소
  document.querySelectorAll("table.grid td.price").forEach(td => {
    td.onclick = () => {
      if (td.querySelector("input")) return;
      const uid = td.dataset.uid, row = ROWMAP.get(uid);
      if (!row) return;
      td.innerHTML = `<input class="pedit" value="${esc(row.price || "")}" inputmode="numeric" placeholder="${row.rs.ask || ""}">`;
      openNotePop(td, `희망가 ${row.rs.ask
        ? won(row.rs.ask) + (row.rs.askUnit ? `/${row.rs.askUnit}` : "")
        : "미정"} · Enter 저장 · Esc 취소`);
      const inp = td.querySelector("input");
      inp.focus(); inp.select();
      let closed = false;
      const commit = () => {
        if (closed) return; closed = true;
        const v = inp.value.replace(/[^\d]/g, "");
        setOV(uid, { price: v === "" ? null : v });
        renderGrid(); renderStats();
        pushOverride("price", uid, v, `${row.rs.name} / ${row.name} 금액`);
      };
      inp.onblur = commit;
      inp.onkeydown = e => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { closed = true; renderGrid(); }
      };
    };
  });
  // 수량 수정: 칸 클릭 → 입력창 (입찰가와 같은 방식, 시트 H열에 저장)
  document.querySelectorAll("table.grid td[data-k='qty']").forEach(td => {
    td.onclick = () => {
      if (PREVIEW || td.querySelector("input")) return;
      const row = ROWMAP.get(td.dataset.uid);
      if (!row) return;
      td.innerHTML = `<input class="pedit" style="width:40px" value="${row.qty || 1}" inputmode="numeric">`;
      const inp = td.querySelector("input");
      inp.focus(); inp.select();
      let closed = false;
      const commit = async () => {
        if (closed) return; closed = true;
        const q = Math.max(1, Math.min(99, parseInt(inp.value, 10) || 1));
        if (q === (row.qty || 1)) { renderGrid(); return; }
        /* 관리메모 경로로 저장한다 — 입찰 시트 H열은 Apps Script 갱신이 있어야 쓰이고,
           행을 통째로 덮어쓰는 editBid 는 그 사이 바뀐 값까지 날릴 위험이 있다.
           ⚠️ setQty 를 먼저 불러야 한다. 다시 그리기(buildRows)가 저장소에서 수량을
              읽어오므로, 저장 전에 그리면 방금 넣은 값이 옛 값으로 덮여 리셋된다. */
        const saving = setQty(row.uid, q);      // 저장소 반영은 동기, 서버 전송은 비동기
        renderGrid(); renderStats();
        await saving;
        syncFlag(`수량 저장됨 · ${row.rs.name} ${q}개`, "ok");
      };
      inp.onblur = commit;
      inp.onkeydown = e => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { closed = true; renderGrid(); }
      };
    };
  });

  document.querySelectorAll("table.grid tbody tr[data-uid]").forEach(row => {
    row.querySelector(".cb").onclick = e => {
      e.stopPropagation();
      const u = row.dataset.uid;
      SEL.has(u) ? SEL.delete(u) : SEL.add(u);
      row.classList.toggle("sel");
      updateSelBar(all);
    };
  });
  updateSelBar(all);
}

/* 체크박스·카테고리·번호·품목 열을 왼쪽에 고정 (좌우 스크롤해도 품목이 보이게) */
function applySticky() {
  const table = document.querySelector("table.grid");
  if (!table) return;
  const headRow = table.querySelector("thead tr");
  if (!headRow) return;
  const idxs = [0].concat(["item"]
    .map(k => headRow.querySelector(`th[data-k="${k}"]`))
    .filter(Boolean).map(th => th.cellIndex));

  const rows = [...table.rows].filter(r => !r.classList.contains("grouphead"));
  let left = 0;
  idxs.forEach(i => {
    const w = headRow.cells[i].getBoundingClientRect().width;
    rows.forEach(r => {
      const c = r.cells[i];
      if (!c) return;
      c.classList.add("stick");
      c.style.left = left + "px";
    });
    left += w;
  });
  // 마지막 고정 열(품목)에 경계선
  rows.forEach(r => { const c = r.cells[idxs[idxs.length - 1]]; if (c) c.classList.add("stick-last"); });
  // 그룹 헤더는 가로로 붙어다니게
  table.querySelectorAll("tr.grouphead td").forEach(td => { td.style.left = "0px"; });
}

/* 선택한 입찰 일괄 상태 변경 (미처리·완료·취소) — 확인 한 번으로 전부 처리 */
