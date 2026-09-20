import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { Script } from 'node:vm';
import { parse } from 'acorn';

export const MAX_TRANSFORM_BYTES = 5 * 1024 * 1024;

export function transformDigest(source: Uint8Array): string {
  return createHash('sha256').update(source).digest('hex');
}

function sourceText(source: Uint8Array): string {
  if (source.byteLength === 0 || source.byteLength > MAX_TRANSFORM_BYTES) throw new Error('invalid transform source');
  const text = Buffer.from(source).toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(Buffer.from(source))) throw new Error('transform source must be UTF-8');
  return text;
}

type AstNode = Record<string, unknown> & { type: string };

const ALLOWED_NODE_TYPES = new Set([
  'ArrayExpression', 'ArrayPattern', 'ArrowFunctionExpression', 'AssignmentExpression', 'AssignmentPattern',
  'BinaryExpression', 'BlockStatement', 'CallExpression', 'ChainExpression', 'ConditionalExpression',
  'EmptyStatement', 'ExpressionStatement', 'Identifier', 'Literal', 'LogicalExpression', 'MemberExpression',
  'NewExpression', 'ObjectExpression', 'ObjectPattern', 'Program', 'Property', 'RestElement', 'ReturnStatement',
  'SpreadElement', 'TemplateElement', 'TemplateLiteral', 'UnaryExpression', 'VariableDeclaration', 'VariableDeclarator',
]);
const RESERVED_BINDINGS = new Set([
  'Date', 'Function', 'Object', 'Reflect', 'String', 'Number', 'Boolean', 'eval', 'exports', 'globalThis',
  'module', 'process', 'require', '__dirname', '__filename',
]);
const FORBIDDEN_PROPERTIES = new Set([
  '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__', '__proto__',
  'constructor', 'getBuiltinModule', 'prototype',
]);
const ALLOWED_BINARY_OPERATORS = new Set([
  '!=', '!==', '%', '*', '**', '+', '-', '/', '<', '<<', '<=', '==', '===', '>', '>=', '>>', '>>>',
]);
const ALLOWED_LOGICAL_OPERATORS = new Set(['&&', '??', '||']);
const ALLOWED_UNARY_OPERATORS = new Set(['!', '+', '-', 'void']);

function astNode(value: unknown): value is AstNode {
  return value !== null && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string';
}

function bindingNames(pattern: unknown, names: Set<string>): void {
  if (!astNode(pattern)) throw new Error('scheduled transform must use supported bindings');
  if (pattern.type === 'Identifier') {
    const name = pattern.name;
    if (typeof name !== 'string' || RESERVED_BINDINGS.has(name)) throw new Error('scheduled transform binding is not allowed');
    names.add(name);
    return;
  }
  if (pattern.type === 'ObjectPattern' || pattern.type === 'ArrayPattern') {
    for (const value of Object.values(pattern)) {
      if (Array.isArray(value)) for (const nested of value) { if (astNode(nested)) bindingNames(nested.type === 'Property' ? nested.value : nested, names); }
    }
    return;
  }
  if (pattern.type === 'AssignmentPattern' || pattern.type === 'RestElement') { bindingNames(pattern.left ?? pattern.argument, names); return; }
  throw new Error('scheduled transform must use supported bindings');
}

function collectBindings(node: unknown, names = new Set<string>()): Set<string> {
  if (!astNode(node)) return names;
  if (node.type === 'VariableDeclarator') bindingNames(node.id, names);
  if (node.type === 'ArrowFunctionExpression' && Array.isArray(node.params)) {
    for (const parameter of node.params) bindingNames(parameter, names);
  }
  for (const value of Object.values(node)) {
    if (astNode(value)) collectBindings(value, names);
    else if (Array.isArray(value)) for (const nested of value) collectBindings(nested, names);
  }
  return names;
}

function memberProperty(node: AstNode): string | number {
  const property = node.property;
  if (node.computed === false && astNode(property) && property.type === 'Identifier' && typeof property.name === 'string') return property.name;
  if (node.computed === true && astNode(property) && property.type === 'Literal'
    && (typeof property.value === 'string' || typeof property.value === 'number')) return property.value;
  throw new Error('scheduled transform computed access is not allowed');
}

