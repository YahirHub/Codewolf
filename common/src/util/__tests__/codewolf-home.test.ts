import { afterEach, describe, expect, test } from 'bun:test'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  ensureCodewolfHomeLayout,
  getCodewolfHomeDir,
  getCodewolfProjectsDir,
  getCodewolfSkillsDir,
} from '../codewolf-home'

describe('Codewolf home layout', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('uses a hidden .codewolf directory directly under the user home', () => {
    const home = path.join(path.parse(process.cwd()).root, 'Users', 'mimi')
    expect(getCodewolfHomeDir(home)).toBe(path.join(home, '.codewolf'))
    expect(getCodewolfSkillsDir(home)).toBe(
      path.join(home, '.codewolf', 'skills'),
    )
    expect(getCodewolfProjectsDir(home)).toBe(
      path.join(home, '.codewolf', 'projects'),
    )
  })

  test('creates the shared root, skills and projects directories', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codewolf-home-'))
    tempDirs.push(home)

    const root = ensureCodewolfHomeLayout(home)

    expect(root).toBe(path.join(home, '.codewolf'))
    expect(fs.statSync(root).isDirectory()).toBe(true)
    expect(fs.statSync(path.join(root, 'skills')).isDirectory()).toBe(true)
    expect(fs.statSync(path.join(root, 'projects')).isDirectory()).toBe(true)
  })
})
