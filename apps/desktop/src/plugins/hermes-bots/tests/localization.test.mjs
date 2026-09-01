import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import vm from 'node:vm'

const source = readFileSync(new URL('../plugin.js', import.meta.url), 'utf8')

function localeBundles() {
  const start = source.indexOf('const HERMES_BOTS_LOCALES = ')
  const end = source.indexOf('\nconst ROSTER_KEY', start)

  assert.notEqual(start, -1, 'plugin declares its locale bundles')
  assert.notEqual(end, -1, 'locale bundle has a stable source boundary')

  const context = {}
  vm.runInNewContext(`${source.slice(start, end)}\nglobalThis.bundles = HERMES_BOTS_LOCALES`, context)

  return context.bundles
}

function localeShape(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return child && typeof child === 'object' ? localeShape(child, path) : [`${path}:${typeof child}`]
  })
}

test('registers scoped English and Chinese copy for the reachable Bots UI', () => {
  const bundles = localeBundles()

  assert.match(source, /ctx\.i18n\?\.register\?\.\(HERMES_BOTS_LOCALES\)/)
  assert.equal(bundles.en.pane.bots, 'Bots')
  assert.equal(bundles.zh.pane.bots, '智能体')
  assert.equal(bundles.en.agent.new, 'New Agent')
  assert.equal(bundles.zh.agent.new, '新建智能体')
  assert.equal(bundles.en.routines.new, 'New Routine')
  assert.equal(bundles.zh.routines.new, '新建定时任务')
  assert.equal(bundles.en.group.new, 'New Group Chat')
  assert.equal(bundles.zh.group.new, '新建群聊')
  assert.equal(bundles.en.actions.cancel, 'Cancel')
  assert.equal(bundles.zh.actions.cancel, '取消')
  assert.deepEqual(localeShape(bundles.zh), localeShape(bundles.en), 'Chinese bundle covers every reachable English key')
})

