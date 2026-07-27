const CONFIG = Object.freeze({
  SPREADSHEET_ID_PROPERTY: 'SPREADSHEET_ID',
  INITIAL_BALANCE_PROPERTY: 'SALDO_INICIAL',
  LOG_SHEET: 'LOG',
  DEFAULT_STATUS: 'Pendente',
  CANCELED_STATUS: 'Cancelado',
  HEADERS: [
    'ID',
    'Criado em',
    'OS',
    'Placa',
    'Modelo',
    'Chassi',
    'Descrição',
    'Código da peça',
    'Valor das peças',
    'Valor da mão de obra',
    'Total',
    'Status',
    'Observações',
    'Responsável',
    'Atualizado em'
  ],
  LOG_HEADERS: [
    'Data',
    'Ação',
    'ID',
    'Aba',
    'Responsável',
    'Dados anteriores',
    'Dados novos'
  ]
});

function doGet(e) {
  return handleRequest_(e && e.parameter ? e.parameter : {});
}

function doPost(e) {
  let payload = {};

  try {
    payload = e && e.postData && e.postData.contents
      ? JSON.parse(e.postData.contents)
      : {};
  } catch (error) {
    return jsonResponse_({ ok: false, error: 'Corpo JSON inválido.' });
  }

  return handleRequest_(payload);
}

function handleRequest_(payload) {
  try {
    const action = String(payload.action || '').trim();

    switch (action) {
      case 'health':
        return jsonResponse_({ ok: true, service: 'Saldo Budget API' });
      case 'sheets':
      case 'listSheets':
        return jsonResponse_({ ok: true, sheets: listSheets_() });
      case 'list': {
        const data = buildDashboardData_(payload.sheet);
        return jsonResponse_({ ok: true, data: data, records: data.records });
      }
      case 'saveRecord': {
        const record = saveRecord_(payload);
        const data = buildDashboardData_(payload.sheet);
        return jsonResponse_({ ok: true, record: record, data: data, records: data.records });
      }
      case 'cancelRecord':
      case 'deleteRecord': {
        const record = cancelRecord_(payload);
        const data = buildDashboardData_(payload.sheet);
        return jsonResponse_({ ok: true, record: record, data: data, records: data.records });
      }
      default:
        return jsonResponse_({ ok: false, error: 'Ação não reconhecida.' });
    }
  } catch (error) {
    console.error(error);
    return jsonResponse_({ ok: false, error: error.message || 'Erro interno.' });
  }
}

function listSheets_() {
  return getSpreadsheet_()
    .getSheets()
    .map(sheet => sheet.getName())
    .filter(name => name !== CONFIG.LOG_SHEET);
}

function listRecords_(sheetName) {
  const sheet = getDataSheet_(sheetName);
  ensureHeaders_(sheet);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const rows = sheet.getRange(2, 1, lastRow - 1, CONFIG.HEADERS.length).getValues();
  return rows
    .map((row, index) => ({ row: row, rowIndex: index + 2 }))
    .filter(item => item.row[0])
    .map(item => Object.assign(rowToRecord_(item.row), { rowIndex: item.rowIndex }));
}

function buildDashboardData_(sheetName) {
  const records = listRecords_(sheetName).map(toLegacyRecord_);
  const saldoInicial = getInitialBalance_();
  let pendente = 0;
  let finalizado = 0;
  let comprometido = 0;

  records.forEach(record => {
    const status = normalizeStatus_(record.status);
    const total = Number(record.total) || 0;

    if (status !== 'cancelado') comprometido += total;
    if (status === 'finalizado' || status === 'ok' || status === 'aprovado') {
      finalizado += total;
    } else if (status !== 'cancelado') {
      pendente += total;
    }
  });

  return {
    saldoInicial: saldoInicial,
    pendente: roundCurrency_(pendente),
    finalizado: roundCurrency_(finalizado),
    disponivel: roundCurrency_(saldoInicial - comprometido),
    records: records
  };
}

function getInitialBalance_() {
  const raw = PropertiesService.getScriptProperties()
    .getProperty(CONFIG.INITIAL_BALANCE_PROPERTY);
  return raw ? parseMoney_(raw) : 0;
}

