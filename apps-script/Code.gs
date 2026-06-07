/**
 * MoBibi — Google Apps Script
 *
 * ─── SETUP (faça isso uma vez) ───────────────────────────────
 * 1. Abra sua planilha → Extensões → Apps Script
 * 2. Cole este código completo (substituindo o anterior)
 * 3. Salve (Ctrl+S)
 * 4. ANTES de implantar: rode a função migrarDados()
 *      Menu → Run (▶) → selecione "migrarDados" → Execute
 *      Aguarde a mensagem de conclusão (pode levar 1-2 minutos)
 * 5. Depois implante: Implantar → Nova implantação
 *      Tipo: Aplicativo da web
 *      Executar como: Eu
 *      Quem tem acesso: Qualquer pessoa
 * 6. Copie a URL e cole nas Configurações do site
 */

// ── Nomes das abas ───────────────────────────────────────────
const WATCHED_SHEET   = 'Filmes 2026';
const WATCHLIST_SHEET = 'Lista de filmes para assistir';

// ── Índices das colunas (após a migração) ────────────────────
// Filmes 2026:  A=Filmes B=Gênero C=Duração D=Data E=Nota(original) F=Nota Bia G=Nota Gil H=Poster
// Lista:        A=Filmes B=Gênero C=Duração D=Adicionado em E=Poster

// ════════════════════════════════════════════════════════════
// PONTO DE ENTRADA — GET (leituras)
// ════════════════════════════════════════════════════════════
function doGet(e) {
  const action = e.parameter.action;
  let result;
  try {
    if      (action === 'getWatched')   result = getWatchedMovies();
    else if (action === 'getWatchlist') result = getWatchlist();
    else                                result = { error: 'Ação desconhecida: ' + action };
  } catch (err) {
    result = { error: err.toString() };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ════════════════════════════════════════════════════════════
// PONTO DE ENTRADA — POST (escrita)
// ════════════════════════════════════════════════════════════
function doPost(e) {
  let data, result;
  try {
    data = JSON.parse(e.postData.contents);
    const action = data.action;
    if      (action === 'addToWatchlist')      result = addToWatchlist(data);
    else if (action === 'markAsWatched')       result = markAsWatched(data);
    else if (action === 'removeFromWatchlist') result = removeFromWatchlist(data);
    else if (action === 'updateWatched')       result = updateWatched(data);
    else if (action === 'removeFromWatched')   result = removeFromWatched(data);
    else                                       result = { error: 'Ação desconhecida: ' + action };
  } catch (err) {
    result = { error: err.toString() };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ════════════════════════════════════════════════════════════
// LEITURA: filmes assistidos
// ════════════════════════════════════════════════════════════
function getWatchedMovies() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WATCHED_SHEET);
  if (!sheet) return { movies: [] };
  const range   = sheet.getDataRange();
  const rows    = range.getValues();
  const display = range.getDisplayValues(); // texto exato da célula (evita bug de fuso com Date)

  const movies = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    movies.push({
      title:       String(r[0] || '').trim(),
      genre:       String(r[1] || '').trim(),
      duration:    display[i][2] || '',
      date:        formatDate(r[3]),
      herScore:    _toScoreStr(r[5]),
      myScore:     _toScoreStr(r[6]),
      poster:      String(r[7] || '').trim(),
      releaseDate: _formatReleaseDate(r[8]),  // col I
    });
  }
  movies.reverse();
  return { movies };
}

// Converte valor de célula de nota para string numérica.
// Sheets às vezes interpreta scores como datas (célula formatada como Date).
// Tenta recuperar o serial (= score real) se estiver no intervalo 0–10.
function _toScoreStr(val) {
  if (val === '' || val == null) return '';
  if (val instanceof Date) {
    // Serial Excel: dias desde 30/12/1899 (UTC)
    var epoch  = Date.UTC(1899, 11, 30);
    var serial = (val.getTime() - epoch) / 86400000;
    if (serial >= 0 && serial <= 10.5) {
      return String(Math.round(serial * 10) / 10);
    }
    return '';  // data real na coluna de score — dado inválido
  }
  var n = parseFloat(String(val).replace(',', '.'));
  return (!isNaN(n) && n >= 0 && n <= 10) ? String(n) : '';
}

// ════════════════════════════════════════════════════════════
// LEITURA: lista pra ver
// ════════════════════════════════════════════════════════════
function getWatchlist() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WATCHLIST_SHEET);
  if (!sheet) return { movies: [] };
  const range   = sheet.getDataRange();
  const rows    = range.getValues();
  const display = range.getDisplayValues();

  const movies = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    movies.push({
      title:      String(r[0] || '').trim(),
      genre:      String(r[1] || '').trim(),
      duration:   display[i][2] || '',
      addedAt:    formatDate(r[3]),
      poster:     String(r[4] || '').trim(),
      releaseDate: _formatReleaseDate(r[5]),  // col F — YYYY-MM-DD
      streaming:  String(r[6] || '').trim(),  // col G — JSON
    });
  }
  return { movies };
}

// ════════════════════════════════════════════════════════════
// ESCRITA: adicionar à lista
// ════════════════════════════════════════════════════════════
function addToWatchlist(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WATCHLIST_SHEET);
  sheet.appendRow([
    data.title    || '',
    data.genre    || '',
    data.duration || '',
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy'),
    data.poster      || '',
    data.releaseDate || '',  // col F — YYYY-MM-DD
    data.streaming   || '',  // col G — JSON providers
  ]);
  return { success: true };
}

