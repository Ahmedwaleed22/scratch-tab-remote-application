import type { IsEqual } from 'type-fest';
import type { LANGUAGE_BY_EXTENSION } from '../dev/frontend/src/config/syntax.js';
import type { WINDOW_MOVE_KEYS } from '../dev/frontend/src/config/windowLayout.js';
import type { languageFor } from '../dev/frontend/src/presenters/syntax.js';
import type { windowGeometry } from '../dev/frontend/src/adapters/windowGeometry.js';
import type { SyntaxLanguage } from '../dev/frontend/src/model/editor/application/syntax.js';
import type {
  EditorWindowBounds,
  EditorWindowGeometry,
} from '../dev/frontend/src/model/editor/application/window.js';
import type { Package } from '../dev/frontend/src/model/updates/api/releases.js';

type Expect<Condition extends true> = Condition;

// These fail compilation if public contracts widen or lose their optional cases.
export type FrontendTypeChecks = [
  Expect<IsEqual<typeof LANGUAGE_BY_EXTENSION, ReadonlyMap<string, SyntaxLanguage>>>,
  Expect<IsEqual<ReturnType<typeof languageFor>, SyntaxLanguage | null>>,
  Expect<IsEqual<(typeof WINDOW_MOVE_KEYS)[string], readonly [number, number] | undefined>>,
  Expect<
    IsEqual<ReturnType<ReturnType<typeof windowGeometry>['read']>, EditorWindowGeometry | null>
  >,
  Expect<IsEqual<Parameters<ReturnType<typeof windowGeometry>['write']>[0], EditorWindowBounds>>,
  Expect<IsEqual<Package['version'], string | undefined>>,
];
