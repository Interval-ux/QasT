import readline from 'readline';
import { QastError } from './lexer.js';

export function createRuntime(options = {}) {
  const globals = Object.create(null);
  const envStack = [globals];
  const trace = !!options.trace;

  function setVar(name, value) {
    envStack[envStack.length - 1][name] = value;
  }

  function getVar(name, loc) {
    for (let i = envStack.length - 1; i >= 0; i--) {
      if (Object.prototype.hasOwnProperty.call(envStack[i], name)) {
        return envStack[i][name];
      }
    }
    throw new QastError(`Undefined variable '${name}'`, loc.file, loc.start.line, loc.start.column);
  }

  async function input(prompt = '') {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question(prompt, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  const runtime = {
    envStack,
    setVar,
    getVar,
    trace,
    io: { input },
  };

  // built-in print
  globals.print = (...args) => {
    console.log(...args);
  };

  return runtime;
}

export async function evalProgram(program, runtime) {
  for (const stmt of program.body) {
    const res = await evalStatement(stmt, runtime);
    if (res && res.type === 'return') {
      return res.value;
    }
  }
}

async function evalStatement(node, runtime) {
  if (runtime.trace) {
    // basic trace: show node type
    // eslint-disable-next-line no-console
    console.log(`[trace] ${node.type}`);
  }
  switch (node.type) {
    case 'PrintStatement': {
      const v = await evalExpression(node.argument, runtime);
      runtime.envStack[0].print(v);
      return;
    }
    case 'SetStatement': {
      const v = await evalExpression(node.value, runtime);
      runtime.setVar(node.name, v);
      return;
    }
    case 'InputStatement': {
      const v = await runtime.io.input(node.prompt || '');
      runtime.setVar(node.name, v);
      return;
    }
    case 'ExprStatement': {
      await evalExpression(node.expr, runtime);
      return;
    }
    case 'ReturnStatement': {
      const v = node.argument ? await evalExpression(node.argument, runtime) : null;
      return { type: 'return', value: v };
    }
    default:
      return;
  }
}

async function evalExpression(node, runtime) {
  switch (node.type) {
    case 'NumberLiteral':
      return node.value;
    case 'StringLiteral':
      return node.value;
    case 'Identifier':
      return runtime.getVar(node.name, node.loc || { file: '<unknown>', start: { line: 0, column: 0 } });
    case 'UnaryExpression': {
      const v = await evalExpression(node.argument, runtime);
      if (node.operator === '-') return -v;
      if (node.operator === '!') return !v;
      throw new Error(`Unknown unary operator ${node.operator}`);
    }
    case 'BinaryExpression': {
      const left = await evalExpression(node.left, runtime);
      const right = await evalExpression(node.right, runtime);
      switch (node.operator) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          return left / right;
        case '%':
          return left % right;
        case '==':
          return left === right;
        case '!=':
          return left !== right;
        case '>':
          return left > right;
        case '<':
          return left < right;
        case '>=':
          return left >= right;
        case '<=':
          return left <= right;
        default:
          throw new Error(`Unknown operator ${node.operator}`);
      }
    }
    case 'Grouping':
      return evalExpression(node.expression, runtime);
    default:
      throw new Error(`Unknown expression type ${node.type}`);
  }
}