// ════════════════════════════════════════════════════════════
// UTILITÁRIO: preenche data de lançamento nos filmes assistidos
// Rode: Run → preencherLancamentoAssistidos
// ════════════════════════════════════════════════════════════
function preencherLancamentoAssistidos() {
  const TMDB_KEY = 'ea483053614c87cac1dcd2a3a78cd22d';
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(WATCHED_SHEET);
  if (!sheet) { Browser.msgBox('Aba não encontrada.'); return; }

  // Garante cabeçalho na col I
  const header = sheet.getRange(1, 9).getValue();
  if (!header) sheet.getRange(1, 9).setValue('Lançamento').setFontWeight('bold').setBackground('#ffe599');

  const rows = sheet.getDataRange().getValues();
  let count = 0, erros = [];

  for (let i = 1; i < rows.length; i++) {
    const title = String(rows[i][0] || '').trim();
    const val   = String(rows[i][8] || '').trim(); // col I
    if (!title || val) continue;

    Utilities.sleep(300);
    try {
      const url  = 'https://api.themoviedb.org/3/search/movie?api_key=' + TMDB_KEY +
                   '&query=' + encodeURIComponent(title) + '&language=pt-BR';
      const data = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
      if (data.results && data.results.length && data.results[0].release_date) {
        sheet.getRange(i + 1, 9).setValue(data.results[0].release_date);
        count++;
      } else {
        erros.push(title);
      }
    } catch(e) { erros.push(title); }
  }

  SpreadsheetApp.flush();
  let msg = '✅ Datas preenchidas: ' + count;
  if (erros.length) msg += '\n\n⚠️ Não encontrados:\n' + erros.join('\n');
  Browser.msgBox(msg);
}

// ════════════════════════════════════════════════════════════
// UTILITÁRIO: preenche data completa de lançamento (YYYY-MM-DD)
// Rode: Run → preencherDatasLancamento
// ════════════════════════════════════════════════════════════
// UTILITÁRIO: preenche streaming na lista pra ver (col G)
// Rode uma vez: Run → preencherStreamingLista
// ════════════════════════════════════════════════════════════
function preencherStreamingLista() {
  const TMDB_KEY = 'ea483053614c87cac1dcd2a3a78cd22d';
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(WATCHLIST_SHEET);
  const rows  = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    const title = String(rows[i][0] || '').trim();
    if (!title) continue;
    if (rows[i][6]) continue; // já tem streaming

    try {
      // Busca ID no TMDB
      const searchUrl = 'https://api.themoviedb.org/3/search/movie?api_key=' + TMDB_KEY
        + '&query=' + encodeURIComponent(title) + '&language=pt-BR';
      const searchData = JSON.parse(UrlFetchApp.fetch(searchUrl).getContentText());
      const results = searchData.results || [];
      if (!results.length) { Logger.log('✗ Não encontrado: ' + title); continue; }

      const movieId = results[0].id;

      // Busca providers do Brasil
      const provUrl = 'https://api.themoviedb.org/3/movie/' + movieId + '/watch/providers?api_key=' + TMDB_KEY;
      const provData = JSON.parse(UrlFetchApp.fetch(provUrl).getContentText());
      const br = (provData.results || {}).BR;

      if (!br) { Logger.log('✗ Sem provider BR: ' + title); continue; }

      const streaming = JSON.stringify({
        s: (br.flatrate || []).slice(0, 6).map(function(p) { return { n: p.provider_name, l: p.logo_path }; }),
        r: (br.rent     || []).slice(0, 6).map(function(p) { return { n: p.provider_name, l: p.logo_path }; }),
      });

      sheet.getRange(i + 1, 7).setValue(streaming);
      Logger.log('✓ ' + title + ': ' + streaming);
    } catch(e) {
      Logger.log('✗ Erro em ' + title + ': ' + e.toString());
    }

    Utilities.sleep(400);
  }
  Logger.log('Streaming preenchido!');
}

// Sobrescreve valores que só têm o ano (4 dígitos)
// ════════════════════════════════════════════════════════════
function preencherDatasLancamento() {
  const TMDB_KEY = 'ea483053614c87cac1dcd2a3a78cd22d';
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(WATCHLIST_SHEET);
  if (!sheet) { Browser.msgBox('Aba não encontrada.'); return; }

  sheet.getRange(1, 6).setValue('Lançamento').setFontWeight('bold').setBackground('#cfe2f3');

  const rows = sheet.getDataRange().getValues();
  let count = 0, erros = [];

  for (let i = 1; i < rows.length; i++) {
    const title = String(rows[i][0] || '').trim();
    const val   = String(rows[i][5] || '').trim(); // col F
    if (!title) continue;
    // Pula se já tem data completa (formato YYYY-MM-DD, length > 4)
    if (val.length > 4) continue;

    Utilities.sleep(300);
    try {
      const url  = 'https://api.themoviedb.org/3/search/movie?api_key=' + TMDB_KEY +
                   '&query=' + encodeURIComponent(title) + '&language=pt-BR';
      const data = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
      if (data.results && data.results.length && data.results[0].release_date) {
        sheet.getRange(i + 1, 6).setValue(data.results[0].release_date); // YYYY-MM-DD
        count++;
      } else {
        erros.push(title);
      }
    } catch(e) { erros.push(title); }
  }

  SpreadsheetApp.flush();
  let msg = '✅ Datas preenchidas: ' + count;
  if (erros.length) msg += '\n\n⚠️ Não encontrados:\n' + erros.join('\n');
  Browser.msgBox(msg);
}

