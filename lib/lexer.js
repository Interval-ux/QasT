export class QastError extends Error {
  constructor(message, file, line, column, hint) {
    super(message);
    this.name = 'QastError';
    this.isQastError = true;
    this.file = file;
    this.line = line;
    this.column = column;
    this.hint = hint;
  }
}

export function lex(source, file = '<stdin>') {
  const tokens = [];
  const lines = source.split(/\r?\n/);
  let headerFound = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;

    if (!headerFound) {
      if (!trimmed.startsWith('new qas')) {
        throw new QastError('Missing QasT header (new qas).', file, lineNum, 1, 'First non-empty line must be: new qas');
      }
      headerFound = true;
      continue;
    }

    if (!trimmed.startsWith('q.')) {
      // For now treat as error; tooling later can relax.
      throw new QastError("Executable lines must start with 'q.'.", file, lineNum, raw.indexOf(trimmed) + 1);
    }

    const stmt = raw.slice(raw.indexOf('q.') + 2);
    tokenizeStatement(stmt, tokens, file, lineNum);
  }

  tokens.push({ type: 'EOF', value: null, line: lines.length, column: 1, file });
  return tokens;
}

function tokenizeStatement(text, tokens, file, line) {
  let pos = 0;
  const len = text.length;

  function add(type, value, column) {
    tokens.push({ type, value, line, column, file });
  }

  while (pos < len) {
    const ch = text[pos];
    const column = pos + 1;

    if (/\s/.test(ch)) {
      pos++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const { value, endPos } = readString(text, pos, file, line);
      add('STRING', value, column);
      pos = endPos;
      continue;
    }

    if (/[0-9]/.test(ch)) {
      const { value, endPos } = readNumber(text, pos);
      add('NUMBER', value, column);
      pos = endPos;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      const { value, endPos } = readIdent(text, pos);
      const type = keywordOrIdent(value);
      add(type, value, column);
      pos = endPos;
      continue;
    }

    // operators and punctuation
    const two = text.slice(pos, pos + 2);
    if (two === '==' || two === '!=' || two === '>=' || two === '<=' || two === '&&' || two === '||') {
      add('OP', two, column);
      pos += 2;
      continue;
    }

    if ('+-*/%><=(){}[],.'.includes(ch)) {
      add('OP', ch, column);
      pos++;
      continue;
    }

    throw new QastError(`Unexpected character '${ch}'`, file, line, column);
  }
}

function readString(text, start, file, line) {
  const quote = text[start];
  let pos = start + 1;
  let value = '';
  while (pos < text.length) {
    const ch = text[pos];
    if (ch === '\\') {
      const next = text[pos + 1];
      if (next === 'n') value += '\n';
      else if (next === 't') value += '\t';
      else value += next;
      pos += 2;
    } else if (ch === quote) {
      pos++;
      return { value, endPos: pos };
    } else {
      value += ch;
      pos++;
    }
  }
  throw new QastError('Unterminated string literal', file, line, start + 1);
}

function readNumber(text, start) {
  let pos = start;
  while (pos < text.length && /[0-9.]/.test(text[pos])) pos++;
  const raw = text.slice(start, pos);
  return { value: Number(raw), endPos: pos };
}

function readIdent(text, start) {
  let pos = start;
  while (pos < text.length && /[A-Za-z0-9_]/.test(text[pos])) pos++;
  const raw = text.slice(start, pos);
  return { value: raw, endPos: pos };
}

const KEYWORDS = new Set([
  'print',
  'set',
  'input',
  'if',
  'elif',
  'else',
  'end',
  'loop',
  'while',
  'fn',
  'return',
]);

function keywordOrIdent(value) {
  if (KEYWORDS.has(value)) return value.toUpperCase();
  return 'IDENT';
}

