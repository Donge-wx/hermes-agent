import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')

test('pre-React boot uses the approved particle lemniscate instead of the logo plate or legacy line loop', () => {
  assert.match(source, /data-loader="lemniscate-bloom"/)
  assert.match(source, /pre-react-boot__loader-particles/)
  assert.match(source, /pre-react-boot__particle/g)
  assert.doesNotMatch(source, /pre-react-boot__loader-mark/)
  assert.doesNotMatch(source, /pre-react-boot__loader-(?:track|accent)/)
})
