const CONFIG = Object.freeze({
  SPREADSHEET_ID_PROPERTY: 'SPREADSHEET_ID',
  INITIAL_BALANCE_PROPERTY: 'SALDO_INICIAL',
  LOG_SHEET: 'LOG',
  BALANCE_SHEET: 'SALDOS',
  DEFAULT_STATUS: 'Pendente',
  CANCELED_STATUS: 'Cancelado',
  HEADERS: ['ID','Criado em','OS','Placa','Modelo','Chassi','Descrição','Código da peça','Valor das peças','Valor da mão de obra','Total','Status','Observações','Responsável','Atualizado em'],
  BALANCE_HEADERS: ['ID','Data','Aba','Valor','Observação','Responsável'],
  LOG_HEADERS: ['Data','Ação','ID','Aba','Responsável','Dados anteriores','Dados novos']
});

function doGet(e) {
  return handleRequest_(e && e.parameter ? e.parameter : {});
}

function doPost(e) {
  try {
    const payload = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    return handleRequest_(payload);
  } catch (error) {
    return jsonResponse_({ ok:false, error:'Corpo JSON inválido.' });
  }
}

function handleRequest_(payload) {
  try {
    const action = String(payload.action || '').trim();
    if (action === 'health') return jsonResponse_({ ok:true, service:'Saldo Budget API' });
    if (action === 'sheets' || action === 'listSheets') return jsonResponse_({ ok:true, sheets:listSheets_() });
    if (action === 'list') return jsonResponse_(buildDashboardResponse_(payload.sheet));
    if (action === 'saveRecord') {
      saveRecord_(payload);
      return jsonResponse_(buildDashboardResponse_(payload.sheet));
    }
    if (action === 'cancelRecord') {
      cancelRecord_(payload);
      return jsonResponse_(buildDashboardResponse_(payload.sheet));
    }
    if (action === 'deleteRecord' || action === 'hardDeleteRecord') {
      deleteRecord_(payload);
      return jsonResponse_(buildDashboardResponse_(payload.sheet));
    }
    if (action === 'addBalance') {
      addBalance_(payload);
      return jsonResponse_(buildDashboardResponse_(payload.sheet));
    }
    return jsonResponse_({ ok:false, error:'Ação não reconhecida.' });
  } catch (error) {
    console.error(error);
    return jsonResponse_({ ok:false, error:error.message || 'Erro interno.' });
  }
}

function listSheets_() {
  return getSpreadsheet_().getSheets().map(s => s.getName()).filter(name => name !== CONFIG.LOG_SHEET && name !== CONFIG.BALANCE_SHEET);
}

function buildDashboardResponse_(sheetName) {
  const records = listRecords_(sheetName);
  const saldoInicialBase = parseMoney_(PropertiesService.getScriptProperties().getProperty(CONFIG.INITIAL_BALANCE_PROPERTY) || 0);
  const aportes = listBalances_(sheetName);
  const totalAportes = roundCurrency_(aportes.reduce((sum, item) => sum + item.value, 0));
  const saldoInicial = roundCurrency_(saldoInicialBase + totalAportes);
  const ativos = records.filter(r => r.status !== 'cancelado');
  const pendente = roundCurrency_(ativos.filter(r => r.status === 'pendente').reduce((sum, r) => sum + r.total, 0));
  const finalizado = roundCurrency_(ativos.filter(r => r.status === 'ok').reduce((sum, r) => sum + r.total, 0));
  const utilizado = roundCurrency_(pendente + finalizado);
  const disponivel = roundCurrency_(saldoInicial - utilizado);
  const data = { saldoInicialBase, totalAportes, saldoInicial, pendente, finalizado, utilizado, disponivel, records:ativos, aportes };
  return { ok:true, records:ativos, data:data };
}

function listRecords_(sheetName) {
  const sheet = getDataSheet_(sheetName);
  ensureHeaders_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2,1,lastRow-1,CONFIG.HEADERS.length).getValues().map((row,i) => rowToRecord_(row,i+2)).filter(r => r.id);
}

