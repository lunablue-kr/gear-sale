function render() {
  renderStats();
  if (VIEW === "grid") { renderGrid(); return; }
  renderCards();
}

function renderStats() {
  const map = group(BIDS);
  const unmatched = [...map.values()].filter(l => !l[0].resolved.matched).length;
  document.getElementById("stats").innerHTML = PREVIEW
    ? `<div class="stat"><b>${map.size}</b>예약된 품목</div>` +
      `<div class="stat"><b>${map.size - unmatched}</b>현재 품목과 매칭됨</div>` +
      (unmatched ? `<div class="stat"><b>${unmatched}</b>미매칭</div>` : "") +
      `<div class="stat"><b>—</b>입찰자 (비공개)</div>`
    : (() => {
        const rows = buildRows();
        /* 같은 입찰이 동명이품 수만큼 여러 행으로 나뉘므로, 센 것을 또 세지 않는다 */
        const uniq = (list) => {
          const seen = new Set(), out = [];
          list.forEach(r => {
            const k = r.row + "|" + r.name + "|" + r.contact;
            if (seen.has(k)) return;
            seen.add(k); out.push(r);
          });
          return out;
        };
        const n = s => uniq(rows.filter(r => stateOf(r) === s)).length;
        const doneSum = uniq(rows.filter(r => stateOf(r) === "done")).reduce((s, r) => s + (+r.price || 0), 0);
        const bidCount = uniq(rows).length;
        /* 예상 수령: 아직 완료 안 된 품목마다 1순위 입찰 하나만 더한다.
           경쟁 입찰을 다 더하면 부풀려지고, 완료 품목은 거래완료 합계에 이미 있다.
           같은 입찰이 동명이품으로 나뉜 건 uniq 와 같은 키로 1번만 센다. */
        const byItem = new Map();
        rows.forEach(r => {
          if (stateOf(r) === "drop") return;
          if (!byItem.has(r.rs.key)) byItem.set(r.rs.key, []);
          byItem.get(r.rs.key).push(r);
        });
        const seenTop = new Set();
        let expSum = 0;
        byItem.forEach(list => {
          if (list.some(r => stateOf(r) === "done")) return;
          const top = list.slice().sort((a, b) => (a.rank || 99) - (b.rank || 99))[0];
          const k = top.row + "|" + top.name + "|" + top.contact;
          if (seenTop.has(k)) return;
          seenTop.add(k);
          expSum += +top.price || 0;
        });
        return `<div class="stat"><b>${map.size}</b>입찰된 품목</div>` +
          `<div class="stat"><b>${bidCount}</b>총 입찰 건수</div>` +
          `<div class="stat"><b>${new Set(BIDS.map(b => b.name + "|" + b.contact)).size}</b>입찰자 수</div>` +
          `<div class="stat"><b>${[...map.values()].filter(l => l.length > 1).length}</b>경쟁 품목</div>` +
          `<div class="stat warn"><b>${n("bid")}</b>미처리</div>` +
          `<div class="stat"><b>${n("contact") + n("prog")}</b>연락·진행중</div>` +
          `<div class="stat"><b>${n("done")}</b>거래완료 <small>${won(doneSum) || "₩0"}</small></div>` +
          `<div class="stat"><b>${won(expSum) || "₩0"}</b>예상 수령 <small>품목별 1순위만</small></div>`;
      })();
}

function renderCards() {
  const q = document.getElementById("q").value.trim().toLowerCase();
  const sortBy = document.getElementById("sort").value;
  const map = group(BIDS);

  /* 카드 보기에도 상태 필터 적용 — 기본은 완료·취소 숨김 (표와 동일) */
  const st = PREVIEW ? "" : document.getElementById("state").value;
  const stOK = b => !st || (st === "active" ? !["done", "drop"].includes(stateOf(b)) : stateOf(b) === st);
  let groups = [...map.entries()]
    .map(([key, list]) => ({ key, list: list.filter(stOK) }))
    .filter(g => g.list.length)
    .map(({ key, list }) => ({
      key, list, rs: list[0].resolved,
      item: list[0].resolved.name,
      max: Math.max(...list.map(b => +b.price || 0)),
      last: Math.max(...list.map(b => Date.parse(b.ts) || b.row)),
    }));

  if (q) groups = groups.filter(g =>
    (g.item + " " + g.list[0].item + " " + (g.rs.cat || "")).toLowerCase().includes(q) ||
    g.list.some(b => (b.name + " " + b.contact).toLowerCase().includes(q)));

  groups.sort((a, b) =>
    sortBy === "bids"  ? b.list.length - a.list.length :
    sortBy === "price" ? b.max - a.max :
    sortBy === "name"  ? (a.rs.cat || "힣").localeCompare(b.rs.cat || "힣", "ko")
                         || (a.rs.num || 999) - (b.rs.num || 999) :
                         b.last - a.last);

  const head = g => `
    <div class="item-head">
      <div class="item-name">
        ${g.rs.matched
          ? `<span class="pnum">${esc(g.rs.cat)} ${g.rs.num}</span>`
          : `<span class="pnum warn">미매칭</span>`}
        ${esc(g.item)}
        ${g.rs.split ? `<span class="pnum dup">같은 이름 여러 개 · 번호별로 나눔</span>` : ""}
        ${g.rs.matched && g.list[0].item !== g.item
          ? `<div class="was">시트 표기: ${esc(g.list[0].item)}</div>` : ""}
      </div>
      <div class="item-meta">${PREVIEW ? "예약중" : g.list.length + "건" + (g.list.length > 1 ? " · 경쟁" : "")}</div>
    </div>`;

  if (PREVIEW) {
    document.getElementById("list").innerHTML = groups.length
      ? groups.map(g => `<div class="item">${head(g)}</div>`).join("")
      : `<div class="empty">표시할 품목이 없어요.</div>`;
    return;
  }

  document.getElementById("list").innerHTML = groups.length ? groups.map(g => `
    <div class="item">
      ${head(g)}
      ${g.list.map(b => `
        <div class="bid">
          <div class="rank r${b.rank <= 3 ? b.rank : ""}">${b.rank}</div>
          <div>
            <div class="who">${esc(b.name || "(이름 없음)")}<span class="contact">${esc(fmtContact(b.contact))}</span>${b.dupes ? `<span class="contact">중복 ${b.dupes}건 합침</span>` : ""}</div>
            <div class="when">${esc(b.ts || "시각 미기록")}</div>
            ${b.message ? `<div class="msg">${esc(b.message)}</div>` : ""}
          </div>
          <div class="price ${b.price ? "" : "none"}">${b.price ? won(b.price) : "금액 미기재"}</div>
        </div>`).join("")}
    </div>`).join("") : `<div class="empty">표시할 입찰이 없어요.</div>`;
}

function renderRaw() {
  document.getElementById("raw").innerHTML = (DATA.sheets || []).map(sh => `
    <h4 style="margin:14px 0 6px;font-size:13.5px">${esc(sh.sheet)} (${(sh.rows || []).length}행)</h4>
    <table>
      <tr>${(sh.headers || []).map(h => `<th>${esc(h)}</th>`).join("")}</tr>
      ${(sh.rows || []).map(r => `<tr>${r.map(c => `<td>${esc(c == null ? "" : c)}</td>`).join("")}</tr>`).join("")}
    </table>`).join("");
}
