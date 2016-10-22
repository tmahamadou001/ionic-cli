export * from './definitions';

export { isAPIResponseSuccess, isAPIResponseError } from './lib/http';

import * as inquirer from 'inquirer';
import * as minimist from 'minimist';
import * as chalk from 'chalk';

import { SuperAgentError } from './definitions';

import getCommands from './commands';
import { Client, formatError as formatSuperAgentError } from './lib/http';
import { metadataToMinimistOptions, Command, CommandMap, CommandMetadata } from './lib/command';
import { Config } from './lib/config';
import { Project } from './lib/project';
import { Session } from './lib/session';
import { Logger } from './lib/utils/logger';
import { promisify } from './lib/utils/promisify';
import { TASKS, Task, TaskChain } from './lib/utils/task';

export {
  Command as Command,
  CommandMap as CommandMap,
  CommandMetadata as CommandMetadata,
  Task as Task,
  TaskChain as TaskChain,
  promisify as promisify
}

const defaultCommand = 'help';

function cleanup() {
  for (let task of TASKS) {
    if (task.running) {
      task.fail();
    }

    task.clear();
  }
}

function isSuperAgentError(e: Error): e is SuperAgentError {
  let err: SuperAgentError = <SuperAgentError>e;
  return e && err.response && typeof err.response === 'object';
}

export async function run(pargv: string[], env: { [k: string]: string }) {

  // Check version?
  let argv = minimist(pargv.slice(2));
  const commands = getCommands();

  // Global CLI option setup
  const logLevel: string = argv['loglevel'] || 'warn';

  const log = new Logger({ level: logLevel, prefix: '' });
  const config = new Config(env);
  const c = await config.load();

  const client = new Client(c.urls.api);
  const project = new Project('.');
  const session = new Session(config, client);

  let [inputs, command] = commands.resolve(argv._);
  const options = metadataToMinimistOptions(command.metadata);
  argv = minimist(pargv.slice(2), options);
  argv._ = inputs;

  if (!command) {
    command = commands.get(defaultCommand);

    if (!command) {
      throw 'Missing default command.';
    }
  }

  let err: Error | undefined;

  try {
    await command.execute({
      argv,
      commands,
      client,
      config,
      log,
      modules: {
        inquirer
      },
      project,
      session
    });
  } catch (e) {
    err = e;
  }

  cleanup();

  if (err) {
    if (isSuperAgentError(err)) {
      console.error(formatSuperAgentError(err));
    } else {
      console.error(err);
    }
  }

  await config.save();
}
