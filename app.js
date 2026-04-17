// ===================== STATE =====================
let state = {
  members: [],
  attendance: {},   // { "week1": { memberId: true/false } }
  holidays: {},     // { "week1": { isHoliday: bool, note: str } }
  currentWeek: 1,
  currentDayFilter: "all",
  currentSort: "name",
  semesterName: "الأول",
  hijriYear: "1447",
  semesterStart: null,
  semesterEnd: null,
  weeks: []
};

const DAY_NAMES = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس"];

// ===================== PERSISTENCE =====================
function saveState() {
  localStorage.setItem("att_v5", JSON.stringify(state));
}
function loadState() {
  const raw = localStorage.getItem("att_v5");
  if (raw) { try { state = JSON.parse(raw); } catch(e) {} }
  if (!state.members || !state.members.length)
    state.members = JSON.parse(JSON.stringify(DB_MEMBERS));
  if (!state.holidays) state.holidays = {};
}

// ===================== DATE HELPERS =====================
function fmtLong(d)  { return new Date(d+"T00:00:00").toLocaleDateString("ar-SA-u-ca-islamic",{day:"numeric",month:"long",year:"numeric"}); }
function fmtShort(d) { return new Date(d+"T00:00:00").toLocaleDateString("ar-SA-u-ca-islamic",{day:"numeric",month:"long"}); }

function calcWeeks(s, e) {
  const end = new Date(e+"T00:00:00");
  let cur   = new Date(s+"T00:00:00");
  const weeks = []; let n = 1;
  while (cur <= end) {
    const ws = cur.toISOString().slice(0,10);
    const we = new Date(cur); we.setDate(we.getDate()+6);
    const weReal = we > end ? end : we;
    weeks.push({ num:n, label:`${fmtShort(ws)} — ${fmtShort(weReal.toISOString().slice(0,10))}`, startDate:ws, endDate:weReal.toISOString().slice(0,10) });
    cur.setDate(cur.getDate()+7); n++;
  }
  return weeks;
}

// ===================== HELPERS =====================
function uid()       { return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function initials(n) { return n.trim().split(/\s+/).slice(0,2).map(w=>w[0]||"").join(""); }

function attendanceStats(memberId) {
  // Per-lecture format: attendance[week][memberId_idx]
  let totalSlots=0, presentSlots=0;
  Object.keys(state.attendance).forEach(w=>{
    const wData=state.attendance[w];
    if (!wData) return;
    // count only keys that belong to this member
    const keys=Object.keys(wData).filter(k=>k===memberId||k.startsWith(memberId+"_"));
    if (!keys.length) return;
    keys.forEach(k=>{ totalSlots++; if(wData[k]===true) presentSlots++; });
  });
  if (!totalSlots) return null;
  const absent=totalSlots-presentSlots;
  const pct=Math.round((presentSlots/totalSlots)*100);
  return {present:presentSlots, absent, total:totalSlots, pct};
}

function isMemberAbsentInWeek(memberId, weekKey) {
  const wData=state.attendance[weekKey];
  if (!wData) return false;
  const keys=Object.keys(wData).filter(k=>k===memberId||k.startsWith(memberId+"_"));
  if (!keys.length) return false;
  return keys.every(k=>wData[k]===false);
}

function getAbsentWeeks(memberId) {
  return Object.keys(state.attendance)
    .filter(w=>{
      const wData=state.attendance[w];
      if (!wData) return false;
      const keys=Object.keys(wData).filter(k=>k===memberId||k.startsWith(memberId+"_"));
      return keys.some(k=>wData[k]===false);
    })
    .map(w=>{ const n=parseInt(w.replace("week","")); return {num:n, wk:state.weeks[n-1]}; })
    .sort((a,b)=>a.num-b.num);
}

function pctClass(pct) {
  if (pct===null||pct===undefined) return "badge-new";
  if (pct>=80) return "badge-success";
  if (pct>=60) return "badge-warn";
  return "badge-danger";
}
function pctFill(pct)  { if (!pct) return "danger"; if (pct>=80) return ""; if (pct>=60) return "warn"; return "danger"; }
function pctColor(pct) { if (!pct) return "var(--red-text)"; if (pct>=80) return "var(--green-text)"; if (pct>=60) return "var(--amber-text)"; return "var(--red-text)"; }

function showToast(msg, dur=2600) {
  const t=document.getElementById("toast");
  t.textContent=msg; t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), dur);
}