function saveRecord_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getDataSheet_(payload.sheet);
    ensureHeaders_(sheet);

    const input = Object.assign({}, payload.record || payload);
    if (!input.id && payload.rowIndex) {
      const rowIndex = Number(payload.rowIndex);
      if (rowIndex >= 2 && rowIndex <= sheet.getLastRow()) {
        input.id = String(sheet.getRange(rowIndex, 1).getValue() || '').trim();
      }
    }

    const record = normalizeRecord_(input);
    validateRecord_(record);

    const now = new Date();
    const rowIndex = record.id ? findRowById_(sheet, record.id) : -1;

    if (rowIndex > 1) {
      const previous = rowToRecord_(
        sheet.getRange(rowIndex, 1, 1, CONFIG.HEADERS.length).getValues()[0]
      );

      record.createdAt = previous.createdAt;
      record.updatedAt = now;
      sheet.getRange(rowIndex, 1, 1, CONFIG.HEADERS.length)
        .setValues([recordToRow_(record)]);

      appendLog_('ATUALIZAR', record.id, sheet.getName(), record.responsible, previous, record);
      return serializeRecord_(record);
    }

    record.id = Utilities.getUuid();
    record.createdAt = now;
    record.updatedAt = now;
    sheet.appendRow(recordToRow_(record));

    appendLog_('CRIAR', record.id, sheet.getName(), record.responsible, null, record);
    return serializeRecord_(record);
  } finally {
    lock.releaseLock();
  }
}

function cancelRecord_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getDataSheet_(payload.sheet);
    ensureHeaders_(sheet);

    let id = String(payload.id || (payload.record && payload.record.id) || '').trim();
    if (!id && payload.rowIndex) {
      const legacyRowIndex = Number(payload.rowIndex);
      if (legacyRowIndex >= 2 && legacyRowIndex <= sheet.getLastRow()) {
        id = String(sheet.getRange(legacyRowIndex, 1).getValue() || '').trim();
      }
    }

    if (!id) throw new Error('ID do registro não informado.');

    const rowIndex = findRowById_(sheet, id);
    if (rowIndex < 2) throw new Error('Registro não encontrado.');

    const previous = rowToRecord_(
      sheet.getRange(rowIndex, 1, 1, CONFIG.HEADERS.length).getValues()[0]
    );

    const record = Object.assign({}, previous, {
      status: CONFIG.CANCELED_STATUS,
      updatedAt: new Date(),
      responsible: String(payload.responsible || previous.responsible || '').trim()
    });

    sheet.getRange(rowIndex, 1, 1, CONFIG.HEADERS.length)
      .setValues([recordToRow_(record)]);

    appendLog_('CANCELAR', id, sheet.getName(), record.responsible, previous, record);
    return serializeRecord_(record);
  } finally {
    lock.releaseLock();
  }
}

function normalizeRecord_(input) {
  const partsValue = parseMoney_(input.partsValue ?? input.valorPecas ?? input.pecas);
  const laborValue = parseMoney_(input.laborValue ?? input.valorMaoObra ?? input.maoDeObra);

  return {
    id: String(input.id || '').trim(),
    createdAt: input.createdAt ? new Date(input.createdAt) : null,
    orderNumber: String(input.orderNumber ?? input.os ?? '').trim(),
    plate: String(input.plate ?? input.placa ?? '').trim().toUpperCase(),
    model: String(input.model ?? input.modelo ?? '').trim(),
    chassis: String(input.chassis ?? input.chassi ?? '').trim().toUpperCase(),
    description: String(input.description ?? input.descricao ?? '').trim(),
    partCode: String(input.partCode ?? input.codigoPeca ?? '').trim(),
    partsValue,
    laborValue,
    total: roundCurrency_(partsValue + laborValue),
    status: String(input.status || CONFIG.DEFAULT_STATUS).trim(),
    notes: String(input.notes ?? input.observacoes ?? '').trim(),
    responsible: String(input.responsible ?? input.responsavel ?? '').trim(),
    updatedAt: input.updatedAt ? new Date(input.updatedAt) : null
  };
}

