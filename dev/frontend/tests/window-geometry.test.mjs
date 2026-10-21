import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureRoot } from './support/runtime.mjs';

test('window geometry is project-scoped and tolerates invalid or unavailable storage', async () => {
  const { windowGeometry } = await import(new URL('adapters/windowGeometry.js', fixtureRoot));
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map();
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
      },
    });
    const geometry = windowGeometry('one');
    assert.equal(geometry.read(), null);
    geometry.write({ left: 120, top: 90, width: 700, height: 450 });
    assert.deepEqual(windowGeometry('one').read(), {
      left: '120px',
      top: '90px',
      width: '700px',
      height: '450px',
    });
    assert.equal(windowGeometry('two').read(), null);
    for (const invalid of ['broken JSON', 'null', '{"left":0,"top":0,"width":2,"height":2}']) {
      values.set('scratch-tab:window-geometry:one', invalid);
      assert.equal(geometry.read(), null);
    }
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('Storage blocked');
      },
    });
    assert.equal(geometry.read(), null);
    assert.doesNotThrow(() => geometry.write({ left: 0, top: 0, width: 620, height: 420 }));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});
