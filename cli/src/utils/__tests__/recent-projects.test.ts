import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import fs from 'fs'
import os from 'os'
import path from 'path'

import * as authModule from '../auth'
import {
  getRecentProjectsPath,
  loadRecentProjects,
  saveRecentProject,
} from '../recent-projects'

let tempRoot = ''
let tempConfigDir = ''

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codewolf-recents-'))
  tempConfigDir = path.join(tempRoot, '.codewolf')
  spyOn(authModule, 'getConfigDir').mockReturnValue(tempConfigDir)
})

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true })
})

describe('recent projects registry', () => {
  test('retains more than ten known project paths for global history', () => {
    const projects = Array.from({ length: 12 }, (_, index) =>
      path.join(tempRoot, `project-${index + 1}`),
    )
    for (const projectPath of projects) {
      fs.mkdirSync(projectPath, { recursive: true })
      saveRecentProject(projectPath)
    }

    const recentProjects = loadRecentProjects()

    expect(recentProjects).toHaveLength(12)
    expect(new Set(recentProjects.map((project) => project.path))).toEqual(
      new Set(projects.map((project) => path.resolve(project))),
    )
  })

  test('moves an existing path to the front without duplicating it', () => {
    const projectA = path.join(tempRoot, 'project-a')
    const projectB = path.join(tempRoot, 'project-b')
    fs.mkdirSync(projectA, { recursive: true })
    fs.mkdirSync(projectB, { recursive: true })

    saveRecentProject(projectA)
    saveRecentProject(projectB)
    saveRecentProject(projectA)

    const recentProjects = loadRecentProjects()
    expect(recentProjects.map((project) => project.path)).toEqual([
      path.resolve(projectA),
      path.resolve(projectB),
    ])
    expect(fs.existsSync(getRecentProjectsPath())).toBe(true)
  })

  test('filters paths that no longer exist', () => {
    const existingProject = path.join(tempRoot, 'existing')
    const removedProject = path.join(tempRoot, 'removed')
    fs.mkdirSync(existingProject, { recursive: true })
    fs.mkdirSync(removedProject, { recursive: true })
    saveRecentProject(existingProject)
    saveRecentProject(removedProject)
    fs.rmSync(removedProject, { recursive: true, force: true })

    expect(loadRecentProjects().map((project) => project.path)).toEqual([
      path.resolve(existingProject),
    ])
  })
})