// ════════════════════════════════════════════════════════════
// ESCRITA: marcar como assistido
// ════════════════════════════════════════════════════════════
function markAsWatched(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WATCHED_SHEET);
  // Colunas: A=Filmes B=Gênero C=Duração D=Data E="" F=Nota Bia G=Nota Gil H=Poster I=Lançamento
  sheet.appendRow([
    data.title       || '',
    data.genre       || '',
    data.duration    || '',
    data.date        || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy'),
    '',
    data.herScore !== undefined && data.herScore !== '' ? parseFloat(data.herScore) : '',
    data.myScore  !== undefined && data.myScore  !== '' ? parseFloat(data.myScore)  : '',
    data.poster      || '',
    data.releaseDate || '',  // col I
  ]);
  // Força formato numérico nas células de nota para evitar auto-interpretação como data
  const lr = sheet.getLastRow();
  sheet.getRange(lr, 6, 1, 2).setNumberFormat('0.##');
  removeFromWatchlist({ title: data.title });
  return { success: true };
}

// ════════════════════════════════════════════════════════════
// ESCRITA: editar filme assistido (data e notas)
// ════════════════════════════════════════════════════════════
function updateWatched(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WATCHED_SHEET);
  if (!sheet) return { error: 'Aba não encontrada' };
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === String(data.title).trim().toLowerCase()) {
      if (data.date)                   sheet.getRange(i + 1, 4).setValue(data.date);
      if (data.herScore !== undefined) sheet.getRange(i + 1, 6).setValue(parseFloat(data.herScore));
      if (data.myScore  !== undefined) sheet.getRange(i + 1, 7).setValue(parseFloat(data.myScore));
      return { success: true };
    }
  }
  return { error: 'Filme não encontrado' };
}

// ════════════════════════════════════════════════════════════
// ESCRITA: remover filme assistido
// ════════════════════════════════════════════════════════════
function removeFromWatched(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WATCHED_SHEET);
  if (!sheet) return { success: true };
  const rows = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0]).trim().toLowerCase() === String(data.title).trim().toLowerCase()) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: true };
}

// ════════════════════════════════════════════════════════════
// ESCRITA: remover da lista
// ════════════════════════════════════════════════════════════
function removeFromWatchlist(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WATCHLIST_SHEET);
  if (!sheet) return { success: true };
  const rows = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0]).trim().toLowerCase() === String(data.title).trim().toLowerCase()) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return { success: true };
}

// ════════════════════════════════════════════════════════════
// MIGRAÇÃO — rode UMA VEZ antes de implantar
// ════════════════════════════════════════════════════════════
/**
 * Rode novamente para corrigir os dados.
 * Apaga os valores antigos de Nota Bia/Gil e refaz tudo do zero.
 */
function migrarDados() {
  const TMDB_KEY = 'ea483053614c87cac1dcd2a3a78cd22d';

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  _setupWatchlistSheet(ss);

  const sheet = ss.getSheetByName(WATCHED_SHEET);
  if (!sheet) {
    Browser.msgBox('Aba "' + WATCHED_SHEET + '" não encontrada.');
    return;
  }

  const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const totalCols = headerRow.length;

  // ── Localiza ou cria as colunas novas ───────────────────
  let colBia    = headerRow.indexOf('Nota Bia') + 1;
  let colGil    = headerRow.indexOf('Nota Gil') + 1;
  let colPoster = headerRow.indexOf('Poster')   + 1;

  if (colBia === 0) {
    colBia = totalCols + 1;
    sheet.getRange(1, colBia).setValue('Nota Bia').setFontWeight('bold').setBackground('#b6d7a8');
  }
  if (colGil === 0) {
    colGil = colBia + 1;
    sheet.getRange(1, colGil).setValue('Nota Gil').setFontWeight('bold').setBackground('#a2c4c9');
  }
  if (colPoster === 0) {
    colPoster = colGil + 1;
    sheet.getRange(1, colPoster).setValue('Poster').setFontWeight('bold').setBackground('#ffe599');
  }

  const lastRow = sheet.getLastRow();

  // ── Limpa valores antigos e força formato numérico ──────
  if (lastRow > 1) {
    const biaClear  = sheet.getRange(2, colBia,    lastRow - 1, 1);
    const gilClear  = sheet.getRange(2, colGil,    lastRow - 1, 1);
    biaClear.clearContent().setNumberFormat('0.#');
    gilClear.clearContent().setNumberFormat('0.#');
  }

  // ── Processa cada filme ──────────────────────────────────
  const data     = sheet.getDataRange().getValues();
  const COL_DUR  = 2; // C (0-indexed)
  const COL_NOTA = 4; // E (0-indexed)

  let countNota = 0, countDur = 0, countPoster = 0;

  for (let i = 1; i < data.length; i++) {
    const row      = data[i];
    const title    = String(row[0] || '').trim();
    const duration = String(row[COL_DUR] || '').trim();
    const notaStr  = String(row[COL_NOTA] || '').trim();

    if (!title) continue;

    // ── Converter notas ──────────────────────────────────
    const { bia, gil } = _parseNota(notaStr);
    if (bia !== null) {
      sheet.getRange(i + 1, colBia).setValue(bia).setNumberFormat('0.#');
      countNota++;
    }
    if (gil !== null) {
      sheet.getRange(i + 1, colGil).setValue(gil).setNumberFormat('0.#');
      countNota++;
    }

    // ── TMDB: duração + poster ────────────────────────────
    const precisaDur    = duration.toLowerCase() === 'assistido' || duration === '';
    const jaTemPoster   = String(row[colPoster - 1] || '').trim() !== '';

    if (precisaDur || !jaTemPoster) {
      Utilities.sleep(300);
      const tmdb = _fetchTMDB(title, TMDB_KEY);
      if (tmdb) {
        if (precisaDur && tmdb.runtime) {
          sheet.getRange(i + 1, COL_DUR + 1).setValue(_minToDuration(tmdb.runtime));
          countDur++;
        }
        if (!jaTemPoster && tmdb.poster) {
          sheet.getRange(i + 1, colPoster).setValue(tmdb.poster);
          countPoster++;
        }
      }
    }
  }

  SpreadsheetApp.flush();
  Browser.msgBox(
    '✅ Migração concluída!\n\n' +
    '• Notas convertidas: ' + countNota + '\n' +
    '• Durações corrigidas: ' + countDur + '\n' +
    '• Pôsteres adicionados: ' + countPoster
  );
}

