import { QastError } from './lexer.js';

export function parse(tokens, file = '<stdin>') {
  let pos = 0;

  function peek() {
    return tokens[pos] || tokens[tokens.length - 1];
  }

  function consume(type, value) {
    const tok = peek();
    if (tok.type === type && (value === undefined || tok.value === value)) {
      pos++;
      return tok;
    }
    const expected = value !== undefined ? `${type}(${value})` : type;
    throw new QastError(`Expected ${expected} but found ${tok.type} ${tok.value ?? ''}`, file, tok.line, tok.column);
  }

  function match(type, value) {
    const tok = peek();
    if (tok.type === type && (value === undefined || tok.value === value)) {
      pos++;
      return true;
    }
    return false;
  }

  const body = [];
  while (peek().type !== 'EOF') {
    body.push(parseStatement());
  }
  return { type: 'Program', body };

  function parseStatement() {
    const tok = peek();
    if (tok.type === 'PRINT') return parsePrint();
    if (tok.type === 'SET') return parseSet();
    if (tok.type === 'INPUT') return parseInput();
    if (tok.type === 'IF') return parseIf();
    if (tok.type === 'LOOP') return parseLoop();
    if (tok.type === 'WHILE') return parseWhile();
    if (tok.type === 'FN') return parseFn();
    if (tok.type === 'RETURN') return parseReturn();
    // expression statement (e.g., function call)
    const expr = parseExpression();
    return { type: 'ExprStatement', expr, loc: locFrom(expr) };
  }

  function parsePrint() {
    const start = consume('PRINT');
    const argument = parseExpression();
    return { type: 'PrintStatement', argument, loc: locFrom(start, argument) };
  }

  function parseSet() {
    const start = consume('SET');
    const id = consume('IDENT');
    consume('OP', '=');
    const value = parseExpression();
    return {
      type: 'SetStatement',
      name: id.value,
      value,
      loc: locFrom(start, value),
    };
  }

  function parseInput() {
    const start = consume('INPUT');
    const id = consume('IDENT');
    let prompt = null;
    if (match('STRING')) {
      prompt = tokens[pos - 1].value;
    }
    return {
      type: 'InputStatement',
      name: id.value,
      prompt,
      loc: locFrom(start, id),
    };
  }

  function parseIf() {
    const start = consume('IF');
    const tests = [];
    const firstTestExpr = parseExpression();
    consume('END'); // temporary placeholder: will refine to block parsing
    tests.push({ test: firstTestExpr, consequent: [] });
    return {
      type: 'IfStatement',
      tests,
      alternate: null,
      loc: locFrom(start, firstTestExpr),
    };
  }

  function parseLoop() {
    const start = consume('LOOP');
    const countExpr = parseExpression();
    consume('END'); // placeholder for body
    return {
      type: 'LoopStatement',
      count: countExpr,
      body: [],
      loc: locFrom(start, countExpr),
    };
  }

  function parseWhile() {
    const start = consume('WHILE');
    const test = parseExpression();
    consume('END'); // placeholder
    return {
      type: 'WhileStatement',
      test,
      body: [],
      loc: locFrom(start, test),
    };
  }

  function parseFn() {
    const start = consume('FN');
    const id = consume('IDENT');
    const params = [];
    while (match('IDENT')) {
      params.push(tokens[pos - 1].value);
    }
    consume('END'); // placeholder for body
    return {
      type: 'FunctionDef',
      name: id.value,
      params,
      body: [],
      loc: locFrom(start, id),
    };
  }

  function parseReturn() {
    const start = consume('RETURN');
    let argument = null;
    if (peek().type !== 'EOF') {
      argument = parseExpression();
    }
    return {
      type: 'ReturnStatement',
      argument,
      loc: locFrom(start, argument || start),
    };
  }

  // Expression parsing (very small Pratt-style precedence)
  function parseExpression() {
    return parseEquality();
  }

  function parseEquality() {
    let expr = parseComparison();
    while (match('OP', '==') || match('OP', '!=')) {
      const op = tokens[pos - 1].value;
      const right = parseComparison();
      expr = {
        type: 'BinaryExpression',
        operator: op,
        left: expr,
        right,
        loc: locFrom(expr, right),
      };
    }
    return expr;
  }

  function parseComparison() {
    let expr = parseTerm();
    while (match('OP', '>') || match('OP', '<') || match('OP', '>=') || match('OP', '<=')) {
      const op = tokens[pos - 1].value;
      const right = parseTerm();
      expr = {
        type: 'BinaryExpression',
        operator: op,
        left: expr,
        right,
        loc: locFrom(expr, right),
      };
    }
    return expr;
  }

  function parseTerm() {
    let expr = parseFactor();
    while (match('OP', '+') || match('OP', '-')) {
      const op = tokens[pos - 1].value;
      const right = parseFactor();
      expr = {
        type: 'BinaryExpression',
        operator: op,
        left: expr,
        right,
        loc: locFrom(expr, right),
      };
    }
    return expr;
  }

  function parseFactor() {
    let expr = parseUnary();
    while (match('OP', '*') || match('OP', '/') || match('OP', '%')) {
      const op = tokens[pos - 1].value;
      const right = parseUnary();
      expr = {
        type: 'BinaryExpression',
        operator: op,
        left: expr,
        right,
        loc: locFrom(expr, right),
      };
    }
    return expr;
  }

  function parseUnary() {
    if (match('OP', '!') || match('OP', '-')) {
      const op = tokens[pos - 1].value;
      const right = parseUnary();
      return {
        type: 'UnaryExpression',
        operator: op,
        argument: right,
        loc: locFrom(tokens[pos - 1], right),
      };
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const tok = peek();
    if (match('NUMBER')) {
      return { type: 'NumberLiteral', value: tok.value, loc: locFrom(tok) };
    }
    if (match('STRING')) {
      return { type: 'StringLiteral', value: tok.value, loc: locFrom(tok) };
    }
    if (match('IDENT')) {
      return { type: 'Identifier', name: tok.value, loc: locFrom(tok) };
    }
    if (match('OP', '(')) {
      const expr = parseExpression();
      consume('OP', ')');
      return { type: 'Grouping', expression: expr, loc: locFrom(tok, expr) };
    }
    throw new QastError(`Unexpected token ${tok.type}`, file, tok.line, tok.column);
  }

  function locFrom(startNode, endNode) {
    const s = startNode.loc ? startNode.loc.start : { line: startNode.line, column: startNode.column };
    const e = endNode && endNode.loc ? endNode.loc.end : s;
    return { start: s, end: e };
  }
}