function staticPropertyKey(node: AstNode): string | number {
  const property = node.key;
  if (node.computed === false && astNode(property) && property.type === 'Identifier' && typeof property.name === 'string') return property.name;
  if (node.computed === false && astNode(property) && property.type === 'Literal'
    && (typeof property.value === 'string' || typeof property.value === 'number')) return property.value;
  throw new Error('scheduled transform computed property is not allowed');
}

function isExportsTransform(node: unknown): boolean {
  return astNode(node) && node.type === 'MemberExpression' && node.computed === false && astNode(node.object)
    && node.object.type === 'Identifier' && node.object.name === 'exports' && memberProperty(node) === 'transform';
}

function isTypeScriptExportMarker(node: AstNode): boolean {
  if (node.type !== 'CallExpression' || !astNode(node.callee) || node.callee.type !== 'MemberExpression'
    || node.callee.computed !== false || !astNode(node.callee.object) || node.callee.object.type !== 'Identifier'
    || node.callee.object.name !== 'Object' || memberProperty(node.callee) !== 'defineProperty' || !Array.isArray(node.arguments)) return false;
  const [target, key, descriptor] = node.arguments;
  return astNode(target) && target.type === 'Identifier' && target.name === 'exports'
    && astNode(key) && key.type === 'Literal' && key.value === '__esModule'
    && astNode(descriptor) && descriptor.type === 'ObjectExpression';
}

function validateIdentifier(node: AstNode, parent: AstNode | undefined, key: string | undefined, bindings: ReadonlySet<string>): void {
  const name = node.name;
  if (typeof name !== 'string') throw new Error('scheduled transform identifier is not allowed');
  if (key === 'id' || key === 'params' || (parent?.type === 'Property' && key === 'key' && parent.computed === false)
    || (parent?.type === 'MemberExpression' && key === 'property' && parent.computed === false)) return;
  if (bindings.has(name) || name === 'undefined') return;
  if (name === 'exports' && ((parent?.type === 'MemberExpression' && key === 'object' && isExportsTransform(parent))
    || (parent?.type === 'CallExpression' && isTypeScriptExportMarker(parent)))) return;
  if (name === 'Object' && parent?.type === 'MemberExpression' && key === 'object'
    && parent.computed === false && memberProperty(parent) === 'defineProperty') return;
  if ((name === 'String' || name === 'Number' || name === 'Boolean') && parent?.type === 'CallExpression' && key === 'callee') return;
  if (name === 'Date' && parent?.type === 'NewExpression' && key === 'callee') return;
  throw new Error('scheduled transform ambient access is not allowed');
}

function validateAst(node: unknown, bindings: ReadonlySet<string>, parent?: AstNode, key?: string): void {
  if (!astNode(node)) return;
  if (!ALLOWED_NODE_TYPES.has(node.type)) throw new Error(`scheduled transform syntax is not allowed: ${node.type}`);
  if (node.type === 'Identifier') { validateIdentifier(node, parent, key, bindings); return; }
  if (node.type === 'VariableDeclaration' && node.kind !== 'const') throw new Error('scheduled transform mutable bindings are not allowed');
  if (node.type === 'ArrowFunctionExpression' && node.async === true) throw new Error('scheduled transform async functions are not allowed');
  if (node.type === 'MemberExpression') {
    const property = memberProperty(node);
    if (typeof property === 'string' && FORBIDDEN_PROPERTIES.has(property)) throw new Error('scheduled transform property access is not allowed');
  }
  if (node.type === 'AssignmentExpression' && (node.operator !== '=' || !isExportsTransform(node.left))) {
    throw new Error('scheduled transform assignment is not allowed');
  }
  if (node.type === 'CallExpression') {
    const callee = node.callee;
    const direct = astNode(callee) && callee.type === 'Identifier' && ['String', 'Number', 'Boolean'].includes(String(callee.name));
    const local = astNode(callee) && callee.type === 'Identifier' && bindings.has(String(callee.name));
    const member = astNode(callee) && callee.type === 'MemberExpression' && (!astNode(callee.object)
      || callee.object.type !== 'Identifier' || !['Date', 'Object', 'String', 'Number', 'Boolean', 'exports'].includes(String(callee.object.name)));
    if (!direct && !local && !member && !isTypeScriptExportMarker(node)) throw new Error('scheduled transform call is not allowed');
  }
  if (node.type === 'NewExpression' && (!astNode(node.callee) || node.callee.type !== 'Identifier' || node.callee.name !== 'Date')) {
    throw new Error('scheduled transform constructor is not allowed');
  }
  if (node.type === 'BinaryExpression' && !ALLOWED_BINARY_OPERATORS.has(String(node.operator))) throw new Error('scheduled transform operator is not allowed');
  if (node.type === 'LogicalExpression' && !ALLOWED_LOGICAL_OPERATORS.has(String(node.operator))) throw new Error('scheduled transform operator is not allowed');
  if (node.type === 'UnaryExpression' && !ALLOWED_UNARY_OPERATORS.has(String(node.operator))) throw new Error('scheduled transform operator is not allowed');
  if (node.type === 'Property') {
    if (node.kind !== 'init' || node.method === true || node.computed === true) throw new Error('scheduled transform accessor is not allowed');
    const property = staticPropertyKey(node);
    if (parent?.type === 'ObjectPattern' && typeof property === 'string' && FORBIDDEN_PROPERTIES.has(property)) {
      throw new Error('scheduled transform property access is not allowed');
    }
  }
  for (const [childKey, value] of Object.entries(node)) {
    if (astNode(value)) validateAst(value, bindings, node, childKey);
    else if (Array.isArray(value)) for (const nested of value) validateAst(nested, bindings, node, childKey);
  }
}

