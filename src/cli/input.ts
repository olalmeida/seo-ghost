/** Parsea registros CSV RFC 4180, incluidos campos entrecomillados y comas. */
export function parseCsvRecords(content: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < content.length; index++) {
    const char = content[index];
    if (quoted) {
      if (char === '"' && content[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && content[index + 1] === '\n') index++;
      record.push(field);
      if (record.some((value) => value.trim())) records.push(record);
      record = [];
      field = '';
    } else {
      field += char;
    }
  }

  record.push(field);
  if (record.some((value) => value.trim())) records.push(record);
  return records;
}

/** Extrae URLs de TXT o CSV, priorizando una columna denominada `url`. */
export function parseUrlFile(content: string, isCsv: boolean): string[] {
  if (!isCsv) {
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  }

  const records = parseCsvRecords(content);
  if (records.length === 0) return [];

  const header = records[0].map((value) => value.trim().replace(/^\uFEFF/, '').toLowerCase());
  const urlIndex = header.indexOf('url');
  const columnIndex = urlIndex >= 0 ? urlIndex : 0;

  return records
    .slice(1)
    .map((record) => record[columnIndex]?.trim() ?? '')
    .filter(Boolean);
}