function saveRecord_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getDataSheet_(payload.sheet);
    ensureHeaders_(sheet);
    const record = normalizeRecord_(payload.record || payload);
    validateRecord_(record);
    const now = new Date();
    let rowIndex = record.id ? findRowById_(sheet, record.id) : Number(payload.rowIndex || 0);
    if (rowIndex > 1 && rowIndex <= sheet.getLastRow()) {
      const previous = rowToRecord_(sheet.getRange(rowIndex,1,1,CONFIG.HEADERS.length).getValues()[0],rowIndex);
      record.id = previous.id;
      record.createdAt = previous.createdAt;
      record.updatedAt = now;
      sheet.getRange(rowIndex,1,1,CONFIG.HEADERS.length).setValues([recordToRow_(record)]);
      appendLog_('ATUALIZAR',record.id,sheet.getName(),record.responsible,previous,record);
      return;
    }
    record.id = Utilities.getUuid();
    record.createdAt = now;
    record.updatedAt = now;
    sheet.appendRow(recordToRow_(record));
    appendLog_('CRIAR',record.id,sheet.getName(),record.responsible,null,record);
  } finally { lock.releaseLock(); }
}

function cancelRecord_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getDataSheet_(payload.sheet);
    ensureHeaders_(sheet);
    const rowIndex = resolveRowIndex_(sheet, payload);
    const previous = rowToRecord_(sheet.getRange(rowIndex,1,1,CONFIG.HEADERS.length).getValues()[0],rowIndex);
    const record = Object.assign({},previous,{ status:'cancelado', updatedAt:new Date(), responsible:String(payload.responsible || previous.responsible || '').trim() });
    sheet.getRange(rowIndex,1,1,CONFIG.HEADERS.length).setValues([recordToRow_(record)]);
    appendLog_('CANCELAR',record.id,sheet.getName(),record.responsible,previous,record);
  } finally { lock.releaseLock(); }
}

function deleteRecord_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getDataSheet_(payload.sheet);
    ensureHeaders_(sheet);
    const rowIndex = resolveRowIndex_(sheet, payload);
    const previous = rowToRecord_(sheet.getRange(rowIndex,1,1,CONFIG.HEADERS.length).getValues()[0],rowIndex);
    appendLog_('EXCLUIR_DEFINITIVAMENTE',previous.id,sheet.getName(),String(payload.responsible || previous.responsavel || '').trim(),previous,null);
    sheet.deleteRow(rowIndex);
  } finally { lock.releaseLock(); }
}

function resolveRowIndex_(sheet, payload) {
  let rowIndex = Number(payload.rowIndex || 0);
  const id = String(payload.id || (payload.record && payload.record.id) || '').trim();
  if ((!rowIndex || rowIndex < 2) && id) rowIndex = findRowById_(sheet,id);
  if (rowIndex < 2 || rowIndex > sheet.getLastRow()) throw new Error('Registro não encontrado.');
  return rowIndex;
}

function addBalance_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheetName = String(payload.sheet || '').trim();
    if (!sheetName) throw new Error('Aba da planilha não informada.');
    const value = parseMoney_(payload.value ?? payload.valor);
    if (!(value > 0)) throw new Error('Informe um valor maior que zero.');
    const sheet = getOrCreateBalanceSheet_();
    const item = { id:Utilities.getUuid(), date:new Date(), sheet:sheetName, value:value, note:String(payload.note || payload.observacao || '').trim(), responsible:String(payload.responsible || payload.responsavel || '').trim() };
    sheet.appendRow([item.id,item.date,item.sheet,item.value,item.note,item.responsible]);
    appendLog_('ADICIONAR_SALDO',item.id,sheetName,item.responsible,null,item);
  } finally { lock.releaseLock(); }
}

function listBalances_(sheetName) {
  const sheet = getOrCreateBalanceSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2,1,lastRow-1,CONFIG.BALANCE_HEADERS.length).getValues().filter(r => String(r[2]) === String(sheetName)).map(r => ({ id:r[0], date:toIsoString_(r[1]), sheet:r[2], value:Number(r[3]) || 0, note:r[4] || '', responsible:r[5] || '' }));
}

function getOrCreateBalanceSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(CONFIG.BALANCE_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.BALANCE_SHEET);
    sheet.getRange(1,1,1,CONFIG.BALANCE_HEADERS.length).setValues([CONFIG.BALANCE_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function normalizeRecord_(input) {
  const partsValue = parseMoney_(input.partsValue ?? input.valorPecas ?? input.pecas);
  const laborValue = parseMoney_(input.laborValue ?? input.valorMaoObra ?? input.maoDeObra);
  const rawStatus = String(input.status || CONFIG.DEFAULT_STATUS).trim().toLowerCase();
  return {
    id:String(input.id || '').trim(), createdAt:input.createdAt ? new Date(input.createdAt) : null,
    orderNumber:String(input.orderNumber ?? input.os ?? '').trim(), plate:String(input.plate ?? input.placa ?? '').trim().toUpperCase(),
    model:String(input.model ?? input.modelo ?? '').trim(), chassis:String(input.chassis ?? input.chassi ?? '').trim().toUpperCase(),
    description:String(input.description ?? input.descricao ?? '').trim(), partCode:String(input.partCode ?? input.codigoPeca ?? '').trim(),
    partsValue:partsValue, laborValue:laborValue, total:roundCurrency_(partsValue + laborValue),
    status:rawStatus === 'ok' || rawStatus === 'finalizado' || rawStatus === 'finalizada' ? 'ok' : rawStatus === 'cancelado' ? 'cancelado' : 'pendente',
    notes:String(input.notes ?? input.observacoes ?? '').trim(), responsible:String(input.responsible ?? input.responsavel ?? '').trim(), updatedAt:input.updatedAt ? new Date(input.updatedAt) : null
  };
}

function validateRecord_(record) {
  if (!record.orderNumber && !record.description) throw new Error('Informe a OS ou a descrição.');
  if (record.partsValue < 0 || record.laborValue < 0) throw new Error('Os valores não podem ser negativos.');
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(CONFIG.SPREADSHEET_ID_PROPERTY);
  if (!id) throw new Error('Configure a propriedade SPREADSHEET_ID.');
  return SpreadsheetApp.openById(id);
}

function getDataSheet_(sheetName) {
  const name = String(sheetName || '').trim();
  if (!name) throw new Error('Aba da planilha não informada.');
  if (name === CONFIG.LOG_SHEET || name === CONFIG.BALANCE_SHEET) throw new Error('Aba reservada.');
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('Aba não encontrada: ' + name);
  return sheet;
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1,1,1,CONFIG.HEADERS.length).setValues([CONFIG.HEADERS]);
    sheet.setFrozenRows(1);
  }
}

function findRowById_(sheet,id) {
  if (sheet.getLastRow() < 2) return -1;
  const ids = sheet.getRange(2,1,sheet.getLastRow()-1,1).getDisplayValues();
  const index = ids.findIndex(r => r[0] === id);
  return index === -1 ? -1 : index + 2;
}

function appendLog_(action,id,sheetName,responsible,previous,next) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(CONFIG.LOG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.LOG_SHEET);
    sheet.getRange(1,1,1,CONFIG.LOG_HEADERS.length).setValues([CONFIG.LOG_HEADERS]);
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([new Date(),action,id,sheetName,responsible || '',previous ? JSON.stringify(previous) : '',next ? JSON.stringify(next) : '']);
}

function recordToRow_(r) {
  return [r.id,r.createdAt,r.orderNumber,r.plate,r.model,r.chassis,r.description,r.partCode,r.partsValue,r.laborValue,r.total,r.status,r.notes,r.responsible,r.updatedAt];
}

function rowToRecord_(row,rowIndex) {
  return { id:row[0], createdAt:toIsoString_(row[1]), os:row[2], placa:row[3], modelo:row[4], chassi:row[5], descricao:row[6], codigoPeca:row[7], pecas:Number(row[8]) || 0, maoObra:Number(row[9]) || 0, total:Number(row[10]) || 0, status:normalizeStatus_(row[11]), observacoes:row[12] || '', responsavel:row[13] || '', updatedAt:toIsoString_(row[14]), rowIndex:rowIndex };
}

function normalizeStatus_(value) {
  const s = String(value || '').trim().toLowerCase();
  if (s === 'ok' || s === 'finalizado' || s === 'finalizada') return 'ok';
  if (s === 'cancelado') return 'cancelado';
  return 'pendente';
}

function parseMoney_(value) {
  if (typeof value === 'number') return roundCurrency_(value);
  const normalized = String(value ?? '').trim().replace(/\s/g,'').replace(/R\$/gi,'').replace(/\./g,'').replace(',','.');
  if (!normalized) return 0;
  const n = Number(normalized);
  if (!Number.isFinite(n)) throw new Error('Valor financeiro inválido.');
  return roundCurrency_(n);
}
function roundCurrency_(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
function toIsoString_(value) { if (!value) return null; const d = value instanceof Date ? value : new Date(value); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
function jsonResponse_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
