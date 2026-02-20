import * as p from '@clack/prompts';
import pc from 'picocolors';
import { readLocalLock, type LocalSkillLockEntry } from './local-lock.ts';
import { runAdd, parseAddOptions } from './add.ts';
import { runSync, parseSyncOptions } from './sync.ts';

/**
 * Install all skills from the local skills-lock.json.
 * Groups skills by source and calls `runAdd` for each group.
 * node_modules skills are handled via experimental_sync.
 */
export async function runInstallFromLock(args: string[]): Promise<void> {
  const cwd = process.cwd();
  const lock = await readLocalLock(cwd);
  const skillEntries = Object.entries(lock.skills);

  if (skillEntries.length === 0) {
    p.log.warn('No skills found in skills-lock.json');
    p.log.info(`Run ${pc.cyan('npx skills add <package>')} to add skills`);
    return;
  }

  // Parse options from args (pass through -a, -y, etc.)
  const { options: addOptions } = parseAddOptions(args);

  // Separate node_modules skills from remote skills
  const nodeModuleSkills: string[] = [];
  const bySource = new Map<string, { sourceType: string; skills: string[] }>();

  for (const [skillName, entry] of skillEntries) {
    if (entry.sourceType === 'node_modules') {
      nodeModuleSkills.push(skillName);
      continue;
    }

    const existing = bySource.get(entry.source);
    if (existing) {
      existing.skills.push(skillName);
    } else {
      bySource.set(entry.source, {
        sourceType: entry.sourceType,
        skills: [skillName],
      });
    }
  }

  const totalSources = bySource.size + (nodeModuleSkills.length > 0 ? 1 : 0);
  p.log.info(
    `Restoring ${pc.cyan(String(skillEntries.length))} skill${skillEntries.length !== 1 ? 's' : ''} from skills-lock.json`
  );

  // Install remote skills grouped by source
  for (const [source, { skills }] of bySource) {
    try {
      await runAdd([source], {
        ...addOptions,
        skill: skills,
        yes: true,
      });
    } catch (error) {
      p.log.error(
        `Failed to install from ${pc.cyan(source)}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Handle node_modules skills via sync
  if (nodeModuleSkills.length > 0) {
    p.log.info(
      `${pc.cyan(String(nodeModuleSkills.length))} skill${nodeModuleSkills.length !== 1 ? 's' : ''} from node_modules`
    );
    try {
      const { options: syncOptions } = parseSyncOptions(args);
      await runSync(args, { ...syncOptions, yes: true });
    } catch (error) {
      p.log.error(
        `Failed to sync node_modules skills: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
