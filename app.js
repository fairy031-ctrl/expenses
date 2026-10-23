(() => {
  const KEY = 'expenses.v1'; // same key as before so existing data carries over
  const PALETTE = ['#0f766e','#d97706','#7c3aed','#db2777','#2563eb','#65a30d','#dc2626','#0891b2','#9333ea','#ca8a04'];
  const DEFAULT_EXP = ['Food','Groceries','Transport','Rent','Bills','Health','Fun','Shopping','Other'];
  const DEFAULT_INC = ['Salary','Gift','Refund','Other income'];

  const $ = (s) => document.querySelector(s);

  function normalize(s) {
    s = s || {};
    return {
      // "expenses" holds both kinds; each entry has type 'expense' | 'income'
      expenses: (Array.isArray(s.expenses) ? s.expenses : []).map((e) => Object.assign({}, e, { type: e.type === 'income' ? 'income' : 'expense' })),
      categories: Array.isArray(s.categories) && s.categories.length ? s.categories : DEFAULT_EXP.slice(),
      incomeCategories: Array.isArray(s.incomeCategories) && s.incomeCategories.length ? s.incomeCategories : DEFAULT_INC.slice(),
      currency: typeof s.currency === 'string' ? s.currency : '$',
      opening: Number(s.opening) || 0
    };
  }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.expenses)) return normalize(s); } catch (e) {}
    return normalize({});
  }
  const state = load();
  let view = new Date(); view.setDate(1);
  let editingId = null;
  let dlgType = 'expense';

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { alert('Could not save data: storage is full or blocked.'); }
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const catsFor = (type) => (type === 'income' ? state.incomeCategories : state.categories);
  const colorFor = (cat, type) => {
    const list = catsFor(type);
    const i = list.indexOf(cat);
    return PALETTE[(i < 0 ? list.length : i) % PALETTE.length];
  };
  const money = (n) => {
    const cents = Math.round(Math.abs(n) * 100);
    const txt = state.currency + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (n < 0 && cents > 0 ? '−' : '') + txt;
  };
  const signed = (e) => (e.type === 'income' ? e.amount : -e.amount);
  const r2 = (n) => Math.round(n * 100) / 100;
  const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const todayStr = () => {
    const d = new Date();
    return ym(d) + '-' + String(d.getDate()).padStart(2, '0');
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Balance after each transaction, oldest to newest, starting from the opening balance
  function balances() {
    const all = state.expenses.slice().sort((a, b) => a.date.localeCompare(b.date) || (a.created || 0) - (b.created || 0));
    let bal = state.opening;
    const map = {};
    all.forEach((e) => { bal = r2(bal + signed(e)); map[e.id] = bal; });
    return { map, final: bal };
  }

  function monthTx(d) {
    const key = ym(d);
    return state.expenses.filter((e) => e.date.startsWith(key))
      .sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0));
  }
  const sum = (items, type) => items.filter((e) => e.type === type).reduce((s, e) => s + e.amount, 0);

  function breakdown(el, items, type) {
    const byCat = {};
    items.filter((e) => e.type === type).forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
    const total = Object.values(byCat).reduce((a, b) => a + b, 0);
    const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    el.innerHTML = rows.length ? rows.map(([c, v]) =>
      '<div class="bar"><div class="top"><span>' + esc(c) + '</span><b>' + money(v) + ' · ' + Math.round(v / total * 100) + '%</b></div>' +
      '<div class="track"><div class="fill" style="width:' + (v / total * 100) + '%;background:' + colorFor(c, type) + '"></div></div></div>'
    ).join('') : '<p class="muted">Nothing here yet.</p>';
  }

  function render() {
    const { map, final } = balances();
    $('#balance').textContent = money(final);
    $('#monthLabel').textContent = view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const items = monthTx(view);
    $('#monthIn').textContent = money(sum(items, 'income'));
    $('#monthOut').textContent = money(sum(items, 'expense'));

    const list = $('#list');
    list.innerHTML = '';
    $('#empty').hidden = items.length > 0;
    let lastDay = null;
    items.forEach((e) => {
      if (e.date !== lastDay) {
        lastDay = e.date;
        const head = document.createElement('div');
        head.className = 'day';
        const dt = new Date(e.date + 'T00:00:00');
        // newest entry of the day comes first, so its balance is the end-of-day balance
        head.innerHTML = '<span>' + esc(dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })) +
          '</span><span>Balance ' + money(map[e.id]) + '</span>';
        list.appendChild(head);
      }
      const inc = e.type === 'income';
      const b = document.createElement('button');
      b.className = 'item';
      b.innerHTML = '<span class="dot" style="background:' + colorFor(e.category, e.type) + '"></span>' +
        '<span class="meta"><div class="cat">' + esc(e.category) + '</div>' +
        (e.note ? '<div class="note">' + esc(e.note) + '</div>' : '') + '</span>' +
        '<span class="right"><div class="amt' + (inc ? ' inc' : '') + '">' + (inc ? '+' : '−') + money(e.amount) + '</div>' +
        '<div class="bal">' + money(map[e.id]) + '</div></span>';
      b.onclick = () => openDialog(e);
      list.appendChild(b);
    });

    breakdown($('#catSummary'), items, 'expense');
    breakdown($('#incSummary'), items, 'income');

    const months = [];
    for (let i = 5; i >= 0; i--) months.push(new Date(view.getFullYear(), view.getMonth() - i, 1));
    const data = months.map((d) => { const m = monthTx(d); return { i: sum(m, 'income'), o: sum(m, 'expense') }; });
    const max = Math.max(1, ...data.map((x) => Math.max(x.i, x.o)));
    $('#trend').innerHTML = '<div class="trend">' + months.map((d, k) =>
      '<div class="col" title="In ' + money(data[k].i) + ' / Out ' + money(data[k].o) + '"><div class="pair">' +
      '<i class="b in" style="height:' + (data[k].i / max * 100) + '%"></i>' +
      '<i class="b out" style="height:' + (data[k].o / max * 100) + '%"></i></div>' +
      '<span>' + esc(d.toLocaleDateString(undefined, { month: 'short' })) + '</span></div>').join('') + '</div>';

    renderCats('#catList', 'categories', 'expense');
    renderCats('#incList', 'incomeCategories', 'income');
  }

  function renderCats(sel, key, type) {
    const box = $(sel);
    box.innerHTML = '';
    state[key].forEach((c) => {
      const r = document.createElement('div');
      r.className = 'cat-row';
      r.innerHTML = '<span class="dot" style="background:' + colorFor(c, type) + '"></span><span>' + esc(c) + '</span><button aria-label="Remove ' + esc(c) + '">&times;</button>';
      r.querySelector('button').onclick = () => {
        if (state[key].length <= 1) return alert('Keep at least one category.');
        if (confirm('Remove category "' + c + '"? Existing entries keep their label.')) {
          state[key] = state[key].filter((x) => x !== c); save(); render();
        }
      };
      box.appendChild(r);
    });
  }

  function syncSettings() {
    $('#currency').value = state.currency;
    $('#opening').value = state.opening || '';
  }

  // add / edit dialog
  function setType(t) {
    dlgType = t;
    document.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.type === t));
    $('#dlgTitle').textContent = (editingId ? 'Edit ' : 'Add ') + t;
    const keep = $('#category').value;
    const cats = catsFor(t).slice();
    const cur = editingId ? state.expenses.find((x) => x.id === editingId) : null;
    if (cur && cur.type === t && !cats.includes(cur.category)) cats.push(cur.category);
    $('#category').innerHTML = cats.map((c) => '<option>' + esc(c) + '</option>').join('');
    $('#category').value = cats.includes(keep) ? keep : cats[0];
  }
  document.querySelectorAll('.seg button').forEach((b) => b.onclick = () => setType(b.dataset.type));

  function openDialog(exp) {
    editingId = exp ? exp.id : null;
    $('#category').innerHTML = '';
    setType(exp ? exp.type : 'expense');
    if (exp) $('#category').value = exp.category;
    $('#amount').value = exp ? exp.amount : '';
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
    const data = { type: dlgType, amount: r2(amount), category: $('#category').value, date: $('#date').value, note: $('#note').value.trim() };
    if (editingId) {
      Object.assign(state.expenses.find((x) => x.id === editingId), data);
    } else {
      state.expenses.push(Object.assign({ id: uid(), created: Date.now() }, data));
    }
    save();
    const d = new Date(data.date + 'T00:00:00'); view = new Date(d.getFullYear(), d.getMonth(), 1);
    $('#dlg').close(); render();
  });
  $('#delete').onclick = () => {
    if (!confirm('Delete this entry?')) return;
    state.expenses = state.expenses.filter((x) => x.id !== editingId);
    save(); $('#dlg').close(); render();
  };

  // navigation
  $('#prevMonth').onclick = () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); };
  $('#nextMonth').onclick = () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); };
  document.querySelectorAll('.tab').forEach((t) => t.onclick = () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + t.dataset.tab));
    $('#fab').style.display = t.dataset.tab === 'settings' ? 'none' : '';
  });

  // settings
  $('#currency').addEventListener('input', (e) => { state.currency = e.target.value; save(); render(); });
  $('#opening').addEventListener('input', (e) => { state.opening = parseFloat(e.target.value) || 0; save(); render(); });
  function addCat(formSel, inputSel, key) {
    $(formSel).addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $(inputSel).value.trim();
      if (v && !state[key].includes(v)) { state[key].push(v); save(); }
      $(inputSel).value = ''; render();
    });
  }
  addCat('#catForm', '#newCat', 'categories');
  addCat('#incForm', '#newInc', 'incomeCategories');

  // export / import
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  $('#exportCsv').onclick = () => {
    const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
    const { map } = balances();
    const rows = [['Date', 'Type', 'Category', 'Amount', 'Note', 'Balance'].join(',')]
      .concat(state.expenses.slice().sort((a, b) => a.date.localeCompare(b.date) || (a.created || 0) - (b.created || 0))
        .map((e) => [e.date, e.type, q(e.category), signed(e).toFixed(2), q(e.note || ''), map[e.id].toFixed(2)].join(',')));
    download('transactions-' + todayStr() + '.csv', rows.join('\n'), 'text/csv');
  };
  $('#exportJson').onclick = () => download('expenses-backup-' + todayStr() + '.json', JSON.stringify(state, null, 2), 'application/json');
  $('#importJson').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!Array.isArray(d.expenses)) throw new Error('bad file');
      if (!confirm('Replace current data with this backup (' + d.expenses.length + ' entries)?')) return;
      Object.assign(state, normalize(d));
      save(); syncSettings(); render();
    } catch (err) { alert('That file is not a valid backup.'); }
    e.target.value = '';
  };
  $('#wipe').onclick = () => {
    if (confirm('Delete ALL transactions? This cannot be undone.') && confirm('Really delete everything?')) {
      state.expenses = []; save(); render();
    }
  };

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  syncSettings();
  render();
})();
