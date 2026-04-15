// ===================== STATE =====================
let state = {
  members: [],       // loaded from DB_MEMBERS then editable
  attendance: {},    // { "week1": { "memberId": true/false } }
  currentWeek: 1,
  currentDayFilter: "all",
  semesterStart: null,
  semesterEnd: null,
  weeks: []
};

const DAY_NAMES = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس"];

// ===================== PERSISTENCE =====================
function saveState() {
  localStorage.setItem("att_v4", JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem("att_v4");
  if (raw) {
    try { state = JSON.parse(raw); } catch(e) {}
  }
  // If no members yet, load from DB file
  if (!state.members || state.members.length === 0) {
    state.members = JSON.parse(JSON.stringify(DB_MEMBERS));
  }
}

// ===================== DATE HELPERS =====================
function fmtLong(d)  { return new Date(d+"T00:00:00").toLocaleDateString("ar-SA",{day:"numeric",month:"long",year:"numeric"}); }
function fmtShort(d) { return new Date(d+"T00:00:00").toLocaleDateString("ar-SA",{day:"numeric",month:"long"}); }

function calcWeeks(s, e) {
  const end = new Date(e+"T00:00:00");
  let cur = new Date(s+"T00:00:00");
  const weeks = [];
  let n = 1;
  while (cur <= end) {
    const ws = cur.toISOString().slice(0,10);
    const we = new Date(cur); we.setDate(we.getDate()+6);
    weeks.push({ num: n, label: `${fmtShort(ws)} — ${fmtShort((we>end?end:we).toISOString().slice(0,10))}`, startDate: ws });
    cur.setDate(cur.getDate()+7);
    n++;
  }
  return weeks;
}

// ===================== HELPERS =====================
function uid() { return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function initials(name) { return name.trim().split(/\s+/).slice(0,2).map(w=>w[0]||"").join(""); }

function attendancePct(memberId) {
  const saved = Object.keys(state.attendance).filter(w => state.attendance[w] && memberId in state.attendance[w]);
  if (!saved.length) return null;
  const present = saved.filter(w => state.attendance[w][memberId]===true).length;
  return Math.round((present/saved.length)*100);
}

function pctClass(pct) {
  if (pct===null) return "badge-new";
  if (pct>=80) return "badge-success";
  if (pct>=60) return "badge-warn";
  return "badge-danger";
}
function pctLabel(pct) { return pct===null ? "جديد" : pct+"%"; }
function pctFill(pct)  { if (pct>=80) return ""; if (pct>=60) return "warn"; return "danger"; }
function pctColor(pct) { if (pct>=80) return "var(--green-text)"; if (pct>=60) return "var(--amber-text)"; return "var(--red-text)"; }

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 2600);
}

function updateSemesterBadge() {
  const el = document.getElementById("semester-badge");
  el.textContent = state.weeks.length
    ? `${state.weeks.length} أسبوع · ${fmtLong(state.semesterStart)} — ${fmtLong(state.semesterEnd)}`
    : "لم يُحدَّد الفصل بعد";
}

// ===================== SEMESTER SETUP =====================
function calcWeeksHandler() {
  const s = document.getElementById("f-sem-start").value;
  const e = document.getElementById("f-sem-end").value;
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
  el.innerHTML=`
    <div class="weeks-summary">
      <div class="weeks-summary-header">
        <span>إجمالي الأسابيع: <strong>${state.weeks.length}</strong></span>
        <span>${fmtLong(state.semesterStart)} — ${fmtLong(state.semesterEnd)}</span>
      </div>
      <div class="weeks-grid">
        ${state.weeks.map(w=>`
          <div class="week-chip">
            <span class="week-chip-num">${w.num}</span>
            <span class="week-chip-label">${w.label}</span>
          </div>`).join("")}
      </div>
    </div>`;
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
    <input class="sr-section" type="text" placeholder="الشعبة" value="${r.section||""}" style="width:80px"/>
    <input class="sr-course"  type="text" placeholder="اسم المقرر" value="${r.course||""}" style="flex:1;min-width:120px"/>
    <input class="sr-room"    type="text" placeholder="القاعة" value="${r.room||""}" style="width:80px"/>
    <input class="sr-start"   type="time" value="${r.start||"08:00"}" style="width:105px"/>
    <span style="font-size:11px;color:var(--text3)">—</span>
    <input class="sr-end"     type="time" value="${r.end||"09:45"}" style="width:105px"/>
    <button class="dt-remove" onclick="removeSchedRow(${id})">✕</button>`;
  c.appendChild(div);
}

function removeSchedRow(id) {
  document.querySelector(`.sched-row[data-rid="${id}"]`)?.remove();
}

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
  schedRowCount=0;
  addSchedRow();
}

// ===================== RENDER: DATABASE =====================
let currentSearch="";

function renderDatabase() {
  const q=currentSearch.toLowerCase();
  const filtered=state.members.filter(m=>
    m.name.toLowerCase().includes(q)||
    (m.schedule||[]).some(s=>s.course.toLowerCase().includes(q)||s.section.includes(q)||s.room.includes(q))
  );
  document.getElementById("db-count").textContent=
    `إجمالي الأعضاء: ${state.members.length} — معروض: ${filtered.length}`;

  const list=document.getElementById("members-list");
  if (!filtered.length) {
    list.innerHTML='<div class="empty-state">لا توجد نتائج</div>'; return;
  }

  list.innerHTML=filtered.map(m=>{
    const pct=attendancePct(m.id);
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
            <div class="member-sub">${m.college||"كلية العلوم"} · ${(m.schedule||[]).length} محاضرة أسبوعياً</div>
          </div>
          <span class="badge ${pctClass(pct)}">${pctLabel(pct)}</span>
        </div>
        <div class="sched-list">${schedHtml}</div>
        <div class="member-actions">
          <button class="btn-sm btn-edit" onclick="editMember('${m.id}')">✏️ تعديل</button>
          <button class="btn-sm btn-del"  onclick="deleteMember('${m.id}')">🗑 حذف</button>
        </div>
      </div>`;
  }).join("");
}

