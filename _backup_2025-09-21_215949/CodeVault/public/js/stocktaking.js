document.addEventListener('DOMContentLoaded', function() {
  const groupsContainer = document.getElementById('stock-groups');
  const searchInput     = document.getElementById('stockSearch');

  let allStock = [];

  const norm = (s) => String(s || '').toLowerCase().trim();

  // ألوان Notion للـ select
  const colorVars = (color = 'default') => {
    switch (color) {
      case 'gray':   return { bg:'#F3F4F6', text:'#374151', border:'#E5E7EB' };
      case 'brown':  return { bg:'#EFEBE9', text:'#4E342E', border:'#D7CCC8' };
      case 'orange': return { bg:'#FFF7ED', text:'#9A3412', border:'#FED7AA' };
      case 'yellow': return { bg:'#FEFCE8', text:'#854D0E', border:'#FDE68A' };
      case 'green':  return { bg:'#ECFDF5', text:'#065F46', border:'#A7F3D0' };
      case 'blue':   return { bg:'#EFF6FF', text:'#1E40AF', border:'#BFDBFE' };
      case 'purple': return { bg:'#F5F3FF', text:'#5B21B6', border:'#DDD6FE' };
      case 'pink':   return { bg:'#FDF2F8', text:'#9D174D', border:'#FBCFE8' };
      case 'red':    return { bg:'#FEF2F2', text:'#991B1B', border:'#FECACA' };
      default:       return { bg:'#F3F4F6', text:'#111827', border:'#E5E7EB' };
    }
  };

  const makeTagPill = (tag) => {
    const span = document.createElement('span');
    const color = (tag && tag.color) || 'default';
    span.className = `tag-pill tag--${color}`;
    span.textContent = (tag && tag.name) || 'Untagged';
    span.title = (tag && tag.name) || 'Untagged';
    return span;
  };

  const makeQtyPill = (value) => {
    const span = document.createElement('span');
    span.className = 'qty-pill';
    const shown =
      typeof value === 'number' && Number.isFinite(value) ? value : '—';
    span.textContent = String(shown);
    return span;
  };

  const groupByTag = (rows) => {
    const map = new Map();
    rows.forEach(item => {
      const name  = item?.tag?.name || 'Untagged';
      const color = item?.tag?.color || 'default';
      const key = `${name.toLowerCase()}|${color}`;
      if (!map.has(key)) map.set(key, { name, color, items: [] });
      map.get(key).items.push(item);
    });

    // ترتيب أبجدي وUntagged في الآخر
    let arr = Array.from(map.values()).sort((a,b) => a.name.localeCompare(b.name));
    const untagged = arr.filter(g => g.name.toLowerCase() === 'untagged' || g.name === '-');
    arr = arr.filter(g => !(g.name.toLowerCase() === 'untagged' || g.name === '-'));
    return arr.concat(untagged);
  };

  const renderGroups = (rows) => {
    groupsContainer.innerHTML = '';

    if (!rows || rows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-block';
      empty.textContent = 'No results found.';
      groupsContainer.appendChild(empty);
      return;
    }

    const groups = groupByTag(rows);
    const frag = document.createDocumentFragment();

    groups.forEach(group => {
      const card = document.createElement('section');
      card.className = 'card card--elevated group-card';

      const cv = colorVars(group.color);
      card.style.setProperty('--group-accent-bg', cv.bg);
      card.style.setProperty('--group-accent-text', cv.text);
      card.style.setProperty('--group-accent-border', cv.border);

      // Header: Tag فقط هنا
      const head = document.createElement('div');
      head.className = 'group-card__head';
      head.innerHTML = `
        <div class="group-head-left">
          <span class="group-title">Tag</span>
          <span class="group-tag">${makeTagPill(group).outerHTML}</span>
        </div>
        <div class="group-head-right">
          <span class="group-count">${group.items.length} items</span>
        </div>
      `;

      // Table
      const tableWrap = document.createElement('div');
      tableWrap.className = 'group-table-wrap';

      const table = document.createElement('table');
      table.className = 'group-table';

      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr>
          <th>Component</th>
          <th class="col-kit">One Kit Quantity</th>
          <th class="col-num">In Stock</th>
        </tr>
      `;

      const tbody = document.createElement('tbody');
      group.items
        .sort((a,b) => (a.name || '').localeCompare(b.name || ''))
        .forEach(item => {
          const tr = document.createElement('tr');

          const tdName = document.createElement('td');
          tdName.textContent = item.name || '-';
          tdName.style.fontWeight = '600';

          const tdKit = document.createElement('td');
          tdKit.className = 'col-kit';
          tdKit.appendChild(makeQtyPill(item.oneKitQuantity));

          const tdQty = document.createElement('td');
          tdQty.className = 'col-num';
          tdQty.textContent = (item.quantity ?? 0).toString();

          tr.appendChild(tdName);
          tr.appendChild(tdKit);
          tr.appendChild(tdQty);
          tbody.appendChild(tr);
        });

      table.appendChild(thead);
      table.appendChild(tbody);
      tableWrap.appendChild(table);

      card.appendChild(head);
      card.appendChild(tableWrap);
      frag.appendChild(card);
    });

    groupsContainer.appendChild(frag);
    if (window.feather) feather.replace();
  };

  const applyFilter = () => {
    const q = norm(searchInput ? searchInput.value : '');
    if (!q) { renderGroups(allStock); return; }
    const filtered = allStock.filter(x => {
      const name = norm(x.name);
      const tag  = norm(x.tag?.name);
      return name.includes(q) || tag.includes(q);
    });
    renderGroups(filtered);
  };

  const fetchStockData = async () => {
    groupsContainer.innerHTML = `
      <div class="loading-block">
        <i data-feather="loader" class="loading-icon"></i> Loading stock data...
      </div>
    `;
    try {
      const response = await fetch('/api/stock', { credentials: 'include' });
      if (response.status === 401 || response.redirected) {
        window.location.href = '/login';
        return;
      }
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch stock data');
      }
      const data = await response.json();
      // متوقع: [{ id, name, quantity, oneKitQuantity, tag }]
      allStock = Array.isArray(data) ? data : [];
      renderGroups(allStock);
    } catch (error) {
      console.error('Error fetching stock data:', error);
      groupsContainer.innerHTML = `<div class="error-block">Error: ${error.message}</div>`;
    }
  };

  fetchStockData();

  if (searchInput) {
    searchInput.addEventListener('input', applyFilter);
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && searchInput.value) {
        searchInput.value = '';
        applyFilter();
      }
    });
  }
});
// Download PDF button
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('downloadPdfBtn');
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    btn.disabled = true;
    btn.classList.add('is-busy');
    // هنفتح الرابط مباشرة، الهيدر هيجبر التحميل
    const link = document.createElement('a');
    link.href = '/api/stock/pdf';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => {
      btn.disabled = false;
      btn.classList.remove('is-busy');
    }, 1200);
  });
});