async function bulkApply(next, picked) {
  const label = { bid: "미처리로 되돌림", done: "거래완료", drop: "취소" }[next];
  const todo = picked.filter(r => selState(stateOf(r)) !== next || (next === "bid" && stateOf(r) !== "bid"));
  if (!todo.length) { syncFlag(`선택한 건이 이미 전부 그 상태예요`, ""); return; }
  /* 수량이 여러 개인 품목은 "몇 개를 빼고 몇 개가 남는지"를 확인창에 그대로 보여준다.
     예전에는 품목명만 알려줘서 입찰 수량이 반영되는지 확인할 방법이 없었다. */
  const multiQty = [];
  if (next === "done") {
    const seen = new Set();
    todo.forEach(r => {
      const it = ITEMS.find(x => x.sku === r.rs.sku) || {};
      const total = it.qty || 1;
      if (total <= 1 || seen.has(r.rs.key)) return;
      seen.add(r.rs.key);
      const soldQ = todo.filter(o => o.rs.key === r.rs.key).reduce((s, o) => s + (o.qty || 1), 0);
      const cur = it.remain != null ? it.remain : total;
      const left = Math.max(0, cur - soldQ);
      multiQty.push(`${r.rs.name} — ${soldQ}개 판매, ${left === 0 ? "전량 판매완료" : `${left}개 남음`}`);
    });
  }
  if (!confirm(`선택 ${todo.length}건을 ${label} 처리할까요?` +
    (next === "drop" ? "\n(목록에는 취소 기록으로 남습니다)" : "") +
    (multiQty.length ? `\n\n수량이 여러 개인 품목:\n· ${multiQty.join("\n· ")}` : ""))) return;

  /* 로컬 반영·화면 갱신을 먼저 끝내고, 서버 전송은 한꺼번에 병렬로 보낸다.
     건별로 await 하면 왕복(2~3초)이 건수만큼 쌓여 10건에 30초씩 걸렸다. */
  adminPw();                                    // 비밀번호를 먼저 확보 (병렬 중 프롬프트 방지)
  /* 상태를 바꾸기 전에 "완료였던 건"을 기억해 둔다 — 복원 수량 계산에 필요 */
  const prevDone = new Set(todo.filter(r => stateOf(r) === "done").map(r => r.uid));
  todo.forEach(r => setOV(r.uid, { state: next }));
  SEL.clear();
  renderGrid(); renderStats();
  syncFlag(`${todo.length}건 ${label} 처리 중…`);

  const jobs = todo.map(r => pushOverride("state", r.uid, next, `${r.name} ${label}`));

  /* 구매페이지 반영 — 품목 단위로 모아 한 번의 요청으로 */
  const items = new Map();
  todo.forEach(r => items.set(r.rs.sku || r.rs.name, r));
  const statusList = [];
  for (const r of items.values()) {
    const skip = r.rs.settle || r.rs.matched === false;
    const it = ITEMS.find(x => x.sku === r.rs.sku) || {};
    if (next === "done") {
      /* 입찰서의 수량만큼만 차감 — 2개 중 1개 거래면 1개는 판매중으로 남는다.
         예전엔 무조건 전량 판매완료로 밀어서 남은 재고가 사라져 보였다. */
      const total = it.qty || 1;
      const soldQ = todo.filter(o => o.rs.key === r.rs.key).reduce((s2, o) => s2 + (o.qty || 1), 0);
      const cur = it.remain != null ? it.remain : total;
      const remain = Math.max(0, cur - soldQ);
      if (total > 1) it.remain = remain;
      statusList.push({ name: r.rs.name, status: remain === 0 ? "sold" : "sale",
        sku: r.rs.sku, remain: total > 1 ? remain : null, skip });
    } else {
      /* 미처리 복귀·취소 공통: 이번에 무효가 된 완료 거래의 수량만큼만 남은수량을 되살린다.
         전체 수량(fullQty)으로 되돌리면 이미 팔린 몫이 부활한다. 판정은 전부 sku(key) 기준 —
         이름 비교는 동명이품을 오염시킨다. */
      const addBack = todo.filter(o => o.rs.key === r.rs.key && prevDone.has(o.uid))
        .reduce((s2, o) => s2 + (o.qty || 1), 0);
      const lastGone = next === "drop" && ![...ROWMAP.values()]
        .some(o => o.rs.key === r.rs.key && stateOf(o) !== "drop" && !isDropped(o));
      /* 완료였던 거래가 무효화됐으면(addBack>0) 그 몫만큼 복원.
         일괄 취소로 그 품목의 마지막 입찰이 사라졌으면 판매중 복원(수량은 유지). */
      if (addBack > 0 || lastGone) {
        const { remain } = restoredRemain(r.rs, addBack);
        statusList.push({ name: r.rs.name, status: "sale", sku: r.rs.sku, remain, skip });
      }
    }
  }
  if (statusList.length) jobs.push(pushStatusBatch(statusList));
  await Promise.all(jobs);
  renderGrid(); renderStats();
  syncFlag(`${todo.length}건 ${label} 처리됨`, "ok");
}

function updateSelBar(all) {
  const bar = document.getElementById("selbar");
  const picked = all.filter(r => SEL.has(r.uid));
  const ss = document.getElementById("selstate");
  ss.value = "";
  ss.onchange = () => { const v = ss.value; ss.value = ""; if (v) bulkApply(v, picked); };
  if (!picked.length) { bar.classList.add("hide"); document.body.style.paddingBottom = "60px"; return; }
  const sum = picked.filter((r,i,a)=>a.findIndex(x=>x.row===r.row&&x.name===r.name&&x.contact===r.contact)===i).reduce((s, r) => s + (+r.price || 0), 0);
  const askSum = picked.filter((r,i,a)=>a.findIndex(x=>x.rs.key===r.rs.key)===i).reduce((s, r) => s + (r.rs.ask || 0), 0);
  const people = new Set(picked.map(r => r.name));
  bar.classList.remove("hide");
  document.body.style.paddingBottom = "76px";
  document.getElementById("selinfo").innerHTML =
    `선택 <b>${picked.length}</b>건 · 입찰자 ${people.size}명 · 입찰 합계 <b>${won(sum) || "₩0"}</b>` +
    (askSum ? ` <span style="opacity:.7">(희망가 합계 ${won(askSum)})</span>` : "");
  document.getElementById("selcopy").onclick = () => {
    const txt = picked.map(r =>
      `[${r.rs.cat} ${r.rs.num}] ${r.rs.name}\t${r.name}\t${r.price ? Number(r.price).toLocaleString() + "원" : "미기재"}`).join("\n")
      + `\n합계\t${sum.toLocaleString()}원`;
    navigator.clipboard.writeText(txt).then(
      () => { const b = document.getElementById("selcopy"); b.textContent = "복사됨"; setTimeout(() => b.textContent = "선택 내역 복사", 1200); },
      () => alert("복사 실패"));
  };
}