// ===================== ADD / EDIT / DELETE =====================
function showAddForm() {
  clearForm();
  document.getElementById("form-title").textContent="إضافة عضو جديد";
  document.getElementById("add-edit-card").style.display="block";
  document.getElementById("add-edit-card").scrollIntoView({behavior:"smooth"});
}

function editMember(id) {
  const m=state.members.find(x=>x.id===id);
  if (!m) return;
  document.getElementById("f-edit-id").value=id;
  document.getElementById("f-name").value=m.name;
  document.getElementById("f-college").value=m.college||"كلية العلوم";
  document.getElementById("schedule-rows").innerHTML="";
  schedRowCount=0;
  (m.schedule||[]).forEach(r=>addSchedRow(r));
  if (!m.schedule||!m.schedule.length) addSchedRow();
  document.getElementById("form-title").textContent="تعديل بيانات العضو";
  document.getElementById("add-edit-card").style.display="block";
  document.getElementById("add-edit-card").scrollIntoView({behavior:"smooth"});
}

function saveMember() {
  const name=document.getElementById("f-name").value.trim();
  const college=document.getElementById("f-college").value.trim();
  const schedule=getSchedule();
  const editId=document.getElementById("f-edit-id").value;
  if (!name) { showToast("الاسم مطلوب"); return; }

  if (editId) {
    const idx=state.members.findIndex(m=>m.id===editId);
    if (idx>-1) state.members[idx]={...state.members[idx], name, college, schedule};
    showToast("تم تعديل بيانات العضو ✓");
  } else {
    state.members.push({id:uid(), name, college, schedule});
    showToast(`تم إضافة ${name} ✓`);
  }
  saveState();
  document.getElementById("add-edit-card").style.display="none";
  clearForm();
  renderDatabase();
  renderAttendance();
  renderReport();
}

function deleteMember(id) {
  const m=state.members.find(x=>x.id===id);
  if (!confirm(`حذف "${m?.name}"؟`)) return;
  state.members=state.members.filter(x=>x.id!==id);
  Object.keys(state.attendance).forEach(w=>delete state.attendance[w][id]);
  saveState(); renderDatabase(); renderAttendance(); renderReport();
  showToast("تم حذف العضو");
}

// ===================== RENDER: ATTENDANCE =====================
function renderAttendance() {
  const w=state.currentWeek;
  const wk=state.weeks[w-1];
  const total=state.weeks.length||"—";
  document.getElementById("week-label").textContent=`الأسبوع ${w}`;
  document.getElementById("week-date").textContent=wk?wk.label:"";
  document.getElementById("week-counter").textContent=`${w} / ${total}`;

  const weekData=state.attendance[`week${w}`]||{};
  const dayF=state.currentDayFilter;

  // filter members by day
  const visible=state.members.filter(m=>
    dayF==="all" || (m.schedule||[]).some(s=>s.day===dayF)
  );

  const list=document.getElementById("attendance-list");
  if (!visible.length) {
    list.innerHTML='<div class="empty-state">لا يوجد أعضاء لهذا اليوم</div>'; return;
  }

  list.innerHTML=visible.map(m=>{
    const present=weekData[m.id]!==false;
    const relevantSched=(dayF==="all"?m.schedule||[]:( m.schedule||[]).filter(s=>s.day===dayF));
    const schedStr=relevantSched.map(s=>`${s.day} / شعبة ${s.section} / ${s.room} / ${s.start}–${s.end}`).join(" · ") || "—";
    return `
      <div class="attend-row">
        <label class="toggle">
          <input type="checkbox" data-id="${m.id}" ${present?"checked":""} onchange="toggleAttend(this)"/>
          <span class="toggle-track"></span>
        </label>
        <div class="attend-info">
          <div class="attend-name">${m.name}</div>
          <div class="attend-meta">${schedStr}</div>
        </div>
        <span class="badge ${present?"badge-success":"badge-danger"}" id="ab-${m.id}">
          ${present?"حاضر":"غائب"}
        </span>
      </div>`;
  }).join("");
}

