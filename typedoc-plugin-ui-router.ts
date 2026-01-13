import * as fs from 'fs';
import {
  Application,
  DeclarationReflection,
  ReflectionKind,
} from 'typedoc';
import { Converter } from 'typedoc/dist/lib/converter';
import { Context } from 'typedoc';

// import './GithubPluginMonkeyPatch'; // Commented out as not needed for TypeDoc 0.28
import './handlebarsDebug';

interface Navigation {
  [sectionName: string]: Array<string | object>;
}

export function load(app: Application) {
  const CONFIG = `package.json`;
  if (!fs.existsSync(CONFIG)) {
    throw new Error(`${process.cwd()}/${CONFIG} doesn't exist`);
  }

  const config = JSON.parse(fs.readFileSync(CONFIG).toString()).docgen || {};
  const navigation: Navigation = config.navigation;
  if (!navigation || Object.keys(navigation).length === 0) {
    throw new Error(`${process.cwd()}/${CONFIG} doesn't contain a navigation object`);
  }

  (app.converter as any).on(Converter.EVENT_RESOLVE, (context: Context) => {
    // Remove the "References" section (re-exports --  revisit this when Typedoc library mode lands in 0.18.x)
    for (const reflection of context.project.getReflectionsByKind(ReflectionKind.Reference)) {
      context.project.removeReflection(reflection);
    }

    // Rename other included @uirouter modules to a nicer name, e.g., @uirouter/core/state/stateService
    for (const reflection of context.project.getReflectionsByKind(ReflectionKind.Module)) {
      if (
        reflection instanceof DeclarationReflection &&
        reflection.sources?.find((x) => x.fileName.includes('@uirouter'))
      ) {
        const match = new RegExp('"?(node_modules/)?(@uirouter/[^/]+)(/lib|/src)?(/.*?)(.d)?"?$').exec(reflection.name);
        if (match) {
          reflection.name = `${match[2]}${match[4]}`;
        }
      }
    }

    // Rename source file names of included @uirouter files, stripping of the prefixed /src
    Object.values(context.project.reflections).forEach((reflection) => {
      if (!reflection.kindOf(ReflectionKind.Module) && reflection instanceof DeclarationReflection) {
        reflection.sources?.forEach((source) => {
          source.fileName = source.fileName.replace(/^\/?(project\/)?(src\/includes\/)?/g, '');
        });
      }
    });
  });

  // Navigation and global link customization removed as not supported in TypeDoc 0.28+
}