// ── Helpers internos ─────────────────────────────────────────

function _setupWatchlistSheet(ss) {
  let sheet = ss.getSheetByName(WATCHLIST_SHEET);
  if (!sheet) sheet = ss.insertSheet(WATCHLIST_SHEET);

  // Só adiciona cabeçalhos se a aba estiver vazia
  if (sheet.getLastRow() === 0) {
    const headers = ['Filmes', 'Gênero', 'Duração', 'Adicionado em', 'Poster'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
         .setFontWeight('bold')
         .setBackground('#cfe2f3');
    sheet.setFrozenRows(1);
  }
}

function _fetchTMDB(title, apiKey) {
  try {
    const searchUrl = 'https://api.themoviedb.org/3/search/movie?api_key=' + apiKey +
                      '&query=' + encodeURIComponent(title) + '&language=pt-BR';
    const searchRes  = UrlFetchApp.fetch(searchUrl, { muteHttpExceptions: true });
    const searchData = JSON.parse(searchRes.getContentText());

    if (!searchData.results || !searchData.results.length) return null;

    const best   = searchData.results[0];
    const poster = best.poster_path
      ? 'https://image.tmdb.org/t/p/w500' + best.poster_path
      : null;

    // Buscar runtime via detalhe
    let runtime = null;
    try {
      const detailUrl  = 'https://api.themoviedb.org/3/movie/' + best.id + '?api_key=' + apiKey;
      const detailRes  = UrlFetchApp.fetch(detailUrl, { muteHttpExceptions: true });
      const detailData = JSON.parse(detailRes.getContentText());
      runtime = detailData.runtime || null;
      Utilities.sleep(150);
    } catch(e) { /* ignora */ }

    return { poster, runtime };
  } catch(e) {
    Logger.log('TMDB erro para "' + title + '": ' + e);
    return null;
  }
}

/**
 * Converte a string de notas em estrelas para números (escala 0-10).
 * Usa indexOf em vez de regex para localizar "Bia:" e "Gil:/Betinho:/Motas:"
 * evitando problemas com o variation selector (U+FE0F) das estrelas emoji.
 */
function _parseNota(str) {
  if (!str) return { bia: null, gil: null };
  const lower = str.toLowerCase();

  // Posição de "Bia:"
  const biaIdx = lower.indexOf('bia:');

  // Posição do primeiro alias de Gil seguido de ":"
  const gilAliases = ['gil', 'betinho', 'motas'];
  let gilIdx = -1, gilLabelLen = 0;
  for (const alias of gilAliases) {
    const idx = lower.indexOf(alias + ':');
    if (idx !== -1) { gilIdx = idx; gilLabelLen = alias.length + 1; break; }
  }

  // Extrai segmentos por substring (mais robusto que regex com emoji)
  let biaSegment = null, gilSegment = null;

  if (biaIdx !== -1) {
    const start = biaIdx + 4; // tamanho de "bia:"
    const end   = (gilIdx !== -1 && gilIdx > biaIdx) ? gilIdx : str.length;
    biaSegment  = str.substring(start, end);
  }

  if (gilIdx !== -1) {
    gilSegment = str.substring(gilIdx + gilLabelLen);
  }

  return {
    bia: _contarEstrelas(biaSegment),
    gil: _contarEstrelas(gilSegment),
  };
}

/**
 * Conta estrelas pelo código de caractere U+2B50 (⭐).
 * Usa charCodeAt para não depender de regex com emoji —
 * o variation selector U+FE0F (fe0f) é ignorado na contagem.
 */
function _contarEstrelas(segmento) {
  if (!segmento) return null;
  const s = segmento.trim();

  let count = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code === 0x2B50) count++;        // ⭐ (com ou sem variation selector)
    if (code === 0x2605) count++;        // ★ BLACK STAR
    if (code === 0xD83C &&               // 🌟 surrogate pair
        s.charCodeAt(i + 1) === 0xDF1F) { count++; i++; }
  }

  const temMeia = /,\s*5/.test(s);
  const soMeia  = count === 0 && /^0\s*,\s*5/.test(s);

  if (count === 0 && !temMeia) return null;

  let score = count * 2 + (temMeia ? 1 : 0);
  if (soMeia) score = 1;
  return score;
}