function updateSemesterBadge() {
  const el=document.getElementById("semester-badge");
  if (state.weeks.length && state.semesterName && state.hijriYear)
    el.textContent=`${state.weeks.length} أسبوع · الفصل ${state.semesterName} ${state.hijriYear} هـ`;
  else if (state.weeks.length)
    el.textContent=`${state.weeks.length} أسبوع`;
  else
    el.textContent="لم يُحدَّد الفصل بعد";
}

// ===================== SEMESTER SETUP =====================
function applySemester() {
  state.semesterName = document.getElementById("f-sem-name").value;
  state.hijriYear    = document.getElementById("f-hijri-year").value.trim() || state.hijriYear;
  saveState(); updateSemesterBadge();
  showToast(`الفصل ${state.semesterName} ${state.hijriYear} هـ ✓`);
}

function calcWeeksHandler() {
  const s=document.getElementById("f-sem-start").value;
  const e=document.getElementById("f-sem-end").value;
  if (!s||!e)  { showToast("حدد تاريخي البداية والنهاية"); return; }
  if (s>=e)    { showToast("البداية يجب أن تكون قبل النهاية"); return; }
  state.semesterStart=s; state.semesterEnd=e;
  state.weeks=calcWeeks(s,e);
  if (state.currentWeek>state.weeks.length) state.currentWeek=1;
  saveState(); updateSemesterBadge(); renderWeeksPreview(); renderAttendance();
  showToast(`تم احتساب ${state.weeks.length} أسبوع ✓`);
}

function renderWeeksPreview() {
  const el=document.getElementById("weeks-preview");
  if (!state.weeks.length){ el.innerHTML=""; return; }
  const rows = state.weeks.map(w => {
    const hol      = state.holidays["week"+w.num] || {};
    const isHol    = !!hol.isHoliday;
    const wData    = state.attendance["week"+w.num] || {};
    const recorded = Object.keys(wData).length > 0;
    const absCnt   = state.members.filter(m => wData[m.id] === false).length;
    const allPres  = recorded && absCnt === 0;

    let chipCls = "";
    let tag     = "";
    if (isHol) {
      chipCls = "week-chip-holiday";
      tag     = "<span class=\"hol-tag\">إجازة</span>";
    } else if (recorded && absCnt > 0) {
      chipCls = "week-chip-recorded";
      tag     = "<span class=\"hol-tag absent-tag\">غياب " + absCnt + "</span>";
    } else if (allPres) {
      chipCls = "week-chip-recorded";
      tag     = "<span class=\"hol-tag present-tag\">✓</span>";
    }

    return "<div class=\"week-chip " + chipCls + "\" onclick=\"goToWeek(" + w.num + ")\">"
      + "<span class=\"week-chip-num\">" + w.num + "</span>"
      + "<span class=\"week-chip-label\">" + w.label + "</span>"
      + tag
      + "</div>";
  }).join("");

  el.innerHTML =
    "<div class=\"weeks-summary\">"
    + "<div class=\"weeks-summary-header\">"
    + "<span>إجمالي الأسابيع: <strong>" + state.weeks.length + "</strong></span>"
    + "<span>" + fmtLong(state.semesterStart) + " — " + fmtLong(state.semesterEnd) + "</span>"
    + "</div>"
    + "<div class=\"weeks-grid\">" + rows + "</div>"
    + "</div>";
}

