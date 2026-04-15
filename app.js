// ===================== STATE =====================
const WEEK_DATES = [
  '', '18 — 22 يناير', '25 — 29 يناير', '1 — 5 فبراير', '8 — 12 فبراير',
  '15 — 19 فبراير', '22 — 26 فبراير', '1 — 5 مارس', '8 — 12 مارس',
  '15 — 19 مارس', '22 — 26 مارس', '29 مارس — 2 أبريل', '6 — 10 أبريل',
  '13 — 17 أبريل', '20 — 24 أبريل', '27 أبريل — 1 مايو',
  '4 — 8 مايو', '11 — 15 مايو', '18 — 22 مايو'
];

let state = {
  members: [],       // { id, name, college, course, code, section, lecturesPerWeek, days, startTime, endTime }
  attendance: {},    // { "weekN": { memberId: true/false } }
  currentWeek: 1
};

// ===================== PERSISTENCE =====================
function saveState() {
  localStorage.setItem('attendance_tracker_v2', JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem('attendance_tracker_v2');
  if (raw) {
    try { state = JSON.parse(raw); } catch(e) {}
  }
}

// ===================== HELPERS =====================
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('');
}

function attendancePct(memberId) {
  const savedWeeks = Object.keys(state.attendance).filter(w => {
    return state.attendance[w] && memberId in state.attendance[w];
  });
  if (savedWeeks.length === 0) return null;
  const present = savedWeeks.filter(w => state.attendance[w][memberId] === true).length;
  return Math.round((present / savedWeeks.length) * 100);
}

function pctBadgeClass(pct) {
  if (pct === null) return 'badge-new';
  if (pct >= 80) return 'badge-success';
  if (pct >= 60) return 'badge-warn';
  return 'badge-danger';
}

function pctLabel(pct) {
  return pct === null ? 'جديد' : pct + '%';
}

function pctFillClass(pct) {
  if (pct >= 80) return '';
  if (pct >= 60) return 'warn';
  return 'danger';
}

function pctColor(pct) {
  if (pct >= 80) return 'var(--green-text)';
  if (pct >= 60) return 'var(--amber-text)';
  return 'var(--red-text)';
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}

// ===================== RENDER: MEMBERS =====================
function renderMembers() {
  const list = document.getElementById('members-list');
  const label = document.getElementById('members-count-label');
  label.textContent = `الأعضاء المسجلون (${state.members.length})`;

  if (state.members.length === 0) {
    list.innerHTML = '<div class="empty-state">لا يوجد أعضاء بعد — أضف أول عضو من الأعلى</div>';
    return;
  }

  list.innerHTML = state.members.map(m => {
    const pct = attendancePct(m.id);
    const daysStr = (m.days || []).join(' · ') || '—';
    return `
      <div class="member-card" data-id="${m.id}">
        <div class="member-header">
          <div class="avatar">${initials(m.name)}</div>
          <div style="flex:1;min-width:0">
            <div class="member-name">${m.name}</div>
            <div class="member-sub">${m.college || '—'}</div>
          </div>
          <span class="badge ${pctBadgeClass(pct)}">${pctLabel(pct)}</span>
        </div>
        <div class="chips">
          <span class="chip purple">${m.code || '—'}</span>
          <span class="chip purple">${m.course || '—'}</span>
          <span class="chip teal">شعبة ${m.section || '—'}</span>
          <span class="chip amber">${daysStr}</span>
          <span class="chip">${m.startTime || '—'} — ${m.endTime || '—'}</span>
          <span class="chip">${m.lecturesPerWeek} محاضرة/أسبوع</span>
        </div>
        <div class="member-actions">
          <button class="btn-sm" onclick="deleteMember('${m.id}')">حذف العضو</button>
        </div>
      </div>
    `;
  }).join('');
}

function deleteMember(id) {
  if (!confirm('هل أنت متأكد من حذف هذا العضو؟')) return;
  state.members = state.members.filter(m => m.id !== id);
  // remove from attendance records
  Object.keys(state.attendance).forEach(w => {
    delete state.attendance[w][id];
  });
  saveState();
  renderMembers();
  renderAttendance();
  renderReport();
  showToast('تم حذف العضو');
}

