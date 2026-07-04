const YYYYMMDD_RE = /^(\d{4})(\d{2})(\d{2})$/;

function isValidUtcDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

function toIsoFromParts(year, month, day) {
  if (!isValidUtcDate(year, month, day)) {
    return null;
  }
  return new Date(Date.UTC(year, month - 1, day)).toISOString();
}

function parseCompactYyyyMmDd(value) {
  const match = YYYYMMDD_RE.exec(value);
  if (!match) {
    return null;
  }
  return toIsoFromParts(Number(match[1]), Number(match[2]), Number(match[3]));
}

function parseIsoDate(value) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  const date = new Date(parsed);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

const MONTHS = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function parsePubMedDate(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const compact = parseCompactYyyyMmDd(trimmed);
  if (compact) {
    return compact;
  }

  const yearOnly = /^(\d{4})$/.exec(trimmed);
  if (yearOnly) {
    return toIsoFromParts(Number(yearOnly[1]), 1, 1);
  }

  const yearMonthDay = /^(\d{4})\s+([A-Za-z]{3,9})\s+(\d{1,2})$/.exec(trimmed);
  if (yearMonthDay) {
    const month = MONTHS[yearMonthDay[2].slice(0, 3).toLowerCase()];
    if (!month) {
      return null;
    }
    return toIsoFromParts(Number(yearMonthDay[1]), month, Number(yearMonthDay[3]));
  }

  const yearMonth = /^(\d{4})\s+([A-Za-z]{3,9})$/.exec(trimmed);
  if (yearMonth) {
    const month = MONTHS[yearMonth[2].slice(0, 3).toLowerCase()];
    if (month) {
      return toIsoFromParts(Number(yearMonth[1]), month, 1);
    }
  }

  const yearSeason = /^(\d{4})\s+(Spring|Summer|Fall|Autumn|Winter)$/i.exec(trimmed);
  if (yearSeason) {
    const season = yearSeason[2].toLowerCase();
    const monthBySeason = {
      spring: 3,
      summer: 6,
      fall: 9,
      autumn: 9,
      winter: 12,
    };
    return toIsoFromParts(Number(yearSeason[1]), monthBySeason[season], 1);
  }

  return parseIsoDate(trimmed);
}

function normalizeExternalDate(value) {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  const compact = parseCompactYyyyMmDd(raw);
  if (compact) {
    return compact;
  }

  const pubmed = parsePubMedDate(raw);
  if (pubmed) {
    return pubmed;
  }

  return parseIsoDate(raw);
}

module.exports = {
  normalizeExternalDate,
};