function goToWeek(num) {
  // Just open the modal directly — no tab switching
  openWeekModal(num);
}

// ===================== WEEK MODAL =====================
function openWeekModal(num) {
  const wk    = state.weeks[num-1];
  const wData = state.attendance["week"+num] || {};
  const hol   = state.holidays["week"+num]   || {};

  // Title
  document.getElementById("modal-week-title").textContent =
    "الأسبوع " + num + (wk ? " — " + wk.label : "");

  // Holiday banner
  const holEl = document.getElementById("modal-holiday");
  if (hol.isHoliday) {
    holEl.style.display="block";
    holEl.textContent="🏖️ إجازة رسمية" + (hol.note ? " — "+hol.note : "");
  } else {
    holEl.style.display="none";
  }

  const hasSaved = Object.keys(wData).length > 0;
  if (!hasSaved) {
    document.getElementById("modal-body").innerHTML =
      '<div class="modal-not-recorded">📋 لم يُسجَّل حضور لهذا الأسبوع بعد</div>';
    document.getElementById("week-modal-overlay").style.display="flex";
    return;
  }

  // Build per-lecture absent/present lists
  // key format: memberId or memberId_lectureIndex
  const absentMembers  = [];  // { member, lectures[] }
  const presentMembers = [];

  state.members.forEach(m => {
    const sched = m.schedule || [];
    // collect all lecture keys for this member
    const lectureEntries = sched.map((s, idx) => {
      const key = m.id + "_" + idx;
      // also try plain memberId for old format
      const val = key in wData ? wData[key] : (m.id in wData ? wData[m.id] : undefined);
      return { s, key, val };
    });

    const recorded = lectureEntries.some(e => e.val !== undefined);
    if (!recorded) return;

    const absentLectures  = lectureEntries.filter(e => e.val === false);
    const presentLectures = lectureEntries.filter(e => e.val === true);

    if (absentLectures.length > 0)  absentMembers.push({ m, absentLectures, presentLectures });
    else if (presentLectures.length > 0) presentMembers.push({ m, presentLectures });
  });

  function lectureChips(lectures) {
    return lectures.map(({s}) =>
      '<div class="modal-sched-line">' +
        '<span class="mchip day">'  + s.day + '</span>' +
        '<span class="mchip">'      + (s.course||"—") + '</span>' +
        '<span class="mchip">شعبة '+ (s.section||"—") + '</span>' +
        '<span class="mchip room">' + (s.room||"—") + '</span>' +
        '<span class="mchip time">⏰ ' + (s.start||"") + "–" + (s.end||"") + '</span>' +
      '</div>'
    ).join("");
  }

  function memberBlock(m, absentL, presentL) {
    const hasAbsent  = absentL  && absentL.length  > 0;
    const hasPresent = presentL && presentL.length > 0;
    return '<div class="modal-member-block' + (hasAbsent ? " absent-row" : "") + '">' +
      '<div class="modal-member-top">' +
        '<div class="avatar-sm">' + initials(m.name) + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div class="modal-mname">' + m.name + '</div>' +
          '<div class="modal-mcollege">' + (m.college||"كلية العلوم") + '</div>' +
        '</div>' +
        (hasAbsent
          ? '<span class="badge badge-danger">غائب ('+(absentL.length)+' محاضرة)</span>'
          : '<span class="badge badge-success">حاضر</span>') +
      '</div>' +
      (hasAbsent ? '<div class="modal-sched-wrap absent-sched"><div class="modal-mini-label">المحاضرات الغائبة:</div>' + lectureChips(absentL) + '</div>' : "") +
      (hasAbsent && hasPresent ? '<div class="modal-sched-wrap present-sched"><div class="modal-mini-label">المحاضرات الحاضرة:</div>' + lectureChips(presentL) + '</div>' : "") +
    '</div>';
  }

  let html = "";

  // Absent section
  html += '<div class="modal-section-title absent-title">الغائبون — ' + absentMembers.length + ' عضو</div>';
  html += absentMembers.length
    ? absentMembers.map(({m,absentLectures,presentLectures}) =>
        memberBlock(m, absentLectures, presentLectures)).join("")
    : '<div class="modal-empty-ok">✓ لا يوجد غائبون في هذا الأسبوع</div>';

  // Present section
  html += '<div class="modal-section-title present-title">الحاضرون — ' + presentMembers.length + ' عضو</div>';
  html += presentMembers.map(({m,presentLectures}) =>
    memberBlock(m, [], presentLectures)).join("");

  document.getElementById("modal-body").innerHTML = html;
  document.getElementById("week-modal-overlay").style.display="flex";
}

