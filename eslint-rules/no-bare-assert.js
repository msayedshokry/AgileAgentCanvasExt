/**
 * @fileoverview Custom ESLint rule: no-bare-assert
 *
 * Enforces that `assert.strictEqual(actual, expected)` and `assert.ok(expr)`
 * calls always include a descriptive message (third argument for strictEqual,
 * second argument for ok).
 *
 * Exceptions (no message required):
 *   - assert.ok(true)   — used as a no-op pass marker in test steps
 *   - assert.ok(false)  — used as an intentional always-fail marker
 *
 * Good:   assert.strictEqual(x, y, `Expected "${y}", got "${x}"`);
 * Bad:    assert.strictEqual(x, y);
 *
 * Good:   assert.ok(expr, 'Something should be truthy');
 * Bad:    assert.ok(expr);
 * Allowed: assert.ok(true);
 * Allowed: assert.ok(false);
 */

'use strict';

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require assert.strictEqual and assert.ok calls to include a descriptive message argument',
      recommended: false,
    },
    fixable: false,
    schema: [],
    messages: {
      missingMessage:
        "{{method}}() call without a descriptive message. Add a message argument showing actual value, e.g. `Expected \"${expected}\", got \"${actual}\"`",
    },
  },

  create(context) {
    /**
     * Check whether the call is from the `assert` module.
     * Handles: `assert.strictEqual(...)`, `assert.ok(...)`
     */
    function isAssertCall(node) {
      const callee = node.callee;
      if (!callee || callee.type !== 'MemberExpression') return false;
      if (callee.object.type !== 'Identifier' || callee.object.name !== 'assert') return false;
      return true;
    }

    /**
     * Determine whether the call is one of the targeted assert methods.
     */
    function getAssertMethod(node) {
      if (!isAssertCall(node)) return null;
      const prop = node.callee.property;
      if (!prop || prop.type !== 'Identifier') return null;
      const method = prop.name;
      if (method === 'strictEqual' || method === 'deepStrictEqual') return method;
      if (method === 'ok') return method;
      return null;
    }

    /**
     * Check if an argument is a literal `true` or `false`.
     * Used for the assert.ok(true) / assert.ok(false) exception.
     */
    function isLiteralBoolean(arg, value) {
      return arg && arg.type === 'Literal' && arg.value === value;
    }

    return {
      CallExpression(node) {
        const method = getAssertMethod(node);
        if (!method) return;

        const args = node.arguments;

        if (method === 'strictEqual' || method === 'deepStrictEqual') {
          // Need at least 3 args: actual, expected, message
          if (args.length < 3) {
            context.report({
              node,
              messageId: 'missingMessage',
              data: { method: `assert.${method}` },
            });
            return;
          }
          // If the third arg is an empty string, that's also useless
          const msgArg = args[2];
          if (msgArg && msgArg.type === 'Literal' && msgArg.value === '') {
            context.report({
              node,
              messageId: 'missingMessage',
              data: { method: `assert.${method}` },
            });
          }
        }

        if (method === 'ok') {
          // Allow the no-op assert.ok(true) and assert.ok(false) patterns
          if (args.length >= 1) {
            const first = args[0];
            if (isLiteralBoolean(first, true) || isLiteralBoolean(first, false)) {
              return; // allowed
            }
          }

          // Need at least 2 args: expr, message
          if (args.length < 2) {
            context.report({
              node,
              messageId: 'missingMessage',
              data: { method: 'assert.ok' },
            });
            return;
          }
          // If the second arg is an empty string, flag it
          const msgArg = args[1];
          if (msgArg && msgArg.type === 'Literal' && msgArg.value === '') {
            context.report({
              node,
              messageId: 'missingMessage',
              data: { method: 'assert.ok' },
            });
          }
        }
      },
    };
  },
};
