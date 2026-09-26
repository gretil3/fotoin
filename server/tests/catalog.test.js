import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  BRIEF_QUESTIONS,
  BRIEF_VERSION,
  CATEGORIES,
  MARKETPLACES,
  PACKS,
  getBriefQuestions,
  getPack,
  getStyle,
} from '../src/data/catalog.js';

describe('catalog integrity', () => {
  test('covers the four target UMKM verticals', () => {
    assert.deepEqual(
      CATEGORIES.map((category) => category.id).sort(),
      ['fashion-muslim', 'kerajinan', 'kosmetik', 'kuliner'],
    );
  });

  test('every category has a default white-studio style plus alternatives', () => {
    for (const category of CATEGORIES) {
      const defaults = category.styles.filter((style) => style.default);
      assert.equal(defaults.length, 1, `${category.id} must have exactly one default style`);
      assert.equal(defaults[0].id, 'studio-putih');
      assert.ok(category.styles.length >= 5, `${category.id} should offer at least 5 styles`);
    }
  });

  test('style ids are unique within a category', () => {
    for (const category of CATEGORIES) {
      const ids = category.styles.map((style) => style.id);
      assert.equal(new Set(ids).size, ids.length, `${category.id} has duplicate style ids`);
    }
  });

  test('the premium pack can reach every marketplace', () => {
    assert.ok(getPack('premium').maxMarketplaces >= MARKETPLACES.length);
  });

  test('pricing stays inside the Rp15.000-Rp25.000 band', () => {
    for (const pack of PACKS) {
      assert.ok(
        pack.priceIdr >= 15000 && pack.priceIdr <= 25000,
        `${pack.id} priced outside the UMKM band`,
      );
    }
  });

  test('packs grow monotonically with price', () => {
    const sorted = [...PACKS].sort((a, b) => a.priceIdr - b.priceIdr);
    for (let i = 1; i < sorted.length; i += 1) {
      assert.ok(sorted[i].photoCount > sorted[i - 1].photoCount);
      assert.ok(sorted[i].maxStyles >= sorted[i - 1].maxStyles);
      assert.ok(sorted[i].turnaroundHours <= sorted[i - 1].turnaroundHours);
    }
  });

  test('marketplace outputs declare concrete pixel dimensions', () => {
    for (const marketplace of MARKETPLACES) {
      assert.ok(marketplace.outputs.length > 0);
      for (const output of marketplace.outputs) {
        assert.ok(Number.isInteger(output.width) && output.width >= 700);
        assert.ok(Number.isInteger(output.height) && output.height >= 700);
        assert.ok(output.label);
      }
    }
  });

  test('getStyle scopes lookups to the category', () => {
    assert.ok(getStyle('kuliner', 'meja-kayu'));
    assert.equal(getStyle('kosmetik', 'meja-kayu'), null);
    assert.equal(getStyle('tidak-ada', 'studio-putih'), null);
  });
});

describe('brief questions', () => {
  test('every question is well formed and its default is a real option', () => {
    const ids = BRIEF_QUESTIONS.map((question) => question.id);
    assert.equal(new Set(ids).size, ids.length, 'question ids are unique');
    assert.ok(Number.isInteger(BRIEF_VERSION) && BRIEF_VERSION >= 1);

    for (const category of CATEGORIES) {
      for (const question of getBriefQuestions(category.id)) {
        const where = `${category.id}/${question.id}`;
        assert.ok(question.label, `${where} needs a Bahasa label`);
        assert.ok(['single', 'multi'].includes(question.type), `${where} has an unknown type`);
        assert.ok(question.options.length >= 2, `${where} needs options to tap`);

        const optionIds = question.options.map((option) => option.id);
        assert.equal(new Set(optionIds).size, optionIds.length, `${where} has duplicate option ids`);

        const defaults =
          question.type === 'single' ? [question.default].filter(Boolean) : question.default;
        assert.ok(Array.isArray(defaults), `${where} multi default must be an array`);
        for (const id of defaults) {
          assert.ok(optionIds.includes(id), `${where} default "${id}" is not one of its options`);
        }
        if (question.max) assert.ok(defaults.length <= question.max, `${where} default exceeds max`);
      }
    }
  });

  test('every option says what it adds to the prompt, or null for "leave it to us"', () => {
    for (const category of CATEGORIES) {
      for (const question of getBriefQuestions(category.id)) {
        for (const option of question.options) {
          const where = `${category.id}/${question.id}/${option.id}`;
          assert.ok(option.label, `${where} needs a Bahasa label`);
          assert.ok(
            option.prompt === null || (typeof option.prompt === 'string' && option.prompt.length > 5),
            `${where} must have a prompt fragment or an explicit null`,
          );
        }
      }
    }
  });

  test('each category offers its own product types, with an "other" escape hatch', () => {
    for (const category of CATEGORIES) {
      const types = category.productTypes || [];
      assert.ok(types.filter((type) => type.prompt).length >= 3, `${category.id} needs product types`);
      assert.ok(
        types.some((type) => type.id === 'lainnya' && type.prompt === null),
        `${category.id} needs "Lainnya" for products that fit no type`,
      );
    }
  });
});