// ════════════════════════════════════════════════════════════
// UTILITÁRIO: preenche pôsteres da lista pra ver
// Rode manualmente pelo menu Run → preencherPostersLista
// ════════════════════════════════════════════════════════════
function preencherPostersLista() {
  const TMDB_KEY = 'ea483053614c87cac1dcd2a3a78cd22d';
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(WATCHLIST_SHEET);
  if (!sheet) { Browser.msgBox('Aba "' + WATCHLIST_SHEET + '" não encontrada.'); return; }

  const rows = sheet.getDataRange().getValues();
  let count = 0;

  for (let i = 1; i < rows.length; i++) {
    const title  = String(rows[i][0] || '').trim();
    const poster = String(rows[i][4] || '').trim(); // col E
    if (!title || poster) continue; // pula se sem título ou já tem pôster

    Utilities.sleep(350);
    const tmdb = _fetchTMDB(title, TMDB_KEY);
    if (tmdb && tmdb.poster) {
      sheet.getRange(i + 1, 5).setValue(tmdb.poster); // col E
      count++;
      Logger.log('✅ ' + title + ' → ' + tmdb.poster);
    } else {
      Logger.log('⚠️  não encontrado: ' + title);
    }
  }

  SpreadsheetApp.flush();
  Browser.msgBox('Pôsteres preenchidos: ' + count + ' de ' + (rows.length - 1) + ' filmes.\nVeja o log para detalhes (Ver → Registros).');
}

