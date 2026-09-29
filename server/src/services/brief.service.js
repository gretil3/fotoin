/**
 * The seller brief: FOTOIN's replacement for a prompt.
 *
 * A seller answers a few questions by tapping (stored as option ids) and may
 * add their own words in `product.notes`. Only option ids defined in
 * catalog.js are accepted, so the only prompt text that can ever come from a
 * tap is text we wrote ourselves. The free text is kept apart from the answers
 * and must be treated as a description of the product, never as instructions.
 */
import { BRIEF_QUESTIONS, BRIEF_VERSION, CATEGORIES, getBriefQuestions } from '../data/catalog.js';
import { ApiError } from '../utils/api-error.js';
import { DROP_REASONS, resolveRefinement } from './refine.service.js';

const invalid = (message, code) => new ApiError(422, message, { code });

/**
 * Validates a brief and fills in the default for every question the seller
 * left alone, so tapping straight through the step is always a valid order.
 *
 * `usedText` is derived here from the notes rather than read from the client,
 * so the pilot comparison (answers only vs. answers + own words) cannot be
 * skewed by a modified request.
 *
 * @param {string} categoryId an already-validated category id
 * @param {{answers?: object} | null | undefined} input as sent by the client
 * @param {string | null | undefined} notes the seller's free text
 * @returns {{version: number, answers: object, usedText: boolean}}
 */
export const normalizeBrief = (categoryId, input, notes) => {
  const questions = getBriefQuestions(categoryId);
  const raw = input?.answers || {};

  const unknownQuestion = Object.keys(raw).find((id) => !questions.some((q) => q.id === id));
  if (unknownQuestion) {
    throw invalid(`Pertanyaan "${unknownQuestion}" tidak dikenal.`, 'UNKNOWN_BRIEF_QUESTION');
  }

  const answers = {};
  for (const question of questions) {
    const value = raw[question.id];
    const allowed = new Set(question.options.map((option) => option.id));
    const badOption = (id) =>
      invalid(
        `Pilihan "${id}" tidak tersedia untuk pertanyaan "${question.label}".`,
        'UNKNOWN_BRIEF_OPTION',
      );

    if (question.type === 'single') {
      if (value === undefined || value === null || value === '') {
        answers[question.id] = question.default;
      } else if (typeof value !== 'string' || !allowed.has(value)) {
        throw badOption(value);
      } else {
        answers[question.id] = value;
      }
      continue;
    }

    // Multi-select. Missing means "not touched" and takes the default; an empty
    // array is a deliberate choice (e.g. unticking every pre-ticked box) and is kept.
    if (value === undefined || value === null) {
      answers[question.id] = [...question.default];
      continue;
    }
    if (!Array.isArray(value)) throw badOption(value);
    const picked = [...new Set(value)];
    const bad = picked.find((id) => typeof id !== 'string' || !allowed.has(id));
    if (bad !== undefined) throw badOption(bad);
    if (question.max && picked.length > question.max) {
      throw invalid(`Pilih maksimal ${question.max} untuk "${question.label}".`, 'TOO_MANY_BRIEF_OPTIONS');
    }
    answers[question.id] = picked;
  }

  return { version: BRIEF_VERSION, answers, usedText: Boolean(notes?.trim()) };
};

/**
 * The seller's answers as Bahasa labels, for the order page and the reviewer
 * console. Returns null for orders placed before the brief existed.
 *
 * `ignored` lists the parts of the seller's own words that were left out of the
 * prompt, each with the reason in Bahasa, so neither the seller nor the reviewer
 * is surprised that "tambahkan logo toko" did not happen.
 * @returns {{
 *   usedText: boolean,
 *   items: Array<{id: string, question: string, answers: string[]}>,
 *   ignored: Array<{text: string, reason: string}>
 * } | null}
 */
export const describeBrief = (order) => {
  if (!order.brief) return null;
  const questions = getBriefQuestions(order.product.categoryId);
  return {
    usedText: Boolean(order.brief.usedText),
    items: questions.map((question) => {
      const value = order.brief.answers?.[question.id];
      const ids = Array.isArray(value) ? value : value ? [value] : [];
      return {
        id: question.id,
        question: question.label,
        answers: ids.map((id) => question.options.find((option) => option.id === id)?.label || id),
      };
    }),
    ignored: resolveRefinement(order).dropped.map((item) => ({
      text: item.text,
      reason: DROP_REASONS[item.reason] || DROP_REASONS.instruction,
    })),
  };
};

const withoutPrompt = ({ prompt: _hidden, ...rest }) => rest;

/**
 * Categories safe to send to the browser. Prompt fragments are how FOTOIN gets
 * its results; they stay on the server, for the category itself as well as its
 * product types and styles.
 */
export const publicCategories = () =>
  CATEGORIES.map(({ prompt: _hidden, ...category }) => ({
    ...category,
    productTypes: (category.productTypes || []).map(withoutPrompt),
    styles: category.styles.map(withoutPrompt),
  }));

/** Brief questions safe to send to the browser (labels and defaults, no prompts). */
export const publicBriefQuestions = () =>
  BRIEF_QUESTIONS.map((question) =>
    question.options ? { ...question, options: question.options.map(withoutPrompt) } : question,
  );

export default { normalizeBrief, describeBrief, publicCategories, publicBriefQuestions };