function closeWeekModal() {
  document.getElementById("week-modal-overlay").style.display="none";
}

// ===================== HOLIDAY =====================
function toggleHoliday() {
  const chk  = document.getElementById("chk-holiday");
  const note = document.getElementById("holiday-note");
  note.style.display = chk.checked ? "block" : "none";
  if (!chk.checked) note.value = "";
}

function saveHoliday() {
  const w   = `week${state.currentWeek}`;
  const chk = document.getElementById("chk-holiday").checked;
  const note= document.getElementById("holiday-note").value.trim();
  state.holidays[w] = { isHoliday:chk, note };
  saveState(); renderWeeksPreview();
}

// ===================== SCHEDULE ROWS =====================
let schedRowCount=0;
function addSchedRow(r={}) {
  schedRowCount++;
  const id=schedRowCount;
  const c=document.getElementById("schedule-rows");
  const div=document.createElement("div");
  div.className="sched-row"; div.dataset.rid=id;
  div.innerHTML=`
    <select class="sr-day">${DAY_NAMES.map(d=>`<option ${d===(r.day||"")?"selected":""}>${d}</option>`).join("")}</select>
    <input class="sr-section" type="text" placeholder="الشعبة"   value="${r.section||""}" style="width:75px"/>
    <input class="sr-course"  type="text" placeholder="المقرر"   value="${r.course||""}"  style="flex:1;min-width:110px"/>
    <input class="sr-room"    type="text" placeholder="القاعة"   value="${r.room||""}"    style="width:75px"/>
    <input class="sr-start"   type="time" value="${r.start||"08:00"}" style="width:100px"/>
    <span style="font-size:11px;color:var(--text3)">—</span>
    <input class="sr-end"     type="time" value="${r.end||"09:45"}"   style="width:100px"/>
    <button class="dt-remove" onclick="removeSchedRow(${id})">✕</button>`;
  c.appendChild(div);
}
function removeSchedRow(id) { document.querySelector(`.sched-row[data-rid="${id}"]`)?.remove(); }
function getSchedule() {
  return [...document.querySelectorAll(".sched-row")].map(r=>({
    day:     r.querySelector(".sr-day").value,
    section: r.querySelector(".sr-section").value.trim(),
    course:  r.querySelector(".sr-course").value.trim(),
    room:    r.querySelector(".sr-room").value.trim(),
    start:   r.querySelector(".sr-start").value,
    end:     r.querySelector(".sr-end").value,
  })).filter(r=>r.course||r.section);
}
function clearForm() {
  document.getElementById("f-edit-id").value="";
  document.getElementById("f-name").value="";
  document.getElementById("f-college").value="كلية العلوم";
  document.getElementById("schedule-rows").innerHTML="";
  schedRowCount=0; addSchedRow();
}

