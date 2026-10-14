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
    const r = tagItem(kb, {
      name: 'Grilled Beef Salad (Nam Tok)',
      description: 'Sliced grilled steak with lime, chili, mint and toasted rice powder',
    });
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
    expect(tagItem(kb, { name: 'Mapo Tofu', description: 'Silken tofu and minced pork in chili bean sauce' }).tags.proteins).not.toContain(
      'vegetarian',
    );
    expect(tagItem(kb, { name: 'Tom Yum Shrimp', description: 'Hot and sour soup with mushrooms' }).tags.proteins).not.toContain(
      'vegetarian',
    );
    expect(tagItem(kb, { name: 'Chana Masala', description: 'Chickpeas in tomato gravy' }).tags.proteins).toContain('vegetarian');
  });

  it.each<[string, string | undefined]>([
    ['Veggie Burger', 'Black bean patty, lettuce, tomato, brioche bun'],
    ['Vegan Fish Tacos', 'Beer-battered hearts of palm, slaw, lime crema'],
    ['Plant-Based Smash Burger', 'Two patties, American cheese, pickles'],
    ['Vegan Fried Chicken', 'Crispy soy cutlet'],
    ['Plant Based Chicken Sandwich', 'Crispy seitan cutlet, pickles, mayo'],
    ['Vegetarian Bun Bo Hue', 'Lemongrass broth, rice noodles, tofu'],
    ['Veggie Double Cheeseburger', undefined],
  ])('a marker in the name keeps %s vegetarian and drops the meat the name implied', (name, description) => {
    expect(tagItem(kb, { name, description }).tags.proteins).toEqual(['vegetarian']);
  });

  it('keeps the archetype and scores of a marker-modified dish', () => {
    const r = tagItem(kb, { name: 'Veggie Burger' });
    expect(r.tags.archetypeId).toBe('burger');
    expect(r.scores.handheld).toBe(1);
    expect(r.tags.carbs).toContain('bread');
  });

  it.each<[string, string | undefined]>([
    // A negated or hedged marker is not a marker.
    ['Non-Vegetarian Chicken Biryani', undefined],
    ['Non Vegetarian Chicken Biryani', undefined],
    ['Not Vegan Chicken Curry', undefined],
    ['Vegan-friendly Chicken Wings', undefined],
    ['Vegan Option Chicken Curry', undefined],
    ['Veggie-style Chicken Bowl', undefined],
    // Anything but a plain space, and words such as "w", "add" or "half", end a marker's reach.
    ['Veggie, Chicken Skewers', undefined],
    ['Vegan: Chicken Wings', undefined],
    ['Vegan "Chicken" Wings', 'Cauliflower, buffalo sauce'],
    ['Veggie w Chicken', undefined],
    ['Beef and Veggie Stir Fry', undefined],
    ['Steak & Veggie Kabobs', undefined],
    ['Veggie and Chicken Skewers', undefined],
    ['Half Veggie Half Sausage Pizza', undefined],
    // Another meat word anywhere in the name or description keeps the meat.
    ['Veggie Burger with Chicken', undefined],
    ['Veggie Burger - Add Sausage', undefined],
    ['Veggie Burger – Add Sausage', undefined],
    ['Veggie Burger — Add Sausage', undefined],
    ['Veggie Burger w ham', undefined],
    ['Vegan Fish Tacos shrimp', undefined],
    ['Veggie Burger or Classic Burger', undefined],
    ['Veggie Burger', 'Veggie patty add beef'],
    ['Veggie Burger', 'Add a beef patty for $3'],
    // A dish word between the marker and the meat means the marker modifies that dish, not the meat.
    ['Veggie Ramen Chashu', undefined],
    // Only known modifiers ("fried", "crispy", "double") may sit between the marker and the meat.
    ['Veggie Supreme Chicken Pizza', undefined],
    ['Veggie Lovers Meat Pizza', undefined],
    // Markers in the description never override the name.
    ['Fish Tacos', 'Vegan, made with hearts of palm'],
    ['Burrito', 'Vegetarian? Ask for no chorizo'],
    ['Pizza', 'Vegan cheese available on request — Italian sausage, peppers'],
    ['Pho', 'Vegetarian broth beef brisket'],
    ['Tacos', 'Vegan chicken, salsa verde'],
    // A name marker reaches only meat in the name.
    ['Vegan Bowl', 'Chicken, rice and greens'],
    // Meat words beyond the protein patterns that name a dish.
    ['Veggie Burger with Bacon', undefined],
    ['Veggie Burger, Bacon', undefined],
    ['Veggie Burger', 'Topped with bacon and cheddar'],
    ['Vegan Burger', 'Add bacon +$2'],
    ['Plant-Based Burger', 'Smoked bacon, pickles'],
    ['Veggie Burger with Turkey', undefined],
    ['Veggie Burger with Lamb', undefined],
    ['Veggie Pizza', 'Peppers, onions, pepperoni'],
    ['Vegan Caesar', 'Romaine, anchovy dressing'],
    ['Vegetable Duck Curry', undefined],
    ['Veggie Burger with Bratwurst', undefined],
    ['Veggie Burger', 'Topped with foie gras'],
    ['Vegan Hot Dog', 'Served with a beef frank'],
  ])('keeps the meat in %s (%s)', (name, description) => {
    const proteins = tagItem(kb, { name, description }).tags.proteins;
    expect(proteins).not.toContain('vegetarian');
    expect(proteins.length).toBeGreaterThan(0);
  });

  it('does not treat ingredient vegetables as a marker', () => {
    const r = tagItem(kb, { name: 'Vegetable Beef Soup' });
    expect(r.tags.proteins).toContain('beef');
    expect(r.tags.proteins).not.toContain('vegetarian');
  });

  it('does not tag a negated marker as vegetarian', () => {
    expect(tagItem(kb, { name: 'Non-Vegetarian Thali' }).tags.proteins).not.toContain('vegetarian');
  });

  it('reads the marker words from the knowledge base', () => {
    expect(tagItem(kb, { name: 'Meatless Burger' }).tags.proteins).toEqual(['beef']);
    const lexicon = kb.lexicon.map((e) =>
      e.proteins.includes('vegetarian') && new RegExp(e.pattern).test('vegetarian')
        ? { ...e, pattern: e.pattern.replace('vegetarian', 'vegetarian|meatless') }
        : e,
    );
    expect(tagItem({ ...kb, lexicon }, { name: 'Meatless Burger' }).tags.proteins).toEqual(['vegetarian']);
  });
});
