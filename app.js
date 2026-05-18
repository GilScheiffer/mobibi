/* ============================================================
   MoBibi — app.js
   ============================================================ */

'use strict';

// ============================================================
// CONFIG — edite aqui antes de publicar no GitHub
// ============================================================

const NAMES      = { my: 'Gil', her: 'Bia' };
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyC4sUsrqYAt8BFeWTh6-AgvOGbaiUceSDNibAgZ7PLGbfj9LgYu9MgAA14kSN2DdL6/exec';
const TMDB_KEY   = 'ea483053614c87cac1dcd2a3a78cd22d';

const cfg = {
  get myName()   { return NAMES.my; },
  get herName()  { return NAMES.her; },
  get scriptUrl(){ return SCRIPT_URL; },
  get tmdbKey()  { return TMDB_KEY; },
};

// ============================================================
// STATE
// ============================================================
const state = {
  watchlist:    [],
  watched:      [],
  tonightPick:  null,
  currentDraw:  null,
  addingMovie:  { title: '', genre: '', duration: '', poster: '' },
  markingMovie: null,
  drawFromTonight: false,
};

// ============================================================
// API — Google Apps Script
// ============================================================
const API = {
  async get(action) {
    if (!cfg.scriptUrl) throw new Error('Script URL não configurada.');
    const url = `${cfg.scriptUrl}?action=${action}&t=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  async post(data) {
    if (!cfg.scriptUrl) throw new Error('Script URL não configurada.');
    const res = await fetch(cfg.scriptUrl, {
      method: 'POST',
      body: JSON.stringify(data),
      // No Content-Type header → no CORS preflight
    });
    return res.json().catch(() => ({ success: true }));
  },

  async getWatchlist()    { return (await this.get('getWatchlist')).movies || []; },
  async getWatched()      { return (await this.get('getWatched')).movies || []; },
  async addToWatchlist(m)   { return this.post({ action: 'addToWatchlist', ...m }); },
  async markAsWatched(m)    { return this.post({ action: 'markAsWatched', ...m }); },
  async removeFromList(t)   { return this.post({ action: 'removeFromWatchlist', title: t }); },
  async updateWatched(m)    { return this.post({ action: 'updateWatched', ...m }); },
  async removeFromWatched(t){ return this.post({ action: 'removeFromWatched', title: t }); },
};

// ============================================================
// TMDB
// ============================================================
const TMDB = {
  BASE: 'https://api.themoviedb.org/3',
  IMG:  'https://image.tmdb.org/t/p/w500',

  async search(query) {
    if (!cfg.tmdbKey) return [];
    const url = `${this.BASE}/search/movie?api_key=${cfg.tmdbKey}&query=${encodeURIComponent(query)}&language=pt-BR&include_adult=false`;
    const res = await fetch(url);
    const data = await res.json();
    return data.results || [];
  },

  async getDetails(id) {
    if (!cfg.tmdbKey) return null;
    const url = `${this.BASE}/movie/${id}?api_key=${cfg.tmdbKey}&language=pt-BR`;
    const res = await fetch(url);
    return res.json();
  },

  poster(path) {
    return path ? `${this.IMG}${path}` : null;
  },

  minutesToDuration(min) {
    if (!min) return '';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
  }
};

// ============================================================
// NAVIGATION
// ============================================================
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });
  const el = document.getElementById(`page-${page}`);
  if (el) el.classList.add('active');

  if (page === 'home')      renderHome();
  if (page === 'watchlist') renderWatchlist();
  if (page === 'watched')   renderWatched();
}

// ============================================================
// RENDER — Home
// ============================================================
function renderHome() {
  // document.getElementById('heroSub').textContent = `${cfg.myName} & ${cfg.herName} ❤️`;
  document.getElementById('s-myname').textContent = cfg.myName;
  document.getElementById('s-hername').textContent = cfg.herName;

  // stats
  const w = state.watched;
  document.getElementById('s-watched').textContent = w.length;
  document.getElementById('s-list').textContent = state.watchlist.length;

  const myScores  = w.map(m => parseFloat(m.myScore)).filter(n => !isNaN(n));
  const herScores = w.map(m => parseFloat(m.herScore)).filter(n => !isNaN(n));

  document.getElementById('s-myavg').textContent =
    myScores.length ? (myScores.reduce((a,b) => a+b, 0) / myScores.length).toFixed(1) : '—';
  document.getElementById('s-heravg').textContent =
    herScores.length ? (herScores.reduce((a,b) => a+b, 0) / herScores.length).toFixed(1) : '—';

  const totalMinutes = w.reduce((acc, m) => {
    const parts = String(m.duration || '').split(':').map(Number);
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1]))
      return acc + parts[0] * 60 + parts[1];
    return acc;
  }, 0);
  const th = Math.floor(totalMinutes / 60);
  const tm = totalMinutes % 60;
  document.getElementById('s-hours').textContent = tm > 0 ? `${th}h ${tm}m` : `${th}h`;

  // tonight's pick
  const tc = document.getElementById('tonightCard');
  if (state.tonightPick) {
    const m = state.tonightPick;
    tc.style.display = 'flex';
    document.getElementById('tonightTitle').textContent = m.title;
    const meta = [m.genre, m.duration].filter(Boolean).join(' • ');
    document.getElementById('tonightMeta').textContent = meta;
    setPoster('tonightPoster', 'tonightPosterPh', m.poster);
  } else {
    tc.style.display = 'none';
  }

  // recent watched (last 6 by watched date)
  const recent = [...state.watched].sort((a, b) => dateToNum(b.date) - dateToNum(a.date)).slice(0, 6);
  const grid = document.getElementById('home-recent');
  const block = document.getElementById('recentBlock');
  if (recent.length) {
    block.style.display = 'block';
    grid.innerHTML = recent.map(m => movieCardHTML(m, 'watched', true)).join('');
  } else {
    block.style.display = 'none';
  }
}

// ============================================================
// RENDER — Watchlist
// ============================================================
function renderWatchlist() {
  filterWatchlist();
}

const WATCHLIST_PER_PAGE = 18;

function durationToMinutes(str) {
  if (!str) return null;
  const p = str.split(':').map(Number);
  if (p.length >= 2 && !isNaN(p[0]) && !isNaN(p[1])) return p[0] * 60 + p[1];
  return null;
}

function populateWatchlistGenreFilter() {
  const sel = document.getElementById('watchlistGenre');
  if (!sel) return;
  const current = sel.value;
  const genres = new Set();
  state.watchlist.forEach(m => {
    (m.genre || '').split(',').forEach(g => { const t = g.trim(); if (t) genres.add(t); });
  });
  sel.innerHTML = '<option value="">Todos os gêneros</option>' +
    [...genres].sort().map(g => `<option value="${esc(g)}"${current === g ? ' selected' : ''}>${esc(g)}</option>`).join('');
}

function filterWatchlist(resetPage = false) {
  if (resetPage) state._watchlistPage = 0;
  if (!state._watchlistPage) state._watchlistPage = 0;

  const query    = (document.getElementById('watchlistSearch')?.value || '').toLowerCase();
  const sort     = document.getElementById('watchlistSort')?.value || 'added-desc';
  const genre    = document.getElementById('watchlistGenre')?.value || '';
  const duration = document.getElementById('watchlistDuration')?.value || '';
  const grid     = document.getElementById('watchlist-grid');
  const empty    = document.getElementById('watchlist-empty');
  const count    = document.getElementById('watchlist-count');
  const pag      = document.getElementById('watchlist-pagination');

  document.getElementById('watchlistLoading').style.display = 'none';
  count.textContent = `${state.watchlist.length} ${state.watchlist.length === 1 ? 'filme' : 'filmes'}`;

  let list = state.watchlist.filter(m => {
    if (!m.title.toLowerCase().includes(query)) return false;
    if (genre && !(m.genre || '').split(',').map(g => g.trim()).includes(genre)) return false;
    if (duration) {
      const mins = durationToMinutes(m.duration);
      if (mins === null) return false;
      if (duration === 'short' && mins >= 90)  return false;
      if (duration === 'mid'   && (mins < 90 || mins > 120)) return false;
      if (duration === 'long'  && mins <= 120) return false;
    }
    return true;
  });

  list.sort((a, b) => {
    if (sort === 'year-asc') return (parseInt(a.year) || 0) - (parseInt(b.year) || 0);
    return (parseInt(b.year) || 0) - (parseInt(a.year) || 0); // year-desc
  });

  if (!list.length) {
    grid.innerHTML = '';
    empty.style.display = 'flex';
    pag.style.display = 'none';
    return;
  }
  empty.style.display = 'none';

  const totalPages = Math.ceil(list.length / WATCHLIST_PER_PAGE);
  state._watchlistPage = Math.max(0, Math.min(state._watchlistPage, totalPages - 1));
  const page  = state._watchlistPage;
  const slice = list.slice(page * WATCHLIST_PER_PAGE, (page + 1) * WATCHLIST_PER_PAGE);

  grid.innerHTML = slice.map(m => movieCardHTML(m, 'watchlist')).join('');

  if (totalPages > 1) {
    pag.style.display = 'flex';
    document.getElementById('wl-page-info').textContent = `${page + 1} / ${totalPages}`;
    document.getElementById('wl-page-prev').disabled = page === 0;
    document.getElementById('wl-page-next').disabled = page === totalPages - 1;
  } else {
    pag.style.display = 'none';
  }
}

function changeWatchlistPage(delta) {
  state._watchlistPage = (state._watchlistPage || 0) + delta;
  filterWatchlist();
  document.getElementById('page-watchlist')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================================
// RENDER — Watched
// ============================================================
function renderWatched() {
  filterWatched();
}

const WATCHED_PER_PAGE = 18;

// Converte "dd/MM/yyyy" → número comparável (yyyyMMdd)
function dateToNum(str) {
  if (!str) return 0;
  const p = str.split('/');
  if (p.length === 3) return parseInt(p[2] + p[1] + p[0], 10);
  return 0;
}

function populateGenreFilter() {
  const sel = document.getElementById('watchedGenre');
  if (!sel) return;
  const current = sel.value;
  const genres = new Set();
  state.watched.forEach(m => {
    (m.genre || '').split(',').forEach(g => { const t = g.trim(); if (t) genres.add(t); });
  });
  const sorted = [...genres].sort();
  sel.innerHTML = '<option value="">Todos os gêneros</option>' +
    sorted.map(g => `<option value="${esc(g)}"${current === g ? ' selected' : ''}>${esc(g)}</option>`).join('');
}

function filterWatched(resetPage = false) {
  if (resetPage) state._watchedPage = 0;
  if (!state._watchedPage) state._watchedPage = 0;

  const query  = (document.getElementById('watchedSearch')?.value || '').toLowerCase();
  const sort   = document.getElementById('watchedSort')?.value || 'date-desc';
  const genre  = document.getElementById('watchedGenre')?.value || '';
  const grid   = document.getElementById('watched-grid');
  const empty  = document.getElementById('watched-empty');
  const count  = document.getElementById('watched-count');
  const pag    = document.getElementById('watched-pagination');

  document.getElementById('watchedLoading').style.display = 'none';

  let list = state.watched.filter(m => {
    if (!m.title.toLowerCase().includes(query)) return false;
    if (genre && !(m.genre || '').split(',').map(g => g.trim()).includes(genre)) return false;
    return true;
  });

  list.sort((a, b) => {
    if (sort === 'date-asc')      return dateToNum(a.date) - dateToNum(b.date);
    if (sort === 'myscore-desc')  return parseFloat(b.myScore||0) - parseFloat(a.myScore||0);
    if (sort === 'herscore-desc') return parseFloat(b.herScore||0) - parseFloat(a.herScore||0);
    if (sort === 'avg-desc') {
      const avgA = (parseFloat(a.myScore||0) + parseFloat(a.herScore||0)) / 2;
      const avgB = (parseFloat(b.myScore||0) + parseFloat(b.herScore||0)) / 2;
      return avgB - avgA;
    }
    return dateToNum(b.date) - dateToNum(a.date); // date-desc
  });

  count.textContent = `${state.watched.length} ${state.watched.length === 1 ? 'filme' : 'filmes'}`;

  if (!list.length) {
    grid.innerHTML = '';
    empty.style.display = 'flex';
    pag.style.display = 'none';
    return;
  }
  empty.style.display = 'none';

  // Paginação
  const totalPages = Math.ceil(list.length / WATCHED_PER_PAGE);
  state._watchedPage = Math.max(0, Math.min(state._watchedPage, totalPages - 1));
  const page  = state._watchedPage;
  const slice = list.slice(page * WATCHED_PER_PAGE, (page + 1) * WATCHED_PER_PAGE);

  grid.innerHTML = slice.map(m => movieCardHTML(m, 'watched')).join('');

  if (totalPages > 1) {
    pag.style.display = 'flex';
    document.getElementById('page-info').textContent = `${page + 1} / ${totalPages}`;
    document.getElementById('page-prev').disabled = page === 0;
    document.getElementById('page-next').disabled = page === totalPages - 1;
  } else {
    pag.style.display = 'none';
  }
}

function changePage(delta) {
  state._watchedPage = (state._watchedPage || 0) + delta;
  filterWatched();
  document.getElementById('page-watched')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================================
// MOVIE CARD HTML
// ============================================================
function movieCardHTML(movie, type, readonly = false) {
  const hasPoster = !!movie.poster;
  const posterHTML = hasPoster
    ? `<img class="movie-card-poster" src="${esc(movie.poster)}" alt="${esc(movie.title)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">`
    : '';
  const phHTML = `<div class="movie-card-ph" style="${hasPoster ? 'display:none' : ''}">🎬</div>`;

  let metaLine = [movie.genre, movie.duration].filter(Boolean).join(' • ');

  let scoresHTML = '';
  if (type === 'watched') {
    const s1 = movie.myScore  != null && movie.myScore  !== '' ? `<span class="score-badge">⭐ ${movie.myScore}<span class="score-who"> ${cfg.myName}</span></span>` : '';
    const s2 = movie.herScore != null && movie.herScore !== '' ? `<span class="score-badge">⭐ ${movie.herScore}<span class="score-who"> ${cfg.herName}</span></span>` : '';
    scoresHTML = `<div class="movie-card-scores">${s1}${s2}</div>`;
  }

  const clickHandler = (type === 'watched' || type === 'watchlist')
    ? `onclick="openDetail('${esc(movie.title)}','${type}')" style="cursor:pointer"`
    : '';

  return `
    <div class="movie-card" ${clickHandler}>
      ${posterHTML}
      ${phHTML}
      <div class="movie-card-gradient"></div>
      <div class="movie-card-info">
        <div class="movie-card-title">${esc(movie.title)}</div>
        ${metaLine ? `<div class="movie-card-meta">${esc(metaLine)}</div>` : ''}
        ${scoresHTML}
      </div>
    </div>`;
}

// ============================================================
// MODAL HELPERS
// ============================================================
function openModal(id) {
  const el = document.getElementById(id);
  if (el) { el.style.display = 'flex'; void el.offsetWidth; el.classList.add('open'); }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('open'); el.style.display = 'none'; }
  if (id === 'watchedModal' && state.editingWatched) {
    state.editingWatched = false;
    document.getElementById('confirmWatchedBtn').textContent = 'Salvar';
  }
}

function closeModalOutside(event, id) {
  if (event.target.id === id) closeModal(id);
}


// ============================================================
// TMDB SEARCH (in add modal)
// ============================================================
async function searchTMDB() {
  const query = document.getElementById('tmdbSearch').value.trim();
  if (!query) return;

  if (!cfg.tmdbKey) return;

  const btn = document.getElementById('tmdbSearchBtn');
  btn.textContent = '...';
  btn.disabled = true;

  try {
    const results = await TMDB.search(query);
    renderTMDBResults(results);
  } catch {
    showToast('Erro na busca TMDB. Verifique sua API key.', 'error');
  } finally {
    btn.textContent = 'Buscar';
    btn.disabled = false;
  }
}

function renderTMDBResults(results) {
  const container = document.getElementById('tmdbResults');
  if (!results.length) {
    container.innerHTML = '<p style="text-align:center;color:var(--text3);font-size:13px;padding:16px">Nenhum resultado encontrado.</p>';
    return;
  }
  // Store results in state so onclick can look up by index (avoids JSON-in-attribute issues)
  state._tmdbResults = results.slice(0, 8).map(m => ({
    id: m.id,
    title: m.title,
    poster: TMDB.poster(m.poster_path) || '',
    year: m.release_date ? m.release_date.slice(0, 4) : '',
    genre: ''
  }));

  container.innerHTML = state._tmdbResults.map((m, idx) => {
    const posterEl = m.poster
      ? `<img class="tmdb-item-poster" src="${esc(m.poster)}" alt="" onerror="this.style.display='none'">`
      : `<div class="tmdb-item-poster-ph">🎬</div>`;
    return `
      <div class="tmdb-item" onclick="selectTMDBByIndex(${idx})">
        ${posterEl}
        <div>
          <div class="tmdb-item-title">${esc(m.title)}</div>
          <div class="tmdb-item-year">${esc(m.year)}</div>
        </div>
      </div>`;
  }).join('');
}

async function selectTMDBByIndex(idx) {
  const movie = (state._tmdbResults || [])[idx];
  if (movie) await selectTMDBResult(movie);
}

async function selectTMDBResult(movie) {

  // Fetch details for genre + duration
  try {
    const details = await TMDB.getDetails(movie.id);
    if (details) {
      const genres = details.genres?.map(g => g.name).slice(0, 2).join(', ') || '';
      const duration = TMDB.minutesToDuration(details.runtime);
      movie.genre    = genres;
      movie.duration = duration;
    }
  } catch { /* Fail silently, user can enter manually */ }

  // Populate form
  document.getElementById('add-title').value    = movie.title;
  document.getElementById('add-genre').value    = movie.genre || '';
  document.getElementById('add-duration').value = movie.duration || '';
  document.getElementById('add-poster').value   = movie.poster || '';

  // Show preview
  document.getElementById('selTitle').textContent = movie.title;
  document.getElementById('selMeta').textContent = [movie.genre, movie.duration].filter(Boolean).join(' • ');
  if (movie.poster) {
    document.getElementById('selPosterImg').src = movie.poster;
  }
  document.getElementById('selectedPreview').style.display = 'flex';
  document.getElementById('tmdbResults').innerHTML = '';
  document.getElementById('tmdbSearch').value = '';

  state.addingMovie = movie;
}

function clearSelection() {
  state.addingMovie = { title: '', genre: '', duration: '', poster: '' };
  document.getElementById('selectedPreview').style.display = 'none';
  document.getElementById('add-title').value = '';
  document.getElementById('add-genre').value = '';
  document.getElementById('add-duration').value = '';
  document.getElementById('add-poster').value = '';
}

// ============================================================
// ADD MOVIE TO WATCHLIST
// ============================================================
async function confirmAddMovie() {
  const title    = document.getElementById('add-title').value.trim();
  const genre    = document.getElementById('add-genre').value.trim();
  const duration = document.getElementById('add-duration').value.trim();
  const poster   = document.getElementById('add-poster').value.trim();

  if (!title) { showToast('Digite o título do filme.', 'error'); return; }

  // Check duplicate
  if (state.watchlist.some(m => m.title.toLowerCase() === title.toLowerCase())) {
    showToast('Esse filme já está na lista!', 'error');
    return;
  }

  const year  = state.addingMovie?.year || '';
  const movie = { title, genre, duration, poster, year };

  // Optimistic update
  state.watchlist.push(movie);
  renderWatchlist();
  closeModal('addMovieModal');
  resetAddForm();
  showToast(`"${title}" adicionado à lista!`, 'success');

  // Persist
  if (cfg.scriptUrl) {
    try { await API.addToWatchlist(movie); }
    catch { showToast('Erro ao salvar na planilha. Verifique as configurações.', 'error'); }
  } else {
    saveLocal();
  }
}

function resetAddForm() {
  document.getElementById('tmdbSearch').value = '';
  document.getElementById('tmdbResults').innerHTML = '';
  document.getElementById('add-title').value = '';
  document.getElementById('add-genre').value = '';
  document.getElementById('add-duration').value = '';
  document.getElementById('add-poster').value = '';
  document.getElementById('selectedPreview').style.display = 'none';
  state.addingMovie = { title: '', genre: '', duration: '', poster: '' };
}

// Lookup helpers (safe for use in onclick with HTML-escaped titles)
function openMarkWatchedByTitle(title) {
  // esc() was applied when building the HTML; &amp; etc must be unescaped
  const decoded = title.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
  const movie = state.watchlist.find(m => m.title === decoded);
  if (movie) openMarkWatched(movie);
}

function removeByTitle(title) {
  const decoded = title.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
  const movie = state.watchlist.find(m => m.title === decoded);
  if (movie) removeFromWatchlist(movie);
}

function editWatchedByTitle(title) {
  const decoded = title.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
  const movie = state.watched.find(m => m.title === decoded);
  if (!movie) return;

  state.markingMovie    = movie;
  state.editingWatched  = true;

  document.getElementById('r-myname').textContent  = cfg.myName;
  document.getElementById('r-hername').textContent = cfg.herName;

  const preview = document.getElementById('watchedPreview');
  preview.innerHTML = `
    <div style="display:flex; align-items:center; gap:14px;">
      ${movie.poster
        ? `<img class="prev-poster" src="${esc(movie.poster)}" alt="" onerror="this.style.display='none'">`
        : `<div class="prev-poster-ph">🎬</div>`}
      <div>
        <div class="prev-title">${esc(movie.title)}</div>
        <div class="prev-meta">${esc([movie.genre, movie.duration].filter(Boolean).join(' • '))}</div>
      </div>
    </div>`;

  // Preenche data existente (converte dd/MM/yyyy → yyyy-MM-dd)
  const parts = (movie.date || '').split('/');
  const dateVal = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : new Date().toISOString().slice(0,10);
  document.getElementById('watched-date').value = dateVal;

  // Preenche notas existentes
  const my  = parseFloat(movie.myScore)  || 0;
  const her = parseFloat(movie.herScore) || 0;
  document.getElementById('myRatingSlider').value  = my;
  document.getElementById('herRatingSlider').value = her;
  updateRating('my',  my);
  updateRating('her', her);

  document.getElementById('confirmWatchedBtn').textContent = 'Salvar Edição';
  openModal('watchedModal');
}

async function deleteWatchedByTitle(title) {
  const decoded = title.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
  if (!confirm(`Remover "${decoded}" dos assistidos?`)) return;

  state.watched = state.watched.filter(m => m.title !== decoded);
  renderWatched();
  renderHome();
  showToast(`"${decoded}" removido dos assistidos.`, 'info');

  if (cfg.scriptUrl) {
    try { await API.removeFromWatched(decoded); }
    catch { /* Fail silently */ }
  }
}

function openDetail(title, type) {
  const list  = type === 'watched' ? state.watched : state.watchlist;
  const movie = list.find(m => m.title === title);
  if (!movie) return;

  state._detailTitle = title;
  state._detailType  = type;

  const posterEl = document.getElementById('detail-poster');
  const posterPh = document.getElementById('detail-poster-ph');
  if (movie.poster) {
    posterEl.src = movie.poster;
    posterEl.style.display = 'block';
    posterPh.style.display = 'none';
  } else {
    posterEl.style.display = 'none';
    posterPh.style.display = 'flex';
  }

  document.getElementById('detail-title').textContent = movie.title;
  document.getElementById('detail-meta').textContent  = [movie.genre, movie.duration].filter(Boolean).join(' • ');

  const scores = document.getElementById('detail-scores');

  if (type === 'watched') {
    document.getElementById('detail-date').textContent = movie.date ? `📅 ${movie.date}` : '';
    const myScore  = movie.myScore  != null && movie.myScore  !== '' ? parseFloat(movie.myScore)  : null;
    const herScore = movie.herScore != null && movie.herScore !== '' ? parseFloat(movie.herScore) : null;
    scores.innerHTML = `
      <div class="detail-score-row">
        <span class="detail-score-name">${cfg.myName}</span>
        <span class="detail-score-stars">${myScore  !== null ? starsHTML(myScore)  : '—'}</span>
        <span class="detail-score-val">${myScore  !== null ? myScore.toFixed(1)  : ''}</span>
      </div>
      <div class="detail-score-row">
        <span class="detail-score-name">${cfg.herName}</span>
        <span class="detail-score-stars">${herScore !== null ? starsHTML(herScore) : '—'}</span>
        <span class="detail-score-val">${herScore !== null ? herScore.toFixed(1) : ''}</span>
      </div>`;
    document.getElementById('detail-footer').innerHTML = `
      <button class="btn-ghost"    onclick="closeModal('movieDetailModal'); deleteWatchedByTitle(state._detailTitle)">🗑️ Remover</button>
      <button class="btn-primary"  onclick="closeModal('movieDetailModal'); editWatchedByTitle(state._detailTitle)">✏️ Editar</button>`;
  } else {
    document.getElementById('detail-date').textContent = movie.addedAt ? `📅 Adicionado em ${movie.addedAt}` : '';
    scores.innerHTML = '';
    document.getElementById('detail-footer').innerHTML = `
      <button class="btn-ghost"    onclick="closeModal('movieDetailModal'); removeByTitle(state._detailTitle)">🗑️ Remover</button>
      <button class="btn-primary"  onclick="closeModal('movieDetailModal'); openMarkWatchedByTitle(state._detailTitle)">✅ Assistimos!</button>`;
  }

  openModal('movieDetailModal');
}

// ============================================================
// REMOVE FROM WATCHLIST
// ============================================================
async function removeFromWatchlist(movie) {
  if (!confirm(`Remover "${movie.title}" da lista?`)) return;

  state.watchlist = state.watchlist.filter(m => m.title !== movie.title);
  renderWatchlist();
  showToast(`"${movie.title}" removido.`, 'info');

  if (cfg.scriptUrl) {
    try { await API.removeFromList(movie.title); }
    catch { /* Fail silently */ }
  } else {
    saveLocal();
  }
}

// ============================================================
// MARK AS WATCHED MODAL
// ============================================================
function openMarkWatched(jsonStr, isTonight = false) {
  const movie = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
  state.markingMovie = movie;
  state.drawFromTonight = isTonight;

  // Update rating labels
  document.getElementById('r-myname').textContent  = cfg.myName;
  document.getElementById('r-hername').textContent = cfg.herName;

  // Preview
  const preview = document.getElementById('watchedPreview');
  const ph = movie.poster ? '' : 'style="display:flex"';
  preview.innerHTML = `
    <div style="display:flex; align-items:center; gap:14px;">
      ${movie.poster
        ? `<img class="prev-poster" src="${esc(movie.poster)}" alt="" onerror="this.style.display='none'">`
        : `<div class="prev-poster-ph">🎬</div>`}
      <div>
        <div class="prev-title">${esc(movie.title)}</div>
        <div class="prev-meta">${esc([movie.genre, movie.duration].filter(Boolean).join(' • '))}</div>
      </div>
    </div>`;

  // Default date = today
  const today = new Date().toISOString().slice(0,10);
  document.getElementById('watched-date').value = today;

  // Reset sliders
  document.getElementById('myRatingSlider').value  = 3.5;
  document.getElementById('herRatingSlider').value = 3.5;
  updateRating('my',  3.5);
  updateRating('her', 3.5);

  openModal('watchedModal');
}

function updateRating(who, value) {
  const v = parseFloat(value).toFixed(1);
  document.getElementById(`${who}RatingBadge`).textContent = v;
  document.getElementById(`${who}Stars`).innerHTML = starsHTML(parseFloat(value));
}

async function confirmMarkWatched() {
  const movie = state.markingMovie;
  if (!movie) return;

  const rawDate  = document.getElementById('watched-date').value;
  const myScore  = parseFloat(document.getElementById('myRatingSlider').value).toFixed(1);
  const herScore = parseFloat(document.getElementById('herRatingSlider').value).toFixed(1);
  // Converte yyyy-MM-dd → dd/MM/yyyy para exibição
  const [y, mo, d] = rawDate.split('-');
  const date = `${d}/${mo}/${y}`;

  if (state.editingWatched) {
    // Modo edição — atualiza entrada existente
    const idx = state.watched.findIndex(m => m.title === movie.title);
    if (idx !== -1) {
      state.watched[idx] = { ...state.watched[idx], date, myScore, herScore };
    }
    state.editingWatched = false;
    document.getElementById('confirmWatchedBtn').textContent = 'Salvar';
    closeModal('watchedModal');
    showToast(`"${movie.title}" atualizado!`, 'success');
    renderWatched();
    renderHome();
    if (cfg.scriptUrl) {
      try { await API.updateWatched({ title: movie.title, date, myScore, herScore }); }
      catch { showToast('Erro ao salvar na planilha.', 'error'); }
    }
    return;
  }

  const watchedEntry = { ...movie, date, myScore, herScore };

  // Optimistic update
  state.watched.push(watchedEntry);
  state.watchlist = state.watchlist.filter(m => m.title !== movie.title);
  if (state.tonightPick?.title === movie.title) state.tonightPick = null;

  closeModal('watchedModal');
  showToast(`"${movie.title}" marcado como assistido! ⭐`, 'success');

  const activePage = document.querySelector('.page.active')?.id?.replace('page-', '');
  if (activePage === 'home') renderHome();
  if (activePage === 'watchlist') renderWatchlist();
  if (activePage === 'watched') renderWatched();

  if (cfg.scriptUrl) {
    try { await API.markAsWatched(watchedEntry); }
    catch { showToast('Erro ao salvar na planilha.', 'error'); }
  } else {
    saveLocal();
  }
}

// ============================================================
// DRAW
// ============================================================
function drawMovie() {
  const btn       = document.getElementById('drawBtn');
  const slotText  = document.getElementById('slotText');
  const resultEl  = document.getElementById('drawResult');
  const emptyEl   = document.getElementById('drawEmpty');
  const label     = document.getElementById('drawLabel');

  if (!state.watchlist.length) {
    emptyEl.style.display = 'block';
    resultEl.style.display = 'none';
    return;
  }

  emptyEl.style.display = 'none';
  resultEl.style.display = 'none';
  slotText.classList.remove('slot-final');

  btn.disabled = true;
  btn.classList.add('spinning');
  label.textContent = '...';

  // Pick winner
  const winner = state.watchlist[Math.floor(Math.random() * state.watchlist.length)];
  state.currentDraw = winner;

  const titles = state.watchlist.map(m => m.title);
  let iteration = 0;
  const maxIterations = 22;

  function spin() {
    if (iteration >= maxIterations) {
      slotText.textContent = winner.title;
      slotText.classList.add('slot-final');

      setTimeout(() => {
        showDrawResult(winner);
        btn.disabled = false;
        btn.classList.remove('spinning');
        label.textContent = 'SORTEAR';
      }, 400);
      return;
    }

    const randomTitle = titles[Math.floor(Math.random() * titles.length)];
    slotText.textContent = randomTitle;

    const progress = iteration / maxIterations;
    const delay = 60 + Math.pow(progress, 2.5) * 600;
    iteration++;
    setTimeout(spin, delay);
  }

  spin();
}

function showDrawResult(movie) {
  const resultEl  = document.getElementById('drawResult');
  const poster    = document.getElementById('resultPoster');
  const posterPh  = document.getElementById('resultPosterPh');
  const titleEl   = document.getElementById('resultTitle');
  const tagsEl    = document.getElementById('resultTags');

  titleEl.textContent = movie.title;

  if (movie.poster) {
    poster.src = movie.poster;
    poster.style.display = 'block';
    posterPh.style.display = 'none';
  } else {
    poster.style.display = 'none';
    posterPh.style.display = 'flex';
  }

  const tags = [movie.genre, movie.duration].filter(Boolean);
  tagsEl.innerHTML = tags.map(t => `<span class="tag">${esc(t)}</span>`).join('');

  resultEl.style.display = 'block';
  resultEl.classList.remove('animate-in');
  void resultEl.offsetWidth;
  resultEl.classList.add('animate-in');
}

function acceptDraw() {
  if (!state.currentDraw) return;
  state.tonightPick = state.currentDraw;
  showToast(`"${state.currentDraw.title}" escolhido pra hoje! 🎬`, 'success');
  navigate('home');
}

function clearTonightPick() {
  state.tonightPick = null;
  document.getElementById('tonightCard').style.display = 'none';
}

// ============================================================
// LOCAL STORAGE FALLBACK (no Apps Script)
// ============================================================
function saveLocal() {
  localStorage.setItem('local_watchlist', JSON.stringify(state.watchlist));
  localStorage.setItem('local_watched',   JSON.stringify(state.watched));
}

function loadLocal() {
  try {
    const wl = localStorage.getItem('local_watchlist');
    const wd = localStorage.getItem('local_watched');
    if (wl) state.watchlist = JSON.parse(wl);
    if (wd) state.watched   = JSON.parse(wd);
  } catch { /* ignore */ }
}

// ============================================================
// LOAD DATA from Apps Script
// ============================================================
async function loadData() {
  if (!cfg.scriptUrl) {
    loadLocal();
    renderHome();
    renderWatchlist();
    renderWatched();
    return;
  }

  showLoading(true);

  try {
    const [watchlist, watched] = await Promise.all([
      API.getWatchlist(),
      API.getWatched()
    ]);
    state.watchlist = watchlist;
    state.watched   = watched;
  } catch (err) {
    showToast('Erro ao carregar dados. Verifique a URL do Apps Script.', 'error');
    loadLocal();
  } finally {
    showLoading(false);
    populateGenreFilter();
    populateWatchlistGenreFilter();
    renderHome();
    renderWatchlist();
    renderWatched();
  }
}

function showLoading(on) {
  document.getElementById('homeLoading').style.display = on ? 'flex' : 'none';
}

// ============================================================
// UTILITIES
// ============================================================
function starsHTML(score) {
  // score 0-5, exibido como 5 estrelas
  const s = parseFloat(score) || 0;
  let html = '';
  for (let i = 1; i <= 5; i++) {
    if (s >= i)          html += '<span style="color:var(--gold)">★</span>';
    else if (s >= i-0.5) html += '<span style="color:var(--gold-dim);filter:brightness(1.5)">★</span>';
    else                 html += '<span style="color:var(--border2)">★</span>';
  }
  return html;
}

function setPoster(imgId, phId, src) {
  const img = document.getElementById(imgId);
  const ph  = document.getElementById(phId);
  if (src) {
    img.src = src;
    img.style.display = 'block';
    ph.style.display  = 'none';
    img.onerror = () => {
      img.style.display = 'none';
      ph.style.display  = 'flex';
    };
  } else {
    img.style.display = 'none';
    ph.style.display  = 'flex';
  }
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ============================================================
// INIT
// ============================================================
function init() {
  updateRating('my',  3.5);
  updateRating('her', 3.5);

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-home').classList.add('active');

  loadData();
}

document.addEventListener('DOMContentLoaded', init);