// ===================== RENDER: DATABASE =====================
let currentSearch="";
function renderDatabase() {
  const q=currentSearch.toLowerCase();
  const filtered=state.members.filter(m=>
    m.name.toLowerCase().includes(q)||
    (m.schedule||[]).some(s=>s.course.toLowerCase().includes(q)||s.section.includes(q)||s.room.includes(q))
  );
  document.getElementById("db-count").textContent=`إجمالي: ${state.members.length} — معروض: ${filtered.length}`;
  const list=document.getElementById("members-list");
  if (!filtered.length){ list.innerHTML='<div class="empty-state">لا توجد نتائج</div>'; return; }
  list.innerHTML=filtered.map(m=>{
    const st=attendanceStats(m.id);
    const pct=st?st.pct:null;
    const schedHtml=(m.schedule||[]).map(s=>`
      <div class="sched-item">
        <span class="chip amber">${s.day}</span>
        <span class="chip teal">شعبة ${s.section||"—"}</span>
        <span class="chip purple">${s.course||"—"}</span>
        <span class="chip">🏛 ${s.room||"—"}</span>
        <span class="chip">${s.start||""}–${s.end||""}</span>
      </div>`).join("");
    return `
      <div class="member-card">
        <div class="member-header">
          <div class="avatar">${initials(m.name)}</div>
          <div style="flex:1;min-width:0">
            <div class="member-name">${m.name}</div>
            <div class="member-sub">${m.college||"كلية العلوم"} · ${(m.schedule||[]).length} محاضرة</div>
          </div>
          <span class="badge ${pctClass(pct)}">${pct!==null?pct+"%":"جديد"}</span>
        </div>
        <div class="sched-list">${schedHtml}</div>
        <div class="member-actions">
          <button class="btn-sm btn-edit" onclick="editMember('${m.id}')">✏️ تعديل</button>
          <button class="btn-sm btn-del"  onclick="deleteMember('${m.id}')">🗑 حذف</button>
        </div>
      </div>`;
  }).join("");
}

function showAddForm() {
  clearForm();
  document.getElementById("form-title").textContent="إضافة عضو جديد";
  document.getElementById("add-edit-card").style.display="block";
  document.getElementById("add-edit-card").scrollIntoView({behavior:"smooth"});
}
function editMember(id) {
  const m=state.members.find(x=>x.id===id); if(!m) return;
  document.getElementById("f-edit-id").value=id;
  document.getElementById("f-name").value=m.name;
  document.getElementById("f-college").value=m.college||"كلية العلوم";
  document.getElementById("schedule-rows").innerHTML=""; schedRowCount=0;
  (m.schedule||[]).forEach(r=>addSchedRow(r));
  if (!m.schedule?.length) addSchedRow();
  document.getElementById("form-title").textContent="تعديل بيانات العضو";
  document.getElementById("add-edit-card").style.display="block";
  document.getElementById("add-edit-card").scrollIntoView({behavior:"smooth"});
}
function saveMember() {
  const name=document.getElementById("f-name").value.trim();
  const college=document.getElementById("f-college").value.trim();
  const schedule=getSchedule();
  const editId=document.getElementById("f-edit-id").value;
  if (!name){ showToast("الاسم مطلوب"); return; }
  if (editId) {
    const idx=state.members.findIndex(m=>m.id===editId);
    if (idx>-1) state.members[idx]={...state.members[idx], name, college, schedule};
    showToast("تم التعديل ✓");
  } else {
    state.members.push({id:uid(), name, college, schedule});
    showToast(`تم إضافة ${name} ✓`);
  }
  saveState(); document.getElementById("add-edit-card").style.display="none"; clearForm();
  renderDatabase(); renderAttendance(); renderReport();
}
function deleteMember(id) {
  const m=state.members.find(x=>x.id===id);
  if (!confirm(`حذف "${m?.name}"؟`)) return;
  state.members=state.members.filter(x=>x.id!==id);
  Object.keys(state.attendance).forEach(w=>delete state.attendance[w][id]);
  saveState(); renderDatabase(); renderAttendance(); renderReport();
  showToast("تم الحذف");
}