// ===================== ADD MEMBER =====================
function addMember() {
  const name    = document.getElementById('f-name').value.trim();
  const college = document.getElementById('f-college').value.trim();
  const course  = document.getElementById('f-course').value.trim();
  const code    = document.getElementById('f-code').value.trim();
  const section = document.getElementById('f-section').value.trim();
  const lec     = parseInt(document.getElementById('f-lec').value);
  const start   = document.getElementById('f-start').value;
  const end     = document.getElementById('f-end').value;
  const days    = [...document.querySelectorAll('.day-btn.sel')].map(b => b.textContent);

  if (!name) { showToast('الاسم الكامل مطلوب'); return; }

  const member = { id: uid(), name, college, course, code, section, lecturesPerWeek: lec, days, startTime: start, endTime: end };
  state.members.push(member);
  saveState();

  // clear form
  ['f-name','f-college','f-course','f-code','f-section'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('f-start').value = '08:00';
  document.getElementById('f-end').value   = '09:30';
  document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('sel'));

  renderMembers();
  renderAttendance();
  renderReport();
  showToast(`تم إضافة ${name}`);
}

// ===================== RENDER: ATTENDANCE =====================
function renderAttendance() {
  const w = state.currentWeek;
  document.getElementById('week-label').textContent   = `الأسبوع ${w}`;
  document.getElementById('week-date').textContent    = WEEK_DATES[w] || '';
  document.getElementById('week-counter').textContent = `${w} / 18`;

  const list = document.getElementById('attendance-list');
  if (state.members.length === 0) {
    list.innerHTML = '<div class="empty-state">أضف أعضاء أولاً من تبويب الأعضاء</div>';
    return;
  }

  const weekData = state.attendance[`week${w}`] || {};

  list.innerHTML = state.members.map(m => {
    const present = weekData[m.id] !== false; // default to present if not set
    const daysStr = (m.days || []).join(' · ') || '—';
    return `
      <div class="attend-row">
        <label class="toggle">
          <input type="checkbox" data-id="${m.id}" ${present ? 'checked' : ''}
            onchange="toggleAttend(this)" />
          <span class="toggle-track"></span>
        </label>
        <div class="attend-info">
          <div class="attend-name">${m.name}</div>
          <div class="attend-meta">${m.code || '—'} · شعبة ${m.section || '—'} · ${daysStr} · ${m.startTime || '—'} — ${m.endTime || '—'}</div>
        </div>
        <span class="badge ${present ? 'badge-success' : 'badge-danger'}" id="ab-${m.id}">
          ${present ? 'حاضر' : 'غائب'}
        </span>
      </div>
    `;
  }).join('');
}

function toggleAttend(chk) {
  const w    = `week${state.currentWeek}`;
  const id   = chk.dataset.id;
  if (!state.attendance[w]) state.attendance[w] = {};
  state.attendance[w][id] = chk.checked;

  const badge = document.getElementById(`ab-${id}`);
  if (chk.checked) {
    badge.textContent = 'حاضر';
    badge.className = 'badge badge-success';
  } else {
    badge.textContent = 'غائب';
    badge.className = 'badge badge-danger';
  }
}

function saveWeek() {
  const w = `week${state.currentWeek}`;
  if (!state.attendance[w]) state.attendance[w] = {};
  // persist current toggle states
  document.querySelectorAll('#attendance-list input[type=checkbox]').forEach(chk => {
    state.attendance[w][chk.dataset.id] = chk.checked;
  });
  saveState();
  renderReport();
  showToast(`تم حفظ سجل الأسبوع ${state.currentWeek} ✓`);
}

