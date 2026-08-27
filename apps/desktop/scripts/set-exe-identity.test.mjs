import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { NtExecutable, NtExecutableResource, Resource } from 'resedit'

import { stampExeIdentity } from './set-exe-identity.mjs'

test('stamps a Windows executable without Wine', async () => {
  const root = path.resolve(import.meta.dirname, '..')
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'my-king-exe-stamp-'))
  const executablePath = path.join(temporary, 'My-King.exe')

  try {
    await fs.writeFile(executablePath, Buffer.from(NtExecutable.createEmpty(true, true).generate()))
    await stampExeIdentity(executablePath, root)

    const executable = NtExecutable.from(await fs.readFile(executablePath), { ignoreCert: true })
    const resources = NtExecutableResource.from(executable)
    const icons = Resource.IconGroupEntry.fromEntries(resources.entries)
    const versions = Resource.VersionInfo.fromEntries(resources.entries)
    const language = versions[0]?.getAllLanguagesForStringValues()[0]

    assert.equal(icons.length, 1)
    assert.ok(icons[0]?.icons.length)
    assert.ok(language)
    assert.equal(versions[0]?.getStringValues(language).ProductName, 'My King')
    assert.equal(versions[0]?.getStringValues(language).OriginalFilename, 'My-King.exe')
  } finally {
    await fs.rm(temporary, { force: true, recursive: true })
  }
})
