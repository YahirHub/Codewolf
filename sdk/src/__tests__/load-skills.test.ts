import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import os from 'os'
import path from 'path'

import {
  SKILL_FILE_NAME,
  SKILL_NAME_MAX_LENGTH,
} from '@codebuff/common/constants/skills'

import { loadSkills, parseSkillFileContent } from '../skills/load-skills'

const writeSkill = ({
  skillsRoot,
  skillDirName,
  frontmatterName = skillDirName,
  description = `Description for ${skillDirName}`,
  body = `# ${skillDirName}\n`,
}: {
  skillsRoot: string
  skillDirName: string
  frontmatterName?: string
  description?: string
  body?: string
}): string => {
  const skillDir = path.join(skillsRoot, skillDirName)
  const skillFile = path.join(skillDir, SKILL_FILE_NAME)

  mkdirSync(skillDir, { recursive: true })
  writeFileSync(
    skillFile,
    [
      '---',
      `name: ${frontmatterName}`,
      `description: ${description}`,
      '---',
      '',
      body,
    ].join('\n'),
    'utf8',
  )

  return skillFile
}

describe('loadSkills', () => {
  let tempRoot: string
  let homeDir: string
  let projectDir: string

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'codebuff-sdk-load-skills-'))
    homeDir = path.join(tempRoot, 'home')
    projectDir = path.join(tempRoot, 'project')

    mkdirSync(homeDir, { recursive: true })
    mkdirSync(projectDir, { recursive: true })

    spyOn(os, 'homedir').mockReturnValue(homeDir)
  })

  afterEach(() => {
    mock.restore()
    rmSync(tempRoot, { recursive: true, force: true })
  })

  test('discovers global and project Codewolf skills', async () => {
    writeSkill({
      skillsRoot: path.join(homeDir, '.codewolf', 'skills'),
      skillDirName: 'global-skill',
    })
    writeSkill({
      skillsRoot: path.join(projectDir, '.codewolf', 'skills'),
      skillDirName: 'project-skill',
    })

    const skills = await loadSkills({ cwd: projectDir })

    expect(Object.keys(skills).sort()).toEqual([
      'global-skill',
      'project-skill',
    ])
    expect(skills['global-skill']?.filePath).toBe(
      path.join(homeDir, '.codewolf', 'skills', 'global-skill', 'SKILL.md'),
    )
    expect(skills['project-skill']?.description).toBe(
      'Description for project-skill',
    )
  })

  test('loads skills from an explicit skillsPath only', async () => {
    const explicitSkillsDir = path.join(tempRoot, 'custom-skills')

    writeSkill({
      skillsRoot: explicitSkillsDir,
      skillDirName: 'custom-skill',
      description: 'Loaded from explicit skillsPath',
    })
    writeSkill({
      skillsRoot: path.join(projectDir, '.codewolf', 'skills'),
      skillDirName: 'project-skill',
      description: 'Should be ignored when skillsPath is set',
    })

    const skills = await loadSkills({
      cwd: projectDir,
      skillsPath: explicitSkillsDir,
    })

    expect(Object.keys(skills)).toEqual(['custom-skill'])
    expect(skills['custom-skill']?.description).toBe(
      'Loaded from explicit skillsPath',
    )
  })

  test('project Codewolf skills override global skills with the same name', async () => {
    writeSkill({
      skillsRoot: path.join(homeDir, '.codewolf', 'skills'),
      skillDirName: 'shared-skill',
      description: 'global skill',
    })
    writeSkill({
      skillsRoot: path.join(projectDir, '.codewolf', 'skills'),
      skillDirName: 'shared-skill',
      description: 'project skill',
    })

    const skills = await loadSkills({ cwd: projectDir })

    expect(skills['shared-skill']?.description).toBe('project skill')
    expect(skills['shared-skill']?.filePath).toBe(
      path.join(projectDir, '.codewolf', 'skills', 'shared-skill', 'SKILL.md'),
    )
  })

  test('skips invalid skill directories and malformed skill definitions', async () => {
    const skillsRoot = path.join(projectDir, '.codewolf', 'skills')
    const consoleError = spyOn(console, 'error').mockImplementation(() => { })
    const consoleWarn = spyOn(console, 'warn').mockImplementation(() => { })

    mkdirSync(path.join(skillsRoot, 'missing-skill-file'), { recursive: true })

    const malformedDir = path.join(skillsRoot, 'malformed-frontmatter')
    mkdirSync(malformedDir, { recursive: true })
    writeFileSync(
      path.join(malformedDir, 'SKILL.md'),
      ['---', '{invalid yaml: [unclosed', '---'].join('\n'),
      'utf8',
    )

    writeSkill({
      skillsRoot,
      skillDirName: 'mismatch-dir',
      frontmatterName: 'different-name',
      description: 'Mismatched name',
    })

    const tooLongName = 'a'.repeat(SKILL_NAME_MAX_LENGTH + 1)
    writeSkill({
      skillsRoot,
      skillDirName: tooLongName,
      description: 'Too long',
    })

    writeSkill({
      skillsRoot,
      skillDirName: 'Uppercase-Skill',
      description: 'Uppercase invalid',
    })
    writeSkill({
      skillsRoot,
      skillDirName: 'special_skill',
      description: 'Special char invalid',
    })
    writeSkill({
      skillsRoot,
      skillDirName: 'valid-skill',
      description: 'Valid skill',
    })

    const skills = await loadSkills({ cwd: projectDir, verbose: true })

    expect(Object.keys(skills)).toEqual(['valid-skill'])
    expect(skills['valid-skill']?.description).toBe('Valid skill')

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid frontmatter in skill file'),
    )
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(
        "Skill name 'different-name' does not match directory name 'mismatch-dir'",
      ),
    )
    expect(consoleWarn).toHaveBeenCalledWith(
      `Skipping invalid skill directory name: ${tooLongName}`,
    )
    expect(consoleWarn).toHaveBeenCalledWith(
      'Skipping invalid skill directory name: Uppercase-Skill',
    )
    expect(consoleWarn).toHaveBeenCalledWith(
      'Skipping invalid skill directory name: special_skill',
    )
  })

  test('loads skills from skillsPath and bypasses default search roots', async () => {
    const customSkillsDir = path.join(tempRoot, 'custom-skills')
    mkdirSync(customSkillsDir, { recursive: true })

    // Put a skill in a default root that should NOT be found
    writeSkill({
      skillsRoot: path.join(projectDir, '.codewolf', 'skills'),
      skillDirName: 'default-skill',
      description: 'Should not be found',
    })

    // Put a skill in the custom directory that SHOULD be found
    writeSkill({
      skillsRoot: customSkillsDir,
      skillDirName: 'custom-skill',
      description: 'Found via skillsPath',
    })

    const skills = await loadSkills({
      cwd: projectDir,
      skillsPath: customSkillsDir,
    })

    expect(Object.keys(skills).sort()).toEqual(['custom-skill'])
    expect(skills['custom-skill']?.description).toBe('Found via skillsPath')
    expect(skills['custom-skill']?.filePath).toBe(
      path.join(customSkillsDir, 'custom-skill', 'SKILL.md'),
    )
  })
})

describe('parseSkillFileContent', () => {
  test('validates in-memory edits with the same rules as disk discovery', () => {
    const valid = [
      '---',
      'name: deploy',
      'description: Deploy safely',
      '---',
      '',
      '# Deploy',
    ].join('\n')
    expect(
      parseSkillFileContent(valid, {
        directoryName: 'deploy',
        filePath: '/skills/deploy/SKILL.md',
      }),
    ).toMatchObject({ name: 'deploy', description: 'Deploy safely', content: valid })
    expect(
      parseSkillFileContent(valid.replace('name: deploy', 'name: release'), {
        directoryName: 'deploy',
        filePath: '/skills/deploy/SKILL.md',
      }),
    ).toBeNull()
  })
})