// ===================== RENDER: ATTENDANCE =====================
function renderAttendance() {
  const w=state.currentWeek;
  const wk=state.weeks[w-1];
  const total=state.weeks.length||"—";
  document.getElementById("week-label").textContent=`الأسبوع ${w}`;
  document.getElementById("week-date").textContent=wk?wk.label:"";
  document.getElementById("week-counter").textContent=`${w} / ${total}`;

  // Restore holiday state
  const hol=state.holidays[`week${w}`]||{};
  const chk=document.getElementById("chk-holiday");
  const noteEl=document.getElementById("holiday-note");
  chk.checked=!!hol.isHoliday;
  noteEl.style.display=hol.isHoliday?"block":"none";
  noteEl.value=hol.note||"";

  const weekData=state.attendance[`week${w}`]||{};
  const dayF=state.currentDayFilter;
  const visible=state.members.filter(m=>dayF==="all"||(m.schedule||[]).some(s=>s.day===dayF));

  const list=document.getElementById("attendance-list");
  if (!visible.length){ list.innerHTML='<div class="empty-state">لا يوجد أعضاء لهذا اليوم</div>'; return; }

  list.innerHTML=visible.map(m=>{
    const rel=(dayF==="all"?m.schedule||[]:(m.schedule||[]).filter(s=>s.day===dayF));
    if (!rel.length) return "";
    const lectureRows = rel.map((s,idx)=>{
      const globalIdx = (m.schedule||[]).indexOf(s);
      const key = `${m.id}_${globalIdx}`;
      const present = weekData[key]!==false;
      return `
        <div class="attend-lecture-row ${hol.isHoliday?"holiday-row":""}">
          <label class="toggle">
            <input type="checkbox" data-key="${key}" ${present?"checked":""} onchange="toggleAttend(this)" ${hol.isHoliday?"disabled":""}/>
            <span class="toggle-track"></span>
          </label>
          <div class="attend-info">
            <div class="attend-lecture-meta">
              <span class="chip amber" style="font-size:.72rem">${s.day}</span>
              <span class="chip teal"  style="font-size:.72rem">شعبة ${s.section||"—"}</span>
              <span class="chip purple"style="font-size:.72rem">${s.course||"—"}</span>
              <span class="chip"       style="font-size:.72rem">🏛 ${s.room||"—"}</span>
              <span class="chip"       style="font-size:.72rem">${s.start}–${s.end}</span>
            </div>
          </div>
          <span class="badge ${hol.isHoliday?"badge-warn":present?"badge-success":"badge-danger"}" id="ab-${key}">
            ${hol.isHoliday?"إجازة":present?"حاضر":"غائب"}
          </span>
        </div>`;
    }).join("");
    return `
      <div class="attend-member-block">
        <div class="attend-member-name">${m.name}</div>
        ${lectureRows}
      </div>`;
  }).join("");
}

function toggleAttend(chk) {
  const w=`week${state.currentWeek}`;
  if (!state.attendance[w]) state.attendance[w]={};
  const key=chk.dataset.key;
  state.attendance[w][key]=chk.checked;
  const b=document.getElementById(`ab-${key}`);
  if(b){ b.textContent=chk.checked?"حاضر":"غائب"; b.className=`badge ${chk.checked?"badge-success":"badge-danger"}`; }
}

function saveWeek() {
  const w=`week${state.currentWeek}`;
  if (!state.attendance[w]) state.attendance[w]={};
  document.querySelectorAll("#attendance-list input[type=checkbox]").forEach(chk=>{
    if(chk.dataset.key) state.attendance[w][chk.dataset.key]=chk.checked;
  });
  saveHoliday();
  saveState(); renderReport();
  showToast(`تم حفظ سجل الأسبوع ${state.currentWeek} ✓`);
}