test('routes plugin-owned visible copy in reachable Bots components through i18n', () => {
  // Given: the managed Bots surfaces that are reachable in the employee UI.
  // Prompt builders are intentionally absent: their prose is a protocol contract,
  // not desktop chrome, and must not be translated or pinned by this test.
  const componentNames = new Set([
    'shapeNode',
    'BotFace',
    'McpSetupButton',
    'AvatarPicker',
    'PetThumb',
    'PetTab',
    'BotRow',
    'ModelPicker',
    'CheckList',
    'AdvancedProfileConfig',
    'HubSkillsSection',
    'labeled',
    'EditProfileDialog',
    'CreateAgentDialog',
    'RoutineRow',
    'pickerSelect',
    'SchedulePicker',
    'CreateRoutineDialog',
    'RoutinesPane',
    'ActiveNowStrip',
    'GroupDialog',
    'GroupImageControls',
    'GroupChatSettingsDialog',
    'CreateGroupChatDialog',
    'GroupMentionInput',
    'GroupClarifyCard',
    'GroupChatWorkspace',
    'GroupChatMainView',
    'openGroupChat',
    'GroupRow',
    'BotsPane'
  ])
  const visibleProperties = new Set([
    'aria-label',
    'content',
    'children',
    'description',
    'label',
    'message',
    'placeholder',
    'title',
    'tooltip'
  ])
  const visibleVariables = new Set(['display', 'label', 'preview'])
  const technicalVisibleLiterals = new Set([
    'omnirouter / 9router / nous …',
    'antigravity/gemini-3.6-flash-high'
  ])
  const ast = ts.createSourceFile('plugin.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const findings = new Set()

  const propertyName = node => {
    if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text
    return ''
  }
  const visibleStrings = expression => {
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return [expression]
    if (ts.isTemplateExpression(expression)) {
      return [expression.head, ...expression.templateSpans.flatMap(span => [...visibleStrings(span.expression), span.literal])]
    }
    if (ts.isParenthesizedExpression(expression)) return visibleStrings(expression.expression)
    if (ts.isConditionalExpression(expression)) {
      return [...visibleStrings(expression.whenTrue), ...visibleStrings(expression.whenFalse)]
    }
    if (ts.isArrayLiteralExpression(expression)) return expression.elements.flatMap(visibleStrings)
    if (ts.isBinaryExpression(expression)) {
      if (expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return visibleStrings(expression.right)
      if (
        expression.operatorToken.kind === ts.SyntaxKind.PlusToken ||
        expression.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
      ) {
        return [...visibleStrings(expression.left), ...visibleStrings(expression.right)]
      }
    }
    return []
  }
  const containsRawErrorDetail = expression => {
    if (
      (ts.isPropertyAccessExpression(expression) || ts.isPropertyAccessChain(expression)) &&
      ['error', 'error_message', 'message'].includes(expression.name.text)
    ) {
      return true
    }
    if (
      ts.isCallExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === 'String' &&
      expression.arguments.some(argument => ts.isIdentifier(argument) && ['err', 'error'].includes(argument.text))
    ) {
      return true
    }
    return expression.getChildCount(ast) > 0 && expression.getChildren(ast).some(containsRawErrorDetail)
  }
  const inspectVisibleProperties = (node, owner) => {
    if (ts.isPropertyAssignment(node) && visibleProperties.has(propertyName(node.name))) {
      for (const literal of visibleStrings(node.initializer)) {
        const text = literal.text.trim()
        if (/\b[A-Za-z]{2,}\b/.test(text) && !technicalVisibleLiterals.has(text)) {
          const { line } = ast.getLineAndCharacterOfPosition(literal.getStart(ast))
          findings.add(`${owner}:${line + 1}: ${JSON.stringify(text)}`)
        }
      }
      if (containsRawErrorDetail(node.initializer)) {
        const { line } = ast.getLineAndCharacterOfPosition(node.initializer.getStart(ast))
        findings.add(`${owner}:${line + 1}: raw error detail in ${propertyName(node.name)}`)
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && visibleVariables.has(node.name.text) && node.initializer) {
      for (const literal of visibleStrings(node.initializer)) {
        const text = literal.text.trim()
        if (/\b[A-Za-z]{2,}\b/.test(text) && !technicalVisibleLiterals.has(text)) {
          const { line } = ast.getLineAndCharacterOfPosition(literal.getStart(ast))
          findings.add(`${owner}:${line + 1}: ${JSON.stringify(text)}`)
        }
      }
    }
    ts.forEachChild(node, child => inspectVisibleProperties(child, owner))
  }
  const inspectImperativeSinks = node => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      const isHostCall =
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === 'host'
      const name = isHostCall ? callee.name.text : ts.isIdentifier(callee) ? callee.text : ''
      const { line } = ast.getLineAndCharacterOfPosition(node.getStart(ast))

      if (isHostCall && name === 'notifyError') {
        findings.add(`sink:${line + 1}: host.notifyError exposes raw error detail`)
      } else if ((isHostCall && name === 'notify') || name === 'setError' || name === 'setMessage') {
        for (const argument of node.arguments) {
          if (isHostCall && name === 'notify' && ts.isObjectLiteralExpression(argument)) {
            inspectVisibleProperties(argument, 'sink')
          }
          for (const literal of visibleStrings(argument)) {
            const text = literal.text.trim()
            if (/\b[A-Za-z]{2,}\b/.test(text) && !technicalVisibleLiterals.has(text)) {
              findings.add(`sink:${line + 1}: ${JSON.stringify(text)}`)
            }
          }
          if (containsRawErrorDetail(argument)) {
            findings.add(`sink:${line + 1}: raw error detail`)
          }
          if (
            (name === 'setError' || name === 'setMessage') &&
            ts.isIdentifier(argument) &&
            ['err', 'error'].includes(argument.text)
          ) {
            findings.add(`sink:${line + 1}: raw error object`)
          }
        }
      }
    }
    ts.forEachChild(node, inspectImperativeSinks)
  }

  // When: visible literals in each named UI component and plugin registration
  // surface are inspected structurally rather than by prose snapshots.
  for (const statement of ast.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && componentNames.has(statement.name.text)) {
      inspectVisibleProperties(statement, statement.name.text)
    }
  }
  const registration = ast.statements.find(
    statement =>
      ts.isExportAssignment(statement) &&
      ts.isObjectLiteralExpression(statement.expression) &&
      statement.expression.properties.some(
        property => ts.isMethodDeclaration(property) && propertyName(property.name) === 'register'
      )
  )
  assert.ok(registration, 'plugin has a registration surface')
  const registerMethod = registration.expression.properties.find(
    property => ts.isMethodDeclaration(property) && propertyName(property.name) === 'register'
  )
  inspectVisibleProperties(registerMethod.body, 'register')
  inspectImperativeSinks(ast)

  // Then: all plugin-authored English chrome is represented by an i18n call.
  assert.deepEqual([...findings], [])
})
