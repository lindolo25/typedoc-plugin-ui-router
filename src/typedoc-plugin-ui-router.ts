import * as fs from 'fs';
import * as td from 'typedoc';
import { Navigation } from "./abstractions";

/**
 * ## typedoc-plugin-ui-router
 * ### What
 * A plugin for [Typedoc](http://typedoc.org)
 * Customizes some stuff for the [UI-Router](https://ui-router.github.io/) documentation.
 * - Avoids "globals" module in favor of the index page
 * - Renames "External Modules" to "Modules" because "external modules" is confusing for a docs page
 * - Renames "Globals" nav item to "Subsystems" (configurable through command line argument `--navigation-label-globals`)
 * - Renames "Internals" nav item to "Public API" (configurable through command line argument `--navigation-label-internals`)
 * - Renames "Externals" nav item to "Internal UI-Router API" (configurable through command line argument `--navigation-label-externals`)
 */
export function load(app: td.Application) {
  const navigation = _loadNavigation();
  (app.converter as any).on(td.Converter.EVENT_RESOLVE, _converterResolveEventHandler);
  (app.renderer as any).on(td.Renderer.EVENT_BEGIN, _rendererBeginEventHandler);
  app.renderer.hooks.on('head.begin', _rendererHeadBeginHookHandler);
  app.renderer.hooks.on('footer.end', _rendererFooterEndHookHandler);
  app.renderer.removeTheme("default");
  app.renderer.defineTheme(
    "default",
    class CustomNavigationTheme extends td.DefaultTheme {
      public override buildNavigation(project: td.Models.ProjectReflection): td.NavigationElement[] {
        return _buildCustomNavigation.call(this, project, navigation);
      }
    }
  );
}

/**
 * @internal
 * @param fileDir defaults to "package.json"
 * @returns Navigation configuration form package.json file.
 * @throws Doesn't exists error.
 * @throws Doesn't contains navigation error.
 */
export function _loadNavigation(fileDir: string = "package.json"): Navigation {
  if (!fs.existsSync(fileDir)) throw new Error(`${process.cwd()}/${fileDir} doesn't exist`);
  const config = JSON.parse(fs.readFileSync(fileDir).toString()).docgen || {};
  const navigation: Navigation = config.navigation;
  if (!navigation || Object.keys(navigation).length === 0)
    throw new Error(`${process.cwd()}/${fileDir} doesn't contain a navigation object`);
  return navigation;
}

/**
 * @internal
 * @returns Handler function for Converter RESOLVE event.
 */
export function _converterResolveEventHandler(context: td.Context) {
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
}

/**
 * @internal
 * @param project Project refelction reference.
 * @param nav Navigation configuration retreived from package.json file.
 * @returns Navigation elemenst array used by Theme to build the Docs navigation.
 */
export function _buildCustomNavigation(this: td.DefaultTheme, project: td.Models.ProjectReflection, nav: Navigation): td.NavigationElement[] {
  return Object.entries(nav)
    .reduce(
      (acc, [key, value]) => {
        const navigationGroup: td.NavigationElement = { text: key, children: [] }
        if (!Array.isArray(value) || value.length < 1) return acc;
        acc.push(navigationGroup);
        value.forEach((item: string) => {
          if (typeof item != "string") return;
          const matchedReflection: td.Reflection = project.getChildByName(item);
          if (!matchedReflection || !this.router?.hasOwnDocument(matchedReflection)) return;
          navigationGroup.children.push({
            text: matchedReflection.name,
            path: this.router.getFullUrl(matchedReflection),
            kind: matchedReflection.kind & td.ReflectionKind.Project ? undefined : matchedReflection.kind,
            class: _classNames({ deprecated: matchedReflection.isDeprecated() }, this.getReflectionClasses(matchedReflection)),
          });
        });
        return acc;
      },
      [] as td.NavigationElement[]
    );
}

function _classNames(names: Record<string, boolean | null | undefined>, extraCss?: string) {
  const css = Object.keys(names)
    .filter((key) => names[key])
    .concat(extraCss || "")
    .join(" ")
    .trim()
    .replace(/\s+/g, " ");
  return css.length ? css : undefined;
}

/**
 * @internal
 * @returns Handler function for Renderer BEGIN event.
 */
export function _rendererBeginEventHandler(rendererEvent: td.RendererEvent) {
  // Why can't I find by ReflectionKind.Global?
  const externalModules = rendererEvent.project.getReflectionsByKind(td.ReflectionKind.Module);
  externalModules
    .map(_findGlobalReflection)
    .filter((x) => !!x)
    .reduce((acc, item) => (acc.includes(item) ? acc : acc.concat(item)), [])
    .forEach((global) => (global.url = 'index.html'));
}

/**
 * Make all links to the "Globals" reflection point to the index.html
 * Effectively replaces the "Globals" page with the index page.
 */
function _findGlobalReflection(ref: td.Reflection) {
  if (!ref) return undefined;
  if (ref.kind === td.ReflectionKind.Project) return ref;
  return _findGlobalReflection(ref.parent);
}

export function _rendererHeadBeginHookHandler() {
  return td.JSX.createElement(
    'script',
    null,
    td.JSX.createElement(td.JSX.Raw, {
      html: "localStorage.setItem('tsd-theme', localStorage.getItem('tsd-theme') || 'light');",
    }),
  )
}

export function _rendererFooterEndHookHandler() {
  return td.JSX.createElement(
    'style',
    null,
    td.JSX.createElement(td.JSX.Raw, { html: '.tsd-theme-toggle { display: none !important; } .tsd-page-toolbar { position: static !important; }' }),
  )
}