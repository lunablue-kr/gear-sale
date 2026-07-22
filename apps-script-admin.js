/* ============================================================
   관리자 기능 — Apps Script 추가 코드
   (비밀번호는 코드가 아니라 스크립트 속성에 저장되므로 이 파일엔 비밀이 없음)

   하는 일
   ---------------------------------------------------------
   1) 입찰 내역 조회      : POST {action:'bids', pw}          → 비밀번호 필요
   2) 판매상태 저장       : POST {action:'setStatus', pw, ...} → 비밀번호 필요
   3) 판매상태 공개 조회  : GET  ?action=status                → 비밀번호 불필요
        · 품목명과 상태(sold/sale)만 나감. 입찰자 이름·연락처는 절대 안 나감
        · 구매 페이지가 이걸 읽어서 판매완료를 실시간 반영함
   4) 금액수정·거래메모 저장/조회 : POST {action:'setOverride'|'getOverrides', pw}
        · 비밀번호 필요. 공개 조회로는 절대 안 나감
        · 브라우저를 바꾸거나 캐시를 지워도 내용이 유지됨

   설치 방법
   ---------------------------------------------------------
   1) 구글시트 → 확장 프로그램 → Apps Script

   2) 기존 doGet 함수의 "첫 줄"에 아래 1줄을 넣는다:

        function doGet(e) {
          if (e && e.parameter && e.parameter.action === 'status') return publicStatus_();
          ...기존 코드 그대로...
        }

   3) 기존 doPost 함수의 "첫 줄"에 아래 3줄을 넣는다:

        function doPost(e) {
          var _b = {}; try { _b = JSON.parse(e.postData.contents); } catch (_) {}
          if (_b.action === 'bids')         return adminBids_(_b);
          if (_b.action === 'setStatus')    return adminSetStatus_(_b);
          if (_b.action === 'setOverride')  return adminSetOverride_(_b);
          if (_b.action === 'getOverrides') return adminGetOverrides_(_b);
          ...기존 코드 그대로...
        }

   4) 이 파일 아래쪽 함수 전체를 파일 맨 끝에 붙여넣는다.

   5) 프로젝트 설정(톱니) → 스크립트 속성 → 속성 추가
        속성: ADMIN_PW      값: (원하는 비밀번호, 16자 이상 권장)

   6) 배포 → 배포 관리 → 기존 배포 편집(연필) → 버전 "새 버전" → 배포
      ※ 반드시 "새 배포"가 아니라 "기존 배포 편집"으로 해야 URL이 유지됨
   ============================================================ */

var STATUS_SHEET = '판매상태';
var OVERRIDE_SHEET = '관리메모';

function jsonOut_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

function checkPw_(body) {
  var pw = PropertiesService.getScriptProperties().getProperty('ADMIN_PW');
  if (!pw) return '스크립트 속성 ADMIN_PW 가 설정되지 않았습니다.';
  if (String(body.pw || '') !== String(pw)) return 'unauthorized';
  return null;
}

/* 판매상태 시트 (없으면 만든다) — 품목명 | 상태 | 갱신시각 | 메모 */
function statusSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(STATUS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(STATUS_SHEET);
    sh.appendRow(['품목명', '상태', '갱신시각', '메모']);
  }
  return sh;
}

/* ---------- 1) 입찰 내역 조회 (비밀번호 필요) ---------- */
function adminBids_(body) {
  var err = checkPw_(body);
  if (err) return jsonOut_({ ok: false, error: err });

  var sheets = [];
  SpreadsheetApp.getActive().getSheets().forEach(function (sh) {
    var values = sh.getDataRange().getValues();
    if (!values.length) return;
    sheets.push({
      sheet: sh.getName(),
      headers: values[0].map(function (h) { return String(h); }),
      rows: values.slice(1).map(function (r) {
        return r.map(function (c) {
          return (c instanceof Date) ? Utilities.formatDate(c, 'Asia/Seoul', 'yyyy-MM-dd HH:mm') : c;
        });
      })
    });
  });
  return jsonOut_({ ok: true, sheets: sheets });
}

/* ---------- 2) 판매상태 저장 (비밀번호 필요) ----------
   body.items = [{ name:'품목명', status:'sold'|'sale', memo:'' }, ...]
   같은 품목명이 이미 있으면 덮어쓰고, 없으면 새로 추가한다.            */
function adminSetStatus_(body) {
  var err = checkPw_(body);
  if (err) return jsonOut_({ ok: false, error: err });

  var items = body.items || [];
  if (!items.length) return jsonOut_({ ok: false, error: '저장할 품목이 없습니다.' });

  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return jsonOut_({ ok: false, error: '다른 저장이 진행 중입니다.' }); }

  try {
    var sh = statusSheet_();
    var values = sh.getDataRange().getValues();
    var rowOf = {};
    for (var i = 1; i < values.length; i++) rowOf[String(values[i][0])] = i + 1;

    var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    items.forEach(function (it) {
      var name = String(it.name || '').trim();
      if (!name) return;
      var row = [name, String(it.status || 'sale'), now, String(it.memo || '')];
      if (rowOf[name]) sh.getRange(rowOf[name], 1, 1, 4).setValues([row]);
      else { sh.appendRow(row); rowOf[name] = sh.getLastRow(); }
    });
    SpreadsheetApp.flush();
    return jsonOut_({ ok: true, saved: items.length, at: now });
  } finally {
    lock.releaseLock();
  }
}

/* 관리메모 시트 (없으면 만든다) — 종류 | 키 | 값 | 갱신시각
   종류 'price' : 키 = 입찰행 식별자, 값 = 수정한 금액
   종류 'note'  : 키 = "이름|연락처", 값 = 거래 메모            */
function overrideSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(OVERRIDE_SHEET);
  if (!sh) {
    sh = ss.insertSheet(OVERRIDE_SHEET);
    sh.appendRow(['종류', '키', '값', '갱신시각']);
  }
  return sh;
}

/* ---------- 4-1) 금액수정·거래메모 저장 (비밀번호 필요) ----------
   body.kind = 'price' | 'note',  body.key,  body.value ('' 이면 삭제)   */
function adminSetOverride_(body) {
  var err = checkPw_(body);
  if (err) return jsonOut_({ ok: false, error: err });

  var kind = String(body.kind || '');
  var key = String(body.key || '');
  if (kind !== 'price' && kind !== 'note') return jsonOut_({ ok: false, error: '알 수 없는 종류입니다.' });
  if (!key) return jsonOut_({ ok: false, error: '키가 없습니다.' });

  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return jsonOut_({ ok: false, error: '다른 저장이 진행 중입니다.' }); }

  try {
    var sh = overrideSheet_();
    var values = sh.getDataRange().getValues();
    var target = 0;
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0]) === kind && String(values[i][1]) === key) { target = i + 1; break; }
    }
    var value = String(body.value == null ? '' : body.value);
    var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');

    if (!value) {                                   // 빈 값이면 행 삭제
      if (target) sh.deleteRow(target);
    } else if (target) {
      sh.getRange(target, 1, 1, 4).setValues([[kind, key, value, now]]);
    } else {
      sh.appendRow([kind, key, value, now]);
    }
    SpreadsheetApp.flush();
    return jsonOut_({ ok: true, at: now });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- 4-2) 금액수정·거래메모 조회 (비밀번호 필요) ---------- */
function adminGetOverrides_(body) {
  var err = checkPw_(body);
  if (err) return jsonOut_({ ok: false, error: err });

  var price = {}, note = {};
  var sh = SpreadsheetApp.getActive().getSheetByName(OVERRIDE_SHEET);
  if (sh) {
    var values = sh.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
      var kind = String(values[i][0]), key = String(values[i][1]), val = String(values[i][2]);
      if (!key) continue;
      if (kind === 'price') price[key] = val;
      else if (kind === 'note') note[key] = val;
    }
  }
  return jsonOut_({ ok: true, price: price, note: note });
}

/* ---------- 3) 판매상태 공개 조회 (비밀번호 불필요) ----------
   품목명과 상태만 반환. 입찰자 정보는 일절 포함하지 않는다.        */
function publicStatus_() {
  var sold = [], sale = [];
  var sh = SpreadsheetApp.getActive().getSheetByName(STATUS_SHEET);
  if (sh) {
    var values = sh.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
      var name = String(values[i][0] || '').trim();
      var st = String(values[i][1] || '').trim();
      if (!name) continue;
      if (st === 'sold') sold.push(name);
      else if (st === 'sale') sale.push(name);
    }
  }
  return jsonOut_({ ok: true, sold: sold, sale: sale });
}