// ════════════════════════════════════════════════════════════
// UTILITÁRIO: popular lista pra ver com 92 filmes via TMDB
// Rode UMA VEZ: Run → popularListaFilmes
// ════════════════════════════════════════════════════════════
function popularListaFilmes() {
  const TMDB_KEY = 'ea483053614c87cac1dcd2a3a78cd22d';
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(WATCHLIST_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(WATCHLIST_SHEET);
    sheet.appendRow(['Filmes', 'Gênero', 'Duração', 'Adicionado em', 'Poster']);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#cfe2f3');
    sheet.setFrozenRows(1);
  }

  // titulo: nome na planilha | search: query pro TMDB (usa titulo se omitido)
  const filmes = [
    { titulo: 'Preciosa',                                    search: 'Precious 2009' },
    { titulo: 'Django Livre',                                search: 'Django Unchained' },
    { titulo: 'Bastardos Inglórios',                         search: 'Inglourious Basterds' },
    { titulo: 'Aftersun' },
    { titulo: 'Intocáveis',                                  search: 'Intouchables 2011' },
    { titulo: 'CDD' },
    { titulo: 'Oldboy',                                      search: 'Oldboy 2003' },
    { titulo: 'Her',                                         search: 'Her 2013 Spike Jonze' },
    { titulo: 'Brilho Eterno de uma Mente sem Lembranças',   search: 'Eternal Sunshine of the Spotless Mind' },
    { titulo: 'Evan Almighty (Noé)',                         search: 'Evan Almighty' },
    { titulo: 'O Virgem de 40 Anos',                         search: 'The 40-Year-Old Virgin' },
    { titulo: 'A Rede Social',                               search: 'The Social Network' },
    { titulo: 'Mad Max: Estrada da Fúria',                   search: 'Mad Max Fury Road' },
    { titulo: 'Zona de Interesse',                           search: 'The Zone of Interest' },
    { titulo: 'Voz do Silêncio',                             search: 'Sound of Metal 2019' },
    { titulo: 'Boyhood' },
    { titulo: 'Os Infiltrados',                              search: 'The Departed' },
    { titulo: 'WALL·E',                                      search: 'WALL-E' },
    { titulo: 'O Fabuloso Destino de Amélie Poulain',        search: 'Amélie 2001' },
    { titulo: 'O Homem que Mudou o Jogo',                    search: 'Moneyball' },
    { titulo: 'Roma',                                        search: 'Roma 2018' },
    { titulo: '12 Anos de Escravidão',                       search: '12 Years a Slave' },
    { titulo: 'A Entrevista',                                search: 'The Interview 2014' },
    { titulo: 'O Labirinto do Fauno',                        search: "Pan's Labyrinth" },
    { titulo: 'Amnésia',                                     search: 'Memento 2000' },
    { titulo: 'Tár',                                         search: 'Tár 2022' },
    { titulo: 'Sob a Pele',                                  search: 'Under the Skin 2013' },
    { titulo: 'A Árvore da Vida',                            search: 'The Tree of Life 2011' },
    { titulo: 'Vidas Passadas',                              search: 'Past Lives 2023' },
    { titulo: 'Senhor dos Anéis',                            search: 'The Lord of the Rings The Fellowship of the Ring' },
    { titulo: 'A Pior Pessoa do Mundo',                      search: 'The Worst Person in the World' },
    { titulo: 'Pulp Fiction' },
    { titulo: 'Como Perder um Homem em 10 Dias',             search: 'How to Lose a Guy in 10 Days' },
    { titulo: 'Sex Drive: Rumo ao Sexo',                     search: 'Sex Drive 2008' },
    { titulo: 'Sr. e Sra. Smith',                            search: 'Mr Mrs Smith 2005' },
    { titulo: 'O Grande Gatsby',                             search: 'The Great Gatsby 2013' },
    { titulo: 'Uma Mente Brilhante',                         search: 'A Beautiful Mind' },
    { titulo: 'Eu, Robô',                                    search: 'I Robot 2004' },
    { titulo: 'Valor Sentimental',                           search: 'Sentimental Value 2025' },
    { titulo: 'Se eu Tivesse Pernas te Chutaria',            search: 'If I Had Legs I Would Kick You' },
    { titulo: 'Prenda-me se for Capaz',                      search: 'Catch Me If You Can' },
    { titulo: 'Forrest Gump' },
    { titulo: 'Nova Onda do Imperador',                      search: "The Emperor's New Groove" },
    { titulo: 'Entre Irmãos',                                search: 'Brothers 2009' },
    { titulo: 'Garra de Ferro',                              search: 'The Iron Claw 2023' },
    { titulo: 'O Contador',                                  search: 'The Accountant 2016' },
    { titulo: 'Rango' },
    { titulo: 'Um Senhor Estagiário',                        search: 'The Intern 2015' },
    { titulo: 'Green Book' },
    { titulo: 'Grinch',                                      search: 'How the Grinch Stole Christmas 2000' },
    { titulo: 'O Sobrevivente',                              search: 'Lone Survivor 2013' },
    { titulo: 'Hobbit',                                      search: 'The Hobbit An Unexpected Journey' },
    { titulo: 'Harry Potter',                                search: 'Harry Potter and the Sorcerers Stone' },
    { titulo: 'Ponte para Terabítia',                        search: 'Bridge to Terabithia' },
    { titulo: 'Hamnet',                                      search: 'Hamnet 2025' },
    { titulo: 'Frankenstein' },
    { titulo: 'Marty Supreme' },
    { titulo: 'O Quarto ao Lado',                            search: 'The Room Next Door 2024' },
    { titulo: 'Creed' },
    { titulo: 'Flow',                                        search: 'Flow 2024 animated' },
    { titulo: '8 Mile' },
    { titulo: 'Matrix Reloaded',                             search: 'The Matrix Reloaded' },
    { titulo: 'O Albergue',                                  search: 'Hostel 2005' },
    { titulo: 'Animais Perigosos',                           search: 'Dangerous Animals 2021' },
    { titulo: 'Gênio Indomável',                             search: 'Good Will Hunting' },
    { titulo: 'X-Men',                                       search: 'X-Men 2000' },
    { titulo: 'Desventuras em Série',                        search: 'A Series of Unfortunate Events 2004' },
    { titulo: 'A Teoria de Tudo',                            search: 'The Theory of Everything 2014' },
    { titulo: 'Naquele Fim de Semana',                       search: 'The One I Love 2014' },
    { titulo: 'Além da Morte',                               search: 'Hereafter 2010' },
    { titulo: 'Idas e Vindas do Amor',                       search: 'Love Actually' },
    { titulo: 'Quero Ser Grande',                            search: 'Big 1988' },
    { titulo: 'Contra o Tempo',                              search: 'Source Code 2011' },
    { titulo: 'O Grito',                                     search: 'The Grudge 2004' },
    { titulo: 'A Chave Mestra',                              search: 'The Skeleton Key' },
    { titulo: 'Os Outros',                                   search: 'The Others 2001' },
    { titulo: 'A 5ª Vítima',                                 search: 'Copycat 1995' },
    { titulo: 'Viral',                                       search: 'Viral 2016' },
    { titulo: 'Clown',                                       search: 'Clown 2014' },
    { titulo: 'Adoráveis Mulheres',                          search: 'Little Women 2019' },
    { titulo: 'Caminhos da Memória',                         search: 'Still Alice' },
    { titulo: 'Um Laço de Amor',                             search: 'The Notebook 2004' },
    { titulo: 'Não Olhe para Cima',                          search: "Don't Look Up 2021" },
    { titulo: 'Pinóquio (Del Toro)',                         search: "Guillermo del Toro Pinocchio" },
    { titulo: 'Foi Apenas um Sonho',                         search: 'Revolutionary Road' },
    { titulo: 'Dias Perfeitos',                              search: 'Perfect Days 2023' },
    { titulo: 'O Diário de Bridget Jones',                   search: "Bridget Jones Diary" },
    { titulo: 'Rain Man' },
    { titulo: 'Perfume de Mulher',                           search: 'Scent of a Woman 1992' },
    { titulo: '50/50',                                       search: '50 50 2011' },
    { titulo: 'Scott Pilgrim',                               search: 'Scott Pilgrim vs the World' },
    { titulo: 'Bugonia',                                     search: 'Bugonia 2025' },
  ];

  const hoje = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');
  let adicionados = 0;
  const erros = [];

  for (const filme of filmes) {
    const query = filme.search || filme.titulo;
    Utilities.sleep(300);
    try {
      const searchUrl  = 'https://api.themoviedb.org/3/search/movie?api_key=' + TMDB_KEY +
                         '&query=' + encodeURIComponent(query) + '&language=pt-BR';
      const searchData = JSON.parse(UrlFetchApp.fetch(searchUrl, { muteHttpExceptions: true }).getContentText());

      if (!searchData.results || !searchData.results.length) {
        erros.push(filme.titulo);
        sheet.appendRow([filme.titulo, '', '', hoje, '']);
        Logger.log('⚠️ não encontrado: ' + filme.titulo);
        continue;
      }

      const best   = searchData.results[0];
      const poster = best.poster_path ? 'https://image.tmdb.org/t/p/w500' + best.poster_path : '';

      let duracao = '', genero = '';
      try {
        Utilities.sleep(200);
        const det = JSON.parse(UrlFetchApp.fetch(
          'https://api.themoviedb.org/3/movie/' + best.id + '?api_key=' + TMDB_KEY + '&language=pt-BR',
          { muteHttpExceptions: true }
        ).getContentText());
        if (det.runtime) {
          const h = Math.floor(det.runtime / 60);
          const m = det.runtime % 60;
          duracao = ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2) + ':00';
        }
        if (det.genres && det.genres.length) genero = det.genres.map(g => g.name).join(', ');
      } catch(e) { /* ignora */ }

      sheet.appendRow([filme.titulo, genero, duracao, hoje, poster]);
      adicionados++;
      Logger.log('✅ ' + filme.titulo);

    } catch(err) {
      erros.push(filme.titulo + ' (erro)');
      sheet.appendRow([filme.titulo, '', '', hoje, '']);
    }
  }

  SpreadsheetApp.flush();
  let msg = '✅ ' + adicionados + ' de ' + filmes.length + ' filmes adicionados!';
  if (erros.length) msg += '\n\n⚠️ Não encontrados no TMDB:\n' + erros.join('\n');
  Browser.msgBox(msg);
}

