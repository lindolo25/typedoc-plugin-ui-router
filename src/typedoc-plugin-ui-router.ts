import * as fs from 'fs';
import * as td from 'typedoc';
import { Navigation } from "./abstractions";

export function load(app: td.Application) {
  const CONFIG = `package.json`;
  if (!fs.existsSync(CONFIG)) {
    throw new Error(`${process.cwd()}/${CONFIG} doesn't exist`);
  }

  const config = JSON.parse(fs.readFileSync(CONFIG).toString()).docgen || {};
  const navigation: Navigation = config.navigation;
  if (!navigation || Object.keys(navigation).length === 0) {
    throw new Error(`${process.cwd()}/${CONFIG} doesn't contain a navigation object`);
  }

  (app.converter as any).on(td.Converter.EVENT_RESOLVE, (context: td.Context) => {
    // Remove the "References" section (re-exports --  revisit this when Typedoc library mode lands in 0.18.x)
    for (const reflection of context.project.getReflectionsByKind(td.ReflectionKind.Reference)) {
      context.project.removeReflection(reflection);
    }

    // Rename other included @uirouter modules to a nicer name, e.g., @uirouter/core/state/stateService
    for (const reflection of context.project.getReflectionsByKind(td.ReflectionKind.Module)) {
      if (
        reflection instanceof td.DeclarationReflection &&
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
      if (!reflection.kindOf(td.ReflectionKind.Module) && reflection instanceof td.DeclarationReflection) {
        reflection.sources?.forEach((source) => {
          source.fileName = source.fileName.replace(/^\/?(project\/)?(src\/includes\/)?/g, '');
        });
      }
    });
  });

  // building navigation using a Custom Theme.
  class CustomNavigationTheme extends td.DefaultTheme {

    public override buildNavigation(project: td.Models.ProjectReflection): td.NavigationElement[] {
      return this._buildCustomNavigation(project, navigation);
    }

    private _buildCustomNavigation(project: td.Models.ProjectReflection, nav: Navigation): td.NavigationElement[] {
      const menu = Object.entries(nav)
        .reduce(
          (acc, [key, value]) => {
            const navigationGroup: td.NavigationElement = { text: key, children: [] }
            acc.push(navigationGroup)
            if (!Array.isArray(value) || value.length < 1) return acc;
            value.forEach((item: string) => {
              if (typeof item != "string") return;
              const matchedReflection: td.Reflection = project.getChildByName(item);
              if (!matchedReflection || !this.router.hasOwnDocument(matchedReflection)) return;
              navigationGroup.children.push({
                text: matchedReflection.name,
                path: this.router.getFullUrl(matchedReflection),
              });
            });
            return acc;
          },
          [] as td.NavigationElement[]
        );
        return menu;
    }
  }

  app.renderer.defineTheme("ui-router-typedoc-navigation-theme", CustomNavigationTheme);
}