// ===================== RENDER: REPORT =====================
function renderReport() {
  const savedWeeks = Object.keys(state.attendance).filter(w =>
    Object.keys(state.attendance[w]).length > 0
  );
  document.getElementById('stat-weeks').textContent   = savedWeeks.length;
  document.getElementById('stat-members').textContent = state.members.length;

  if (state.members.length === 0) {
    document.getElementById('stat-avg').textContent = '—';
    document.getElementById('report-list').innerHTML  = '<div class="empty-state">لا توجد بيانات بعد</div>';
    document.getElementById('alerts-list').innerHTML  = '<div class="empty-state">لا توجد تنبيهات</div>';
    return;
  }

  const pcts = state.members.map(m => attendancePct(m.id)).filter(p => p !== null);
  const avg  = pcts.length ? Math.round(pcts.reduce((a,b) => a+b, 0) / pcts.length) : null;
  document.getElementById('stat-avg').textContent = avg !== null ? avg + '%' : '—';

  // report rows
  document.getElementById('report-list').innerHTML = state.members.map(m => {
    const pct = attendancePct(m.id);
    const pctDisplay = pct !== null ? pct : 0;
    const fillClass  = pctFillClass(pctDisplay);
    const color      = pctColor(pctDisplay);
    return `
      <div class="report-row">
        <div class="avatar" style="width:34px;height:34px;font-size:.7rem">${initials(m.name)}</div>
        <div class="report-info">
          <div class="report-name">${m.name}</div>
          <div class="report-sub">${m.code || '—'} · شعبة ${m.section || '—'} · ${m.college || '—'}</div>
          <div class="progress-bar">
            <div class="progress-fill ${fillClass}" style="width:${pctDisplay}%"></div>
          </div>
        </div>
        <div class="report-pct" style="color:${color}">${pct !== null ? pct + '%' : '—'}</div>
      </div>
    `;
  }).join('');

  // alerts
  const alerts = state.members.filter(m => {
    const pct = attendancePct(m.id);
    return pct !== null && pct < 75;
  });
  if (alerts.length === 0) {
    document.getElementById('alerts-list').innerHTML = '<div class="empty-state">لا توجد تنبيهات — الحضور جيد</div>';
  } else {
    document.getElementById('alerts-list').innerHTML = alerts.map(m => {
      const pct = attendancePct(m.id);
      const icon = pct < 50 ? '🔴' : '⚠️';
      const msg  = pct < 50
        ? `حضور ${pct}% فقط — يحتاج تدخلاً عاجلاً`
        : `حضور ${pct}% — أقل من الحد المطلوب 75%`;
      return `
        <div class="alert-row">
          <span class="alert-icon">${icon}</span>
          <div>
            <div class="alert-text-title">${m.name} — ${m.code || '—'}</div>
            <div class="alert-text-sub">${msg} · شعبة ${m.section || '—'}</div>
          </div>
        </div>
      `;
    }).join('');
  }
}

// ===================== EXPORT EXCEL (CSV) =====================
function exportExcel() {
  if (state.members.length === 0) { showToast('لا توجد بيانات للتصدير'); return; }

  const savedWeeks = Object.keys(state.attendance).sort((a,b) => {
    return parseInt(a.replace('week','')) - parseInt(b.replace('week',''));
  });

  // header
  const headers = ['الاسم', 'الكلية', 'المقرر', 'رمز المقرر', 'الشعبة', 'الأيام', 'الوقت', ...savedWeeks.map(w => 'أسبوع ' + w.replace('week','')), 'نسبة الحضور'];

  const rows = state.members.map(m => {
    const weekCols = savedWeeks.map(w => {
      const v = state.attendance[w]?.[m.id];
      return v === undefined ? '—' : (v ? 'حاضر' : 'غائب');
    });
    const pct = attendancePct(m.id);
    const days = (m.days || []).join(' - ');
    return [
      m.name, m.college || '', m.course || '', m.code || '', m.section || '',
      days, `${m.startTime||''} — ${m.endTime||''}`,
      ...weekCols,
      pct !== null ? pct + '%' : '—'
    ];
  });

  const csvContent = [headers, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(','))
    .join('\n');

  const bom = '\uFEFF';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `تقرير_الحضور_${new Date().toLocaleDateString('ar-SA')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('تم تصدير الملف');
}

// ===================== RESET =====================
function resetData() {
  if (!confirm('سيتم حذف جميع البيانات نهائياً. هل أنت متأكد؟')) return;
  state = { members: [], attendance: {}, currentWeek: 1 };
  saveState();
  renderMembers();
  renderAttendance();
  renderReport();
  showToast('تم إعادة ضبط البيانات');
}

// ===================== EVENT LISTENERS =====================
document.addEventListener('DOMContentLoaded', () => {
  loadState();

  // nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`screen-${btn.dataset.screen}`).classList.add('active');
    });
  });

  // day buttons
  document.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('sel'));
  });

  // add member
  document.getElementById('btn-add').addEventListener('click', addMember);

  // clear form
  document.getElementById('btn-clear').addEventListener('click', () => {
    ['f-name','f-college','f-course','f-code','f-section'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('f-start').value = '08:00';
    document.getElementById('f-end').value   = '09:30';
    document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('sel'));
  });

  // week navigation
  document.getElementById('prev-week').addEventListener('click', () => {
    if (state.currentWeek > 1) { state.currentWeek--; saveState(); renderAttendance(); }
  });
  document.getElementById('next-week').addEventListener('click', () => {
    if (state.currentWeek < 18) { state.currentWeek++; saveState(); renderAttendance(); }
  });

  // save week
  document.getElementById('btn-save-week').addEventListener('click', saveWeek);

  // export
  document.getElementById('btn-export').addEventListener('click', exportExcel);

  // reset
  document.getElementById('btn-reset').addEventListener('click', resetData);

  // initial render
  renderMembers();
  renderAttendance();
  renderReport();
});
