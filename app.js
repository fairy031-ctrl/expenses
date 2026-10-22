(() => {
  const KEY = 'expenses.v1';
  const PALETTE = ['#0f766e','#d97706','#7c3aed','#db2777','#2563eb','#65a30d','#dc2626','#0891b2','#9333ea','#ca8a04'];
  const DEFAULT_CATS = ['Food','Groceries','Transport','Rent','Bills','Health','Fun','Shopping','Other'];

  const $ = (s) => document.querySelector(s);
  const state = load();
  let view = new Date(); view.setDate(1);
  let editingId = null;

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.expenses)) return s;
    } catch (e) {}
    return { expenses: [], categories: DEFAULT_CATS.slice(), currency: '$' };
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { alert('Could not save data: storage is full or blocked.'); }
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const colorFor = (cat) => {
    const i = state.categories.indexOf(cat);
    return PALETTE[(i < 0 ? state.categories.length : i) % PALETTE.length];
  };
  const money = (n) => state.currency + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const todayStr = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function monthExpenses(d) {
    const key = ym(d);
    return state.expenses.filter((e) => e.date.startsWith(key)).sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
  }

  function render() {
    $('#monthLabel').textContent = view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const items = monthExpenses(view);
    const total = items.reduce((s, e) => s + e.amount, 0);
    $('#monthTotal').textContent = money(total);

    // list grouped by day
    const list = $('#list');
    list.innerHTML = '';
    $('#empty').hidden = items.length > 0;
    let lastDay = null, dayTotal = 0, dayHead = null;
    const flush = () => { if (dayHead) dayHead.lastElementChild.textContent = money(dayTotal); };
    items.forEach((e) => {
      if (e.date !== lastDay) {
        flush();
        lastDay = e.date; dayTotal = 0;
        dayHead = document.createElement('div');
        dayHead.className = 'day';
        const dt = new Date(e.date + 'T00:00:00');
        dayHead.innerHTML = '<span>' + esc(dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })) + '</span><span></span>';
        list.appendChild(dayHead);
      }
      dayTotal += e.amount;
      const b = document.createElement('button');
      b.className = 'item';
      b.innerHTML = '<span class="dot" style="background:' + colorFor(e.category) + '"></span>' +
        '<span class="meta"><div class="cat">' + esc(e.category) + '</div>' +
        (e.note ? '<div class="note">' + esc(e.note) + '</div>' : '') + '</span>' +
        '<span class="amt">' + money(e.amount) + '</span>';
      b.onclick = () => openDialog(e);
      list.appendChild(b);
    });
    flush();

    // summary by category
    const byCat = {};
    items.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
    const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    $('#catSummary').innerHTML = rows.length ? rows.map(([c, v]) =>
      '<div class="bar"><div class="top"><span>' + esc(c) + '</span><b>' + money(v) + ' · ' + Math.round(v / total * 100) + '%</b></div>' +
      '<div class="track"><div class="fill" style="width:' + (v / total * 100) + '%;background:' + colorFor(c) + '"></div></div></div>'
    ).join('') : '<p class="muted">Nothing to summarise yet.</p>';

    // 6 month trend
    const months = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(view.getFullYear(), view.getMonth() - i, 1); months.push(d); }
    const totals = months.map((d) => monthExpenses(d).reduce((s, e) => s + e.amount, 0));
    const max = Math.max(...totals, 1);
    $('#trend').innerHTML = '<div class="trend">' + months.map((d, i) =>
      '<div class="col" title="' + money(totals[i]) + '"><div style="height:' + Math.max(totals[i] / max * 100, 1) + '%"></div>' +
      '<span>' + esc(d.toLocaleDateString(undefined, { month: 'short' })) + '</span></div>').join('') + '</div>';

    // settings
    $('#currency').value = state.currency;
    $('#catList').innerHTML = '';
    state.categories.forEach((c) => {
      const r = document.createElement('div');
      r.className = 'cat-row';
      r.innerHTML = '<span class="dot" style="background:' + colorFor(c) + '"></span><span>' + esc(c) + '</span><button aria-label="Remove ' + esc(c) + '">&times;</button>';
      r.querySelector('button').onclick = () => {
        if (state.categories.length <= 1) return alert('Keep at least one category.');
        if (confirm('Remove category "' + c + '"? Existing expenses keep their label.')) {
          state.categories = state.categories.filter((x) => x !== c); save(); render();
        }
      };
      $('#catList').appendChild(r);
    });
  }

  // dialog
  function openDialog(exp) {
    editingId = exp ? exp.id : null;
    $('#dlgTitle').textContent = exp ? 'Edit expense' : 'Add expense';
    const cats = state.categories.slice();
    if (exp && !cats.includes(exp.category)) cats.push(exp.category);
    $('#category').innerHTML = cats.map((c) => '<option>' + esc(c) + '</option>').join('');
    $('#amount').value = exp ? exp.amount : '';
    $('#category').value = exp ? exp.category : cats[0];
    $('#date').value = exp ? exp.date : (ym(new Date()) === ym(view) ? todayStr() : ym(view) + '-01');
    $('#note').value = exp ? exp.note || '' : '';
    $('#delete').hidden = !exp;
    $('#dlg').showModal();
    if (!exp) setTimeout(() => $('#amount').focus(), 50);
  }
  $('#fab').onclick = () => openDialog(null);
  $('#cancel').onclick = () => $('#dlg').close();
  $('#form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const amount = parseFloat($('#amount').value);
    if (!(amount >= 0)) return;
    const data = { amount: Math.round(amount * 100) / 100, category: $('#category').value, date: $('#date').value, note: $('#note').value.trim() };
    if (editingId) {
      const e = state.expenses.find((x) => x.id === editingId);
      Object.assign(e, data);
    } else {
      state.expenses.push({ id: uid(), created: Date.now(), ...data });
    }
    save();
    const d = new Date(data.date + 'T00:00:00'); view = new Date(d.getFullYear(), d.getMonth(), 1);
    $('#dlg').close(); render();
  });
  $('#delete').onclick = () => {
    if (!confirm('Delete this expense?')) return;
    state.expenses = state.expenses.filter((x) => x.id !== editingId);
    save(); $('#dlg').close(); render();
  };

  // nav
  $('#prevMonth').onclick = () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); };
  $('#nextMonth').onclick = () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); };
  document.querySelectorAll('.tab').forEach((t) => t.onclick = () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + t.dataset.tab));
    $('#fab').style.display = t.dataset.tab === 'settings' ? 'none' : '';
  });

  // settings
  $('#currency').addEventListener('input', (e) => { state.currency = e.target.value; save(); $('#monthTotal').textContent = money(monthExpenses(view).reduce((s, x) => s + x.amount, 0)); });
  $('#currency').addEventListener('change', render);
  $('#catForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#newCat').value.trim();
    if (v && !state.categories.includes(v)) { state.categories.push(v); save(); }
    $('#newCat').value = ''; render();
  });

  // export / import
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  $('#exportCsv').onclick = () => {
    const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
    const rows = [['Date', 'Category', 'Amount', 'Note'].join(',')]
      .concat(state.expenses.slice().sort((a, b) => a.date.localeCompare(b.date)).map((e) => [e.date, q(e.category), e.amount.toFixed(2), q(e.note || '')].join(',')));
    download('expenses-' + todayStr() + '.csv', rows.join('\n'), 'text/csv');
  };
  $('#exportJson').onclick = () => download('expenses-backup-' + todayStr() + '.json', JSON.stringify(state, null, 2), 'application/json');
  $('#importJson').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!Array.isArray(d.expenses) || !Array.isArray(d.categories)) throw new Error('bad file');
      if (!confirm('Replace current data with this backup (' + d.expenses.length + ' expenses)?')) return;
      state.expenses = d.expenses; state.categories = d.categories; state.currency = d.currency || '$';
      save(); render();
    } catch (err) { alert('That file is not a valid backup.'); }
    e.target.value = '';
  };
  $('#wipe').onclick = () => {
    if (confirm('Delete ALL expenses? This cannot be undone.') && confirm('Really delete everything?')) {
      state.expenses = []; save(); render();
    }
  };

  // ask the browser not to evict our data
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  render();
})();