// ===================== RENDER: REPORT =====================
function renderReport() {
  const saved=Object.keys(state.attendance).filter(w=>Object.keys(state.attendance[w]).length>0);
  document.getElementById("stat-weeks").textContent=saved.length;
  document.getElementById("stat-members").textContent=state.members.length;
  if (!state.members.length) {
    document.getElementById("stat-avg").textContent="—";
    document.getElementById("report-list").innerHTML='<div class="empty-state">لا توجد بيانات</div>';
    document.getElementById("alerts-list").innerHTML='<div class="empty-state">لا توجد تنبيهات</div>';
    return;
  }

  const statsAll=state.members.map(m=>({m, st:attendanceStats(m.id)}));
  const withData=statsAll.filter(x=>x.st);
  const avg=withData.length?Math.round(withData.reduce((a,x)=>a+x.st.pct,0)/withData.length):null;
  document.getElementById("stat-avg").textContent=avg!==null?avg+"%":"—";

  // Sort
  const sort=state.currentSort;
  let sorted=[...statsAll];
  if (sort==="pct-asc")  sorted.sort((a,b)=>(a.st?.pct??101)-(b.st?.pct??101));
  if (sort==="pct-desc") sorted.sort((a,b)=>(b.st?.pct??-1)-(a.st?.pct??-1));
  if (sort==="absent")   sorted.sort((a,b)=>(b.st?.absent??0)-(a.st?.absent??0));
  if (sort==="name")     sorted.sort((a,b)=>a.m.name.localeCompare(b.m.name,"ar"));

  document.getElementById("report-list").innerHTML=sorted.map(({m,st})=>{
    const pct=st?st.pct:null; const pd=pct??0;
    const absentWeeks = st ? getAbsentWeeks(m.id) : [];
    return `
      <div class="report-row">
        <div class="avatar" style="width:36px;height:36px;font-size:.72rem">${initials(m.name)}</div>
        <div class="report-info">
          <div class="report-name">${m.name}</div>
          <div class="report-sub">${(m.schedule||[]).map(s=>s.course).filter((v,i,a)=>a.indexOf(v)===i).join(" · ")}</div>
          <div class="report-stats-row">
            ${st?`
              <span class="stat-pill green">${st.present} حاضر</span>
              <span class="stat-pill red">${st.absent} غائب</span>
              <span class="stat-pill blue">من ${st.total} أسبوع</span>
            `:`<span style="font-size:.75rem;color:var(--text3)">لم يُسجَّل بعد</span>`}
          </div>
          ${absentWeeks.length?`<div class="absent-weeks-list">غاب في: ${absentWeeks.map(w=>`<span class="absent-week-tag" onclick="openWeekModal(${w.num})">أسبوع ${w.num}</span>`).join("")}</div>`:""}
          <div class="progress-bar"><div class="progress-fill ${pctFill(pd)}" style="width:${pd}%"></div></div>
        </div>
        <div class="report-pct" style="color:${pctColor(pd)}">${pct!==null?pct+"%":"—"}</div>
      </div>`;
  }).join("");

  // Alerts
  const alerts=statsAll.filter(({st})=>st&&st.pct<75);
  document.getElementById("alerts-list").innerHTML=alerts.length
    ? alerts.map(({m,st})=>`
        <div class="alert-row">
          <span class="alert-icon">${st.pct<50?"🔴":"⚠️"}</span>
          <div style="flex:1">
            <div class="alert-text-title">${m.name}</div>
            <div class="alert-text-sub">
              حضور ${st.pct}% · غاب ${st.absent} من ${st.total} أسبوع
              ${st.pct<50?"— يحتاج تدخلاً عاجلاً":"— أقل من 75%"}
            </div>
          </div>
          <span class="badge ${pctClass(st.pct)}">${st.pct}%</span>
        </div>`).join("")
    : '<div class="empty-state">لا توجد تنبيهات — الحضور جيد ✓</div>';
}



