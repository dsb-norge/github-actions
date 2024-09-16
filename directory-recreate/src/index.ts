import * as core from '@actions/core';
import * as fs from 'fs';

async function run() {
  try {
    const directory = core.getInput('directory') || process.env.GITHUB_WORKSPACE;
    const recreate = core.getInput('recreate') !== 'false';

    if (!directory) {
      throw new Error('Directory is not specified and GITHUB_WORKSPACE is not set.');
    }

    core.startGroup('List directory contents before cleanup');
    if (!fs.existsSync(directory)) {
      core.info(`The directory "${directory}" does not exist, nothing to delete.`);
      core.endGroup();
    } else {
      fs.readdirSync(directory).forEach(file => {
        core.info(file);
      });
      core.endGroup();

      core.startGroup('Perform Delete');
      core.info(`Deleting directory: "${directory}"`);
      fs.rmSync(directory, { recursive: true, force: true });
      core.endGroup();

      core.startGroup("List directory contents after cleanup");
      core.info(`Listing directory: "${directory}"`);
      if (!fs.existsSync(directory)) {
        core.info(`The directory "${directory}" does not exist.`);
      } else if (fs.readdirSync(directory).length === 0) {
        core.info(`The directory "${directory}" is empty.`);
      } else {
        fs.readdirSync(directory).forEach(file => {
          core.info(file);
        });
      }
    }

    if (recreate) {
      core.startGroup('Create directory');
      core.info(`Creating directory: "${directory}"`);
      fs.mkdirSync(directory, { recursive: true, mode: 0o755 });
      core.endGroup();
    }
  } catch (error) {
    core.setFailed((error as Error).message);
  }
}

run();
