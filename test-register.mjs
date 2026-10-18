// App tests import TypeScript files that omit the ".ts" extension.
import { registerHooks } from "node:module";

// Test files are loaded as ES modules, which require a file extension.
// Source files import each other without one (`../services/db`). This
// resolves those relative imports to the .ts file before Node looks them up.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[mc]?[jt]s$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});