function validateRecord_(record) {
  if (!record.orderNumber && !record.description) {
    throw new Error('Informe o número da OS ou a descrição.');
  }
  if (record.partsValue < 0 || record.laborValue < 0) {
    throw new Error('Os valores não podem ser negativos.');
  }
  if (!Number.isFinite(record.total)) throw new Error('Valores financeiros inválidos.');
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties()
    .getProperty(CONFIG.SPREADSHEET_ID_PROPERTY);

  if (!id) {
    throw new Error('Configure a propriedade de script SPREADSHEET_ID.');
  }

  return SpreadsheetApp.openById(id);
}

function getDataSheet_(sheetName) {
  const name = String(sheetName || '').trim();
  if (!name) throw new Error('Aba da planilha não informada.');
  if (name === CONFIG.LOG_SHEET) throw new Error('A aba LOG é reservada.');

  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('Aba não encontrada: ' + name);
  return sheet;
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, CONFIG.HEADERS.length).setValues([CONFIG.HEADERS]);
    sheet.setFrozenRows(1);
    return;
  }

  const current = sheet.getRange(1, 1, 1, CONFIG.HEADERS.length).getValues()[0];
  if (current[0] !== CONFIG.HEADERS[0]) {
    throw new Error('Estrutura inválida na aba ' + sheet.getName() + '.');
  }
}

function findRowById_(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  const index = ids.findIndex(row => row[0] === id);
  return index === -1 ? -1 : index + 2;
}

function appendLog_(action, id, sheetName, responsible, previous, next) {
  const spreadsheet = getSpreadsheet_();
  let logSheet = spreadsheet.getSheetByName(CONFIG.LOG_SHEET);

  if (!logSheet) {
    logSheet = spreadsheet.insertSheet(CONFIG.LOG_SHEET);
    logSheet.getRange(1, 1, 1, CONFIG.LOG_HEADERS.length).setValues([CONFIG.LOG_HEADERS]);
    logSheet.setFrozenRows(1);
  }

  logSheet.appendRow([
    new Date(),
    action,
    id,
    sheetName,
    responsible || '',
    previous ? JSON.stringify(serializeRecord_(previous)) : '',
    next ? JSON.stringify(serializeRecord_(next)) : ''
  ]);
}

function recordToRow_(record) {
  return [
    record.id,
    record.createdAt,
    record.orderNumber,
    record.plate,
    record.model,
    record.chassis,
    record.description,
    record.partCode,
    record.partsValue,
    record.laborValue,
    record.total,
    record.status,
    record.notes,
    record.responsible,
    record.updatedAt
  ];
}

function rowToRecord_(row) {
  return serializeRecord_({
    id: row[0],
    createdAt: row[1],
    orderNumber: row[2],
    plate: row[3],
    model: row[4],
    chassis: row[5],
    description: row[6],
    partCode: row[7],
    partsValue: Number(row[8]) || 0,
    laborValue: Number(row[9]) || 0,
    total: Number(row[10]) || 0,
    status: row[11],
    notes: row[12],
    responsible: row[13],
    updatedAt: row[14]
  });
}

function toLegacyRecord_(record) {
  const status = normalizeStatus_(record.status);
  return {
    id: record.id,
    rowIndex: record.rowIndex,
    os: record.orderNumber,
    placa: record.plate,
    modelo: record.model,
    chassi: record.chassis,
    descricao: record.description,
    codigoPeca: record.partCode,
    pecas: record.partsValue,
    maoObra: record.laborValue,
    total: record.total,
    status: status === 'finalizado' || status === 'aprovado' || status === 'ok' ? 'ok' : 'pendente',
    observacoes: record.notes,
    responsavel: record.responsible,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function normalizeStatus_(status) {
  return String(status || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function serializeRecord_(record) {
  const result = Object.assign({}, record);
  result.createdAt = toIsoString_(result.createdAt);
  result.updatedAt = toIsoString_(result.updatedAt);
  return result;
}

function parseMoney_(value) {
  if (typeof value === 'number') return roundCurrency_(value);

  const normalized = String(value ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')
    .replace(/\./g, '')
    .replace(',', '.');

  if (!normalized) return 0;
  const number = Number(normalized);
  if (!Number.isFinite(number)) throw new Error('Valor financeiro inválido: ' + value);
  return roundCurrency_(number);
}

function roundCurrency_(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function toIsoString_(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function jsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
