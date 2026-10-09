import { describe, expect, it } from 'vitest';
import { loadBaseKb } from '../../src/core/kb';
import { LEXICON_CONFIDENT, tagItem } from '../../src/core/lexicon';

const kb = loadBaseKb();

describe('tagItem', () => {
  it('tags tom yum as a bright, spicy seafood soup', () => {
    const r = tagItem(kb, { name: 'Tom Yum Shrimp', description: 'Hot and sour soup with lemongrass, lime leaf and mushrooms' });
    expect(r.scores.brothy).toBeGreaterThanOrEqual(0.9);
    expect(r.scores.brightAcidic).toBeGreaterThanOrEqual(0.7);
    expect(r.scores.spicy).toBeGreaterThanOrEqual(0.6);
    expect(r.scores.carbHeavy ?? 0).toBeLessThanOrEqual(0.2);
    expect(r.tags.proteins).toContain('seafood');
    expect(r.tags.cuisine).toBe('thai');
    expect(r.tags.archetypeId).toBe('tom_yum');
    expect(r.confidence).toBeGreaterThanOrEqual(LEXICON_CONFIDENT);
  });

  it('tags a grilled beef salad as protein-forward and low starch', () => {
    const r = tagItem(kb, { name: 'Grilled Beef Salad (Nam Tok)', description: 'Sliced grilled steak with lime, chili, mint and toasted rice powder' });
    expect(r.tags.proteins).toContain('beef');
    expect(r.scores.proteinForward).toBeGreaterThanOrEqual(0.7);
    expect(r.scores.brightAcidic).toBeGreaterThanOrEqual(0.7);
    expect(r.scores.carbHeavy ?? 0).toBeLessThanOrEqual(0.3);
    expect(r.tags.archetypeId).toBe('thai_beef_salad');
  });

  it('tags a cheeseburger as rich, handheld and bready', () => {
    const r = tagItem(kb, { name: 'Double Cheeseburger', description: 'Two smashed patties, American cheese, pickles, brioche bun' });
    expect(r.scores.handheld).toBe(1);
    expect(r.scores.rich).toBeGreaterThanOrEqual(0.8);
    expect(r.tags.carbs).toContain('bread');
    expect(r.tags.proteins).toContain('beef');
    expect(r.tags.archetypeId).toBe('burger');
  });

  it('returns low confidence for an opaque name', () => {
    const r = tagItem(kb, { name: "Chef's Plate" });
    expect(r.hits).toEqual([]);
    expect(r.confidence).toBe(0);
    expect(r.tags.proteins).toEqual([]);
  });

  it('treats negated words literally but still reads the rest', () => {
    const r = tagItem(kb, { name: 'Pho Ga', description: 'Chicken noodle soup, no spice' });
    expect(r.tags.proteins).toContain('chicken');
    expect(r.scores.brothy).toBeGreaterThanOrEqual(0.9);
  });
});

describe('vegetarian tagging', () => {
  it('does not call a dish vegetarian when it names meat or seafood', () => {
    expect(tagItem(kb, { name: 'Mapo Tofu', description: 'Silken tofu and minced pork in chili bean sauce' }).tags.proteins).not.toContain('vegetarian');
    expect(tagItem(kb, { name: 'Tom Yum Shrimp', description: 'Hot and sour soup with mushrooms' }).tags.proteins).not.toContain('vegetarian');
    expect(tagItem(kb, { name: 'Chana Masala', description: 'Chickpeas in tomato gravy' }).tags.proteins).toContain('vegetarian');
  });
});
