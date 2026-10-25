import { jobToolsDeclarations, executeJobTool } from './jobTools.js';
import { cvToolsDeclarations, executeCvTool } from './cvTools.js';
import { actionToolsDeclarations, executeActionTool } from './actionTools.js';
import { qaToolsDeclarations, executeQaTool } from './qaTools.js';

// All tool declarations grouped
export const allToolsDeclarations = [
  ...jobToolsDeclarations,
  ...cvToolsDeclarations,
  ...actionToolsDeclarations,
  ...qaToolsDeclarations,
];

// Tool dispatcher
export async function executeTool(name, args = {}, context = {}) {
  // Check Job tools (Group A)
  if (jobToolsDeclarations.some((t) => t.name === name)) {
    return await executeJobTool(name, args, context);
  }

  // Check CV & Career tools (Group B)
  if (cvToolsDeclarations.some((t) => t.name === name)) {
    return await executeCvTool(name, args, context);
  }

  // Check Action tools (Group C)
  if (actionToolsDeclarations.some((t) => t.name === name)) {
    return await executeActionTool(name, args, context);
  }

  // Check QA & Info tools (Group D)
  if (qaToolsDeclarations.some((t) => t.name === name)) {
    return await executeQaTool(name, args, context);
  }

  throw new Error(`Tool "${name}" is not recognized in any agent group.`);
}

export default {
  allToolsDeclarations,
  executeTool,
};