function toggleAttend(chk) {
  const w=`week${state.currentWeek}`;
  if (!state.attendance[w]) state.attendance[w]={};
  state.attendance[w][chk.dataset.id]=chk.checked;
  const b=document.getElementById(`ab-${chk.dataset.id}`);
  b.textContent=chk.checked?"حاضر":"غائب";
  b.className=`badge ${chk.checked?"badge-success":"badge-danger"}`;
}

function saveWeek() {
  const w=`week${state.currentWeek}`;
  if (!state.attendance[w]) state.attendance[w]={};
  document.querySelectorAll("#attendance-list input[type=checkbox]").forEach(chk=>{
    state.attendance[w][chk.dataset.id]=chk.checked;
  });
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
  const pcts=state.members.map(m=>attendancePct(m.id)).filter(p=>p!==null);
  const avg=pcts.length?Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length):null;
  document.getElementById("stat-avg").textContent=avg!==null?avg+"%":"—";

  document.getElementById("report-list").innerHTML=state.members.map(m=>{
    const pct=attendancePct(m.id); const pd=pct??0;
    return `
      <div class="report-row">
        <div class="avatar" style="width:34px;height:34px;font-size:.7rem">${initials(m.name)}</div>
        <div class="report-info">
          <div class="report-name">${m.name}</div>
          <div class="report-sub">${(m.schedule||[]).map(s=>`${s.course} (${s.section})`).filter((v,i,a)=>a.indexOf(v)===i).join(" · ")}</div>
          <div class="progress-bar"><div class="progress-fill ${pctFill(pd)}" style="width:${pd}%"></div></div>
        </div>
        <div class="report-pct" style="color:${pctColor(pd)}">${pct!==null?pct+"%":"—"}</div>
      </div>`;
  }).join("");

  const alerts=state.members.filter(m=>{const p=attendancePct(m.id);return p!==null&&p<75;});
  document.getElementById("alerts-list").innerHTML=alerts.length
    ? alerts.map(m=>{
        const pct=attendancePct(m.id);
        return `<div class="alert-row">
          <span class="alert-icon">${pct<50?"🔴":"⚠️"}</span>
          <div>
            <div class="alert-text-title">${m.name}</div>
            <div class="alert-text-sub">حضور ${pct}% — ${pct<50?"يحتاج تدخلاً عاجلاً":"أقل من 75%"}</div>
          </div>
        </div>`;
      }).join("")
    : '<div class="empty-state">لا توجد تنبيهات — الحضور جيد ✓</div>';
}

// ===================== EXPORT =====================
function exportExcel() {
  if (!state.members.length) { showToast("لا توجد بيانات"); return; }
  const saved=Object.keys(state.attendance).sort((a,b)=>parseInt(a.replace("week",""))-parseInt(b.replace("week","")));
  const headers=["الاسم","المقررات","الشعب","القاعات",
    ...saved.map(w=>{ const wk=state.weeks[parseInt(w.replace("week",""))-1]; return wk?`أسبوع ${wk.num} (${wk.label})`:w; }),
    "نسبة الحضور"];
  const rows=state.members.map(m=>[
    m.name,
    [...new Set((m.schedule||[]).map(s=>s.course))].join(" | "),
    [...new Set((m.schedule||[]).map(s=>s.section))].join(" | "),
    [...new Set((m.schedule||[]).map(s=>s.room))].join(" | "),
    ...saved.map(w=>{const v=state.attendance[w]?.[m.id]; return v===undefined?"—":v?"حاضر":"غائب";}),
    attendancePct(m.id)!==null?attendancePct(m.id)+"%":"—"
  ]);
  const csv=[headers,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"}));
  a.download="تقرير_الحضور.csv"; a.click();
  showToast("تم تصدير الملف");
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
  document.getElementById("btn-calc-weeks").addEventListener("click", calcWeeksHandler);
  if (state.semesterStart) document.getElementById("f-sem-start").value=state.semesterStart;
  if (state.semesterEnd)   document.getElementById("f-sem-end").value=state.semesterEnd;

  // Database
  document.getElementById("search-input").addEventListener("input", e=>{
    currentSearch=e.target.value; renderDatabase();
  });
  document.getElementById("btn-show-add-form").addEventListener("click", showAddForm);
  document.getElementById("btn-add-sched-row").addEventListener("click", ()=>addSchedRow());
  document.getElementById("btn-save-member").addEventListener("click", saveMember);
  document.getElementById("btn-cancel-form").addEventListener("click", ()=>{
    document.getElementById("add-edit-card").style.display="none"; clearForm();
  });

  // Attendance week nav
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
      btn.classList.add("active");
      state.currentDayFilter=btn.dataset.day;
      renderAttendance();
    });
  });

  document.getElementById("btn-save-week").addEventListener("click", saveWeek);
  document.getElementById("btn-export").addEventListener("click", exportExcel);
  document.getElementById("btn-reset").addEventListener("click",()=>{
    if (!confirm("مسح سجلات الحضور فقط (الأعضاء تبقى)؟")) return;
    state.attendance={}; saveState(); renderReport();
    showToast("تم مسح سجلات الحضور");
  });

  // Init form
  clearForm();
  updateSemesterBadge();
  renderWeeksPreview();
  renderDatabase();
  renderAttendance();
  renderReport();
});