function validateProgram(program: AstNode, bindings: ReadonlySet<string>): void {
  if (!Array.isArray(program.body)) throw new Error('scheduled transform program is not allowed');
  for (const statement of program.body) {
    if (!astNode(statement)) throw new Error('scheduled transform statement is not allowed');
    const strictDirective = statement.type === 'ExpressionStatement' && statement.directive === 'use strict';
    const exportMarker = statement.type === 'ExpressionStatement' && astNode(statement.expression) && isTypeScriptExportMarker(statement.expression);
    const exportAssignment = statement.type === 'ExpressionStatement' && astNode(statement.expression)
      && statement.expression.type === 'AssignmentExpression' && isExportsTransform(statement.expression.left);
    if (!strictDirective && !exportMarker && !exportAssignment && statement.type !== 'VariableDeclaration') {
      throw new Error('scheduled transform top-level statement is not allowed');
    }
    validateAst(statement, bindings, program, 'body');
  }
}

/** scheduled transform을 순수 mapping AST allowlist로 module top-level 실행 전에 검증한다. */
export function assertSelfContainedTransform(source: Uint8Array): void {
  const program = parse(sourceText(source), { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true }) as unknown as AstNode;
  const bindings = collectBindings(program);
  validateProgram(program, bindings);
}

/** 검증한 정확한 CommonJS 바이트를 파일 재조회 없이 실행한다. */
export function loadTransformSnapshot(source: Uint8Array, filename: string): (input: unknown) => unknown {
  return loadTransformSnapshotWithRequire(source, filename, createRequire(filename));
}

export function loadSelfContainedTransformSnapshot(source: Uint8Array, filename: string): (input: unknown) => unknown {
  assertSelfContainedTransform(source);
  const denied = (() => { throw new Error('scheduled transform module access is disabled'); }) as unknown as NodeJS.Require;
  return loadTransformSnapshotWithRequire(source, filename, denied);
}

function loadTransformSnapshotWithRequire(source: Uint8Array, filename: string, requireModule: NodeJS.Require): (input: unknown) => unknown {
  const wrapped = `(function (exports, require, module, __filename, __dirname) {\n${sourceText(source)}\n});`;
  const execute = new Script(wrapped, { filename }).runInThisContext() as (
    exports: Record<string, unknown>, require: NodeJS.Require, module: { exports: Record<string, unknown> }, filename: string, dirname: string,
  ) => void;
  const module = { exports: {} as Record<string, unknown> };
  execute(module.exports, requireModule, module, filename, dirname(filename));
  if (typeof module.exports.transform !== 'function') throw new Error('invalid transform export');
  return module.exports.transform as (input: unknown) => unknown;
}