// ════════════════════════════════════════════════════════════
// UTILITÁRIO: corrige os 39 filmes que ficaram sem dados
// Rode: Run → corrigirFilmesLista
// ════════════════════════════════════════════════════════════
function corrigirFilmesLista() {
  const TMDB_KEY = 'ea483053614c87cac1dcd2a3a78cd22d';
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(WATCHLIST_SHEET);
  if (!sheet) { Browser.msgBox('Aba não encontrada.'); return; }

  // query = termo de busca | year = filtro separado (mais preciso no TMDB)
  const correcoes = [
    { titulo: 'Preciosa',                          query: 'Precious',                       year: 2009 },
    { titulo: 'Intocáveis',                         query: 'Intouchables',                   year: 2011 },
    { titulo: 'Oldboy',                             query: 'Oldboy',                         year: 2003 },
    { titulo: 'Her',                                query: 'Her',                            year: 2013 },
    { titulo: 'Voz do Silêncio',                    query: 'Sound of Metal',                 year: 2019 },
    { titulo: 'A Entrevista',                       query: 'The Interview',                  year: 2014 },
    { titulo: 'Tár',                                query: 'Tar',                            year: 2022 },
    { titulo: 'Sob a Pele',                         query: 'Under the Skin',                 year: 2013 },
    { titulo: 'A Árvore da Vida',                   query: 'The Tree of Life',               year: 2011 },
    { titulo: 'Vidas Passadas',                     query: 'Past Lives',                     year: 2023 },
    { titulo: 'Sex Drive: Rumo ao Sexo',            query: 'Sex Drive',                      year: 2008 },
    { titulo: 'Sr. e Sra. Smith',                   query: 'Mr. & Mrs. Smith',               year: 2005 },
    { titulo: 'Eu, Robô',                           query: 'I Robot',                        year: 2004 },
    { titulo: 'Valor Sentimental',                  query: 'Sentimental Value',              year: 2025 },
    { titulo: 'Se eu Tivesse Pernas te Chutaria',   query: 'If I Had Legs I Would Kick You', year: 2025 },
    { titulo: 'Garra de Ferro',                     query: 'The Iron Claw',                  year: 2023 },
    { titulo: 'O Contador',                         query: 'The Accountant',                 year: 2016 },
    { titulo: 'Um Senhor Estagiário',               query: 'The Intern',                     year: 2015 },
    { titulo: 'Grinch',                             query: 'How the Grinch Stole Christmas', year: 2000 },
    { titulo: 'Hamnet',                             query: 'Hamnet',                         year: 2025 },
    { titulo: 'O Quarto ao Lado',                   query: 'The Room Next Door',             year: 2024 },
    { titulo: 'Flow',                               query: 'Flow',                           year: 2024 },
    { titulo: 'O Albergue',                         query: 'Hostel',                         year: 2005 },
    { titulo: 'Animais Perigosos',                  query: 'Dangerous Animals',              year: 2021 },
    { titulo: 'X-Men',                              query: 'X-Men',                          year: 2000 },
    { titulo: 'Desventuras em Série',               query: 'Lemony Snicket Unfortunate Events', year: 2004 },
    { titulo: 'A Teoria de Tudo',                   query: 'The Theory of Everything',       year: 2014 },
    { titulo: 'Naquele Fim de Semana',              query: 'The One I Love',                 year: 2014 },
    { titulo: 'Além da Morte',                      query: 'Hereafter',                      year: 2010 },
    { titulo: 'O Grito',                            query: 'The Grudge',                     year: 2004 },
    { titulo: 'Os Outros',                          query: 'The Others',                     year: 2001 },
    { titulo: 'A 5ª Vítima',                        query: 'Copycat',                        year: 1995 },
    { titulo: 'Viral',                              query: 'Viral',                          year: 2016 },
    { titulo: 'Clown',                              query: 'Clown',                          year: 2014 },
    { titulo: 'Adoráveis Mulheres',                 query: 'Little Women',                   year: 2019 },
    { titulo: 'Um Laço de Amor',                    query: 'The Notebook',                   year: 2004 },
    { titulo: 'Não Olhe para Cima',                 query: 'Don\'t Look Up',                 year: 2021 },
    { titulo: 'Dias Perfeitos',                     query: 'Perfect Days',                   year: 2023 },
    { titulo: 'Bugonia',                            query: 'Bugonia',                        year: 2025 },
  ];

  // Monta mapa: título (lowercase) → número da linha na planilha
  const rows = sheet.getDataRange().getValues();
  const linhaMap = {};
  for (let i = 1; i < rows.length; i++) {
    const t = String(rows[i][0] || '').trim().toLowerCase();
    if (t) linhaMap[t] = i + 1; // número da linha (1-based)
  }

  let corrigidos = 0;
  const erros = [];

  for (const filme of correcoes) {
    Utilities.sleep(350);
    try {
      // 1ª tentativa: com ano
      let url = 'https://api.themoviedb.org/3/search/movie?api_key=' + TMDB_KEY +
                '&query=' + encodeURIComponent(filme.query) +
                '&primary_release_year=' + filme.year + '&language=pt-BR';
      let data = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());

      // 2ª tentativa: sem ano (busca mais ampla)
      if (!data.results || !data.results.length) {
        Utilities.sleep(200);
        url = 'https://api.themoviedb.org/3/search/movie?api_key=' + TMDB_KEY +
              '&query=' + encodeURIComponent(filme.query) + '&language=pt-BR';
        data = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
      }

      if (!data.results || !data.results.length) {
        erros.push(filme.titulo);
        Logger.log('⚠️ não encontrado: ' + filme.titulo);
        continue;
      }

      const best   = data.results[0];
      const poster = best.poster_path ? 'https://image.tmdb.org/t/p/w500' + best.poster_path : '';

      let duracao = '', genero = '';
      try {
        Utilities.sleep(200);
        const det = JSON.parse(UrlFetchApp.fetch(
          'https://api.themoviedb.org/3/movie/' + best.id + '?api_key=' + TMDB_KEY + '&language=pt-BR',
          { muteHttpExceptions: true }
        ).getContentText());
        if (det.runtime) {
          const h = Math.floor(det.runtime / 60);
          const m = det.runtime % 60;
          duracao = ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2) + ':00';
        }
        if (det.genres && det.genres.length) genero = det.genres.map(g => g.name).join(', ');
      } catch(e) { /* ignora */ }

      // Atualiza a linha existente ou adiciona nova se não encontrada
      const linha = linhaMap[filme.titulo.toLowerCase()];
      if (linha) {
        sheet.getRange(linha, 2).setValue(genero);
        sheet.getRange(linha, 3).setValue(duracao);
        sheet.getRange(linha, 5).setValue(poster);
      } else {
        const hoje = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');
        sheet.appendRow([filme.titulo, genero, duracao, hoje, poster]);
      }
      corrigidos++;
      Logger.log('✅ ' + filme.titulo);

    } catch(err) {
      erros.push(filme.titulo + ' (erro)');
      Logger.log('❌ ' + filme.titulo + ': ' + err);
    }
  }

  SpreadsheetApp.flush();
  let msg = '✅ ' + corrigidos + ' de ' + correcoes.length + ' filmes corrigidos!';
  if (erros.length) msg += '\n\n⚠️ Ainda sem dados:\n' + erros.join('\n');
  Browser.msgBox(msg);
}

function _minToDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2) + ':00';
}

function formatDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  }
  return String(val).trim();
}

function _formatReleaseDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'UTC', 'yyyy-MM-dd');
  }
  return String(val).trim();
}

function formatDuration(val) {
  if (val === '' || val === null || val === undefined) return '';
  // Apps Script retorna Date para células com formato de tempo
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'HH:mm') + ':00';
  }
  // Sheets às vezes retorna número (fração do dia)
  if (typeof val === 'number') {
    const totalMin = Math.round(val * 24 * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2) + ':00';
  }
  return String(val).trim();
}

function debugDuration() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WATCHED_SHEET);
  const rows  = sheet.getDataRange().getValues();
  const r     = rows[1]; // segunda linha (primeiro filme)
  const val   = r[2];
  Logger.log('tipo: ' + typeof val + ' | instanceof Date: ' + (val instanceof Date) + ' | valor: ' + val + ' | formatado: ' + formatDuration(val));
}