// ===================== EXPORT =====================
function exportExcel() {
  if (!state.members.length){ showToast("لا توجد بيانات"); return; }
  const saved=Object.keys(state.attendance).sort((a,b)=>parseInt(a.replace("week",""))-parseInt(b.replace("week","")));
  const headers=["الاسم","المقررات","الشعب","القاعات","حاضر","غائب","نسبة الحضور",
    ...saved.map(w=>{ const n=parseInt(w.replace("week","")); const wk=state.weeks[n-1]; return wk?`أسبوع ${wk.num} (${wk.label})`:w; })];
  const rows=state.members.map(m=>{
    const st=attendanceStats(m.id);
    return [
      m.name,
      [...new Set((m.schedule||[]).map(s=>s.course))].join(" | "),
      [...new Set((m.schedule||[]).map(s=>s.section))].join(" | "),
      [...new Set((m.schedule||[]).map(s=>s.room))].join(" | "),
      st?st.present:"—", st?st.absent:"—", st?st.pct+"%":"—",
      ...saved.map(w=>{const v=state.attendance[w]?.[m.id]; return v===undefined?"—":v?"حاضر":"غائب";})
    ];
  });
  const csv=[headers,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"}));
  a.download="تقرير_الحضور.csv"; a.click(); showToast("تم التصدير ✓");
}

// ===================== INIT =====================
document.addEventListener("DOMContentLoaded", ()=>{
  loadState();

  // Nav
  document.querySelectorAll(".nav-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{
      document.querySelectorAll(".nav-btn").forEach(b=>b.classList.remove("active"));
      document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`screen-${btn.dataset.screen}`).classList.add("active");
    });
  });

  // Setup
  document.getElementById("btn-apply-semester").addEventListener("click", applySemester);
  document.getElementById("btn-calc-weeks").addEventListener("click", calcWeeksHandler);
  if (state.semesterStart) document.getElementById("f-sem-start").value=state.semesterStart;
  if (state.semesterEnd)   document.getElementById("f-sem-end").value=state.semesterEnd;
  if (state.semesterName)  document.getElementById("f-sem-name").value=state.semesterName;
  if (state.hijriYear)     document.getElementById("f-hijri-year").value=state.hijriYear;

  // Database
  document.getElementById("search-input").addEventListener("input",e=>{ currentSearch=e.target.value; renderDatabase(); });
  document.getElementById("btn-show-add-form").addEventListener("click", showAddForm);
  document.getElementById("btn-add-sched-row").addEventListener("click", ()=>addSchedRow());
  document.getElementById("btn-save-member").addEventListener("click", saveMember);
  document.getElementById("btn-cancel-form").addEventListener("click",()=>{ document.getElementById("add-edit-card").style.display="none"; clearForm(); });

  // Week nav
  document.getElementById("prev-week").addEventListener("click",()=>{
    if (state.currentWeek>1){ state.currentWeek--; saveState(); renderAttendance(); }
  });
  document.getElementById("next-week").addEventListener("click",()=>{
    const max=state.weeks.length||18;
    if (state.currentWeek<max){ state.currentWeek++; saveState(); renderAttendance(); }
  });

  // Day filter
  document.querySelectorAll(".day-filter-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{
      document.querySelectorAll(".day-filter-btn").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active"); state.currentDayFilter=btn.dataset.day; renderAttendance();
    });
  });

  // Report sort
  document.querySelectorAll(".filter-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{
      document.querySelectorAll(".filter-btn").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active"); state.currentSort=btn.dataset.sort; renderReport();
    });
  });

  // Save week / export / reset
  document.getElementById("btn-save-week").addEventListener("click", saveWeek);
  document.getElementById("btn-export").addEventListener("click", exportExcel);
  document.getElementById("btn-reset").addEventListener("click",()=>{
    if (!confirm("مسح جميع سجلات الحضور؟ (الأعضاء تبقى)")) return;
    state.attendance={}; state.holidays={}; saveState(); renderAttendance(); renderReport();
    showToast("تم المسح");
  });

  // Keyboard close modal
  document.addEventListener("keydown",e=>{ if(e.key==="Escape") closeWeekModal(); });

  // Init
  clearForm();
  updateSemesterBadge();
  renderWeeksPreview();
  renderDatabase();
  renderAttendance();
  renderReport();
});
