import type { KnowledgeBase } from '../src/core/kb/schema';
import { tagItem } from '../src/core/lexicon';
import type { RestaurantCandidatesInput } from '../src/core/pairs';
import type { ItemTags, MenuItem, RestaurantSummary, Scores } from '../src/core/types';

export interface FixtureItem {
  id: string;
  name: string;
  description?: string;
  priceCents: number;
  scores: Scores;
  tags?: Partial<ItemTags>;
}

export interface FixtureRestaurant {
  restaurant: RestaurantSummary;
  items: FixtureItem[];
}

const sf = (name: string, placeId: string, cuisine: string, rating: number, count: number): RestaurantSummary => ({
  placeId,
  name,
  cuisine,
  lat: 37.76,
  lng: -122.42,
  rating,
  userRatingCount: count,
  openNow: true,
  websiteUri: `https://example.com/${placeId}`,
  mapsUri: `https://maps.google.com/?q=${encodeURIComponent(name)}`,
});

export const FIXTURE_RESTAURANTS: FixtureRestaurant[] = [
  {
    restaurant: sf('Lotus Pho', 'lotus_pho', 'vietnamese', 4.4, 900),
    items: [
      { id: 'lotus_pho_tai', name: 'Pho Tai', description: 'Rare beef rice noodle soup with basil, lime and bean sprouts', priceCents: 1600, scores: { brothy: 0.95, comforting: 0.8, rich: 0.3, spicy: 0.3, brightAcidic: 0.5, savory: 0.8, fresh: 0.5, proteinForward: 0.6, carbHeavy: 0.5, adventurous: 0.2, handheld: 0, portion: 0.6 }, tags: { archetypeId: 'pho' } },
      { id: 'lotus_bun_bo_hue', name: 'Bun Bo Hue', description: 'Spicy lemongrass beef and pork noodle soup', priceCents: 1700, scores: { brothy: 0.95, spicy: 0.8, rich: 0.4, comforting: 0.7, savory: 0.85, proteinForward: 0.6, carbHeavy: 0.5, adventurous: 0.5, handheld: 0, portion: 0.6 } },
      { id: 'lotus_goi_cuon', name: 'Goi Cuon', description: 'Fresh shrimp and pork spring rolls with peanut sauce', priceCents: 900, scores: { fresh: 0.9, brightAcidic: 0.4, rich: 0.2, crispy: 0, handheld: 0.9, carbHeavy: 0.3, proteinForward: 0.5, portion: 0.3 } },
      { id: 'lotus_com_tam', name: 'Com Tam Suon', description: 'Broken rice plate with grilled pork chop and fried egg', priceCents: 1700, scores: { savory: 0.85, rich: 0.6, comforting: 0.8, carbHeavy: 0.85, proteinForward: 0.6, crispy: 0.4, portion: 0.8 }, tags: { carbs: ['rice'] } },
    ],
  },
  {
    restaurant: sf('Siam Kitchen', 'siam_kitchen', 'thai', 4.5, 1200),
    items: [
      { id: 'siam_tom_yum', name: 'Tom Yum Shrimp', description: 'Hot and sour soup with lemongrass, lime leaf and mushrooms', priceCents: 1400, scores: { brothy: 0.95, spicy: 0.6, brightAcidic: 0.9, rich: 0.2, fresh: 0.6, savory: 0.7, comforting: 0.6, proteinForward: 0.7, carbHeavy: 0.1, adventurous: 0.4, handheld: 0, portion: 0.4 } },
      { id: 'siam_beef_salad', name: 'Grilled Beef Salad (Nam Tok)', description: 'Sliced grilled steak with lime, chili, mint and toasted rice powder', priceCents: 1700, scores: { brightAcidic: 0.9, spicy: 0.6, savory: 0.9, fresh: 0.7, rich: 0.2, comforting: 0.4, brothy: 0, proteinForward: 0.9, carbHeavy: 0.1, adventurous: 0.4, handheld: 0, portion: 0.5 } },
      { id: 'siam_green_curry', name: 'Green Curry Chicken', description: 'Coconut green curry with bamboo shoots and Thai basil, served with jasmine rice', priceCents: 1600, scores: { rich: 0.8, spicy: 0.7, comforting: 0.7, savory: 0.8, brothy: 0.3, carbHeavy: 0.6, proteinForward: 0.5, adventurous: 0.2, handheld: 0, portion: 0.7 } },
      { id: 'siam_pad_see_ew', name: 'Pad See Ew', description: 'Wide rice noodles stir-fried with chicken, egg, Chinese broccoli and sweet soy', priceCents: 1500, scores: { savory: 0.8, comforting: 0.7, rich: 0.6, carbHeavy: 0.85, brothy: 0, proteinForward: 0.4, adventurous: 0.1, handheld: 0, portion: 0.7 } },
    ],
  },
  {
    restaurant: sf('Golden Wok', 'golden_wok', 'chinese', 4.2, 600),
    items: [
      { id: 'wok_beef_noodle_soup', name: 'Taiwanese Beef Noodle Soup', description: 'Braised beef shank in a spiced broth with wheat noodles and pickled mustard greens', priceCents: 1700, scores: { brothy: 0.95, comforting: 0.9, rich: 0.5, spicy: 0.4, savory: 0.9, brightAcidic: 0.3, proteinForward: 0.6, carbHeavy: 0.5, adventurous: 0.3, handheld: 0, portion: 0.8 } },
      { id: 'wok_mapo_tofu', name: 'Mapo Tofu', description: 'Silken tofu and minced pork in Sichuan chili bean sauce, with rice', priceCents: 1500, scores: { spicy: 0.9, rich: 0.6, savory: 0.9, comforting: 0.7, carbHeavy: 0.5, proteinForward: 0.5, adventurous: 0.5, handheld: 0, portion: 0.6 }, tags: { carbs: ['rice'] } },
      { id: 'wok_sp_squid', name: 'Salt and Pepper Squid', description: 'Crispy fried squid with garlic, scallion and chili', priceCents: 1600, scores: { crispy: 0.9, rich: 0.6, savory: 0.85, spicy: 0.4, proteinForward: 0.7, carbHeavy: 0.1, handheld: 0.5, portion: 0.5 } },
    ],
  },
  {
    restaurant: sf('Mission Mariscos', 'mission_mariscos', 'mexican', 4.6, 700),
    items: [
      { id: 'mariscos_ceviche', name: 'Ceviche de Pescado', description: 'Lime-cured snapper with tomato, onion, cilantro and avocado, served with tostadas', priceCents: 1600, scores: { fresh: 0.95, brightAcidic: 0.95, spicy: 0.4, rich: 0.1, savory: 0.5, proteinForward: 0.8, carbHeavy: 0.15, adventurous: 0.5, handheld: 0.3, portion: 0.4 } },
      { id: 'mariscos_aguachile', name: 'Aguachile Verde', description: 'Raw shrimp in lime, serrano and cucumber', priceCents: 1700, scores: { fresh: 0.95, brightAcidic: 0.95, spicy: 0.85, rich: 0.05, savory: 0.5, proteinForward: 0.8, carbHeavy: 0.05, adventurous: 0.7, handheld: 0, portion: 0.4 } },
      { id: 'mariscos_fish_tacos', name: 'Baja Fish Tacos', description: 'Beer-battered cod, cabbage slaw and chipotle crema on corn tortillas', priceCents: 1500, scores: { handheld: 0.9, fresh: 0.6, crispy: 0.7, brightAcidic: 0.5, rich: 0.5, savory: 0.7, proteinForward: 0.5, carbHeavy: 0.4, adventurous: 0.2, portion: 0.5 } },
      { id: 'mariscos_diabla', name: 'Camarones a la Diabla', description: 'Shrimp in a fiery red chile sauce with rice', priceCents: 1900, scores: { spicy: 0.9, rich: 0.5, savory: 0.85, proteinForward: 0.8, carbHeavy: 0.5, comforting: 0.5, adventurous: 0.4, handheld: 0, portion: 0.7 }, tags: { carbs: ['rice'] } },
    ],
  },
  {
    restaurant: sf('Burger Barn', 'burger_barn', 'american', 4.3, 1500),
    items: [
      { id: 'barn_double', name: 'Double Cheeseburger', description: 'Two smashed patties, American cheese, pickles, onion, special sauce, brioche bun', priceCents: 1500, scores: { rich: 0.9, comforting: 0.9, handheld: 1, savory: 0.9, crispy: 0.3, brightAcidic: 0.2, proteinForward: 0.6, carbHeavy: 0.5, adventurous: 0.05, brothy: 0, portion: 0.8 } },
      { id: 'barn_chicken', name: 'Crispy Chicken Sandwich', description: 'Buttermilk fried chicken thigh, slaw, pickles, potato bun', priceCents: 1400, scores: { crispy: 0.95, rich: 0.85, handheld: 1, comforting: 0.85, savory: 0.85, proteinForward: 0.6, carbHeavy: 0.5, adventurous: 0.05, portion: 0.8 } },
      { id: 'barn_fries', name: 'Fries', description: 'Skin-on fries with sea salt', priceCents: 500, scores: { crispy: 0.9, rich: 0.6, carbHeavy: 0.9, comforting: 0.7, proteinForward: 0, handheld: 0.8, portion: 0.3 }, tags: { proteins: ['vegetarian'] } },
    ],
  },
  {
    restaurant: sf("Philly's Finest", 'phillys_finest', 'american', 4.1, 400),
    items: [
      { id: 'philly_classic', name: 'Classic Cheesesteak', description: 'Thin-sliced ribeye, grilled onions and melted provolone on an Amoroso roll', priceCents: 1600, scores: { rich: 0.9, comforting: 0.9, handheld: 1, savory: 0.9, proteinForward: 0.7, carbHeavy: 0.5, adventurous: 0.05, brothy: 0, portion: 0.9 } },
    ],
  },
  {
    restaurant: sf('Taqueria El Sol', 'taqueria_el_sol', 'mexican', 4.5, 2000),
    items: [
      { id: 'sol_asada_tacos', name: 'Carne Asada Tacos', description: 'Three grilled steak tacos with onion, cilantro and salsa verde', priceCents: 1300, scores: { handheld: 1, savory: 0.8, brightAcidic: 0.4, rich: 0.4, comforting: 0.6, proteinForward: 0.7, carbHeavy: 0.4, adventurous: 0.1, brothy: 0, portion: 0.6 } },
      { id: 'sol_pastor_burrito', name: 'Al Pastor Burrito', description: 'Marinated pork, rice, beans, cheese and salsa in a flour tortilla', priceCents: 1400, scores: { handheld: 1, rich: 0.7, carbHeavy: 0.85, comforting: 0.8, savory: 0.8, proteinForward: 0.5, adventurous: 0.05, portion: 0.95 } },
      { id: 'sol_pozole', name: 'Pozole Rojo', description: 'Pork and hominy soup in red chile broth with cabbage, radish and lime', priceCents: 1500, scores: { brothy: 0.9, comforting: 0.9, spicy: 0.6, rich: 0.4, savory: 0.85, brightAcidic: 0.4, proteinForward: 0.5, carbHeavy: 0.4, adventurous: 0.4, handheld: 0, portion: 0.7 } },
    ],
  },
  {
    restaurant: sf('Beirut Grill', 'beirut_grill', 'middle_eastern', 4.4, 500),
    items: [
      { id: 'beirut_shawarma', name: 'Beef Shawarma Wrap', description: 'Spiced beef, pickles, tomato and tahini in warm pita', priceCents: 1400, scores: { handheld: 1, savory: 0.85, brightAcidic: 0.4, rich: 0.5, comforting: 0.6, proteinForward: 0.7, carbHeavy: 0.4, adventurous: 0.2, brothy: 0, portion: 0.7 } },
      { id: 'beirut_fattoush', name: 'Fattoush', description: 'Romaine, cucumber, tomato, radish and crisp pita with sumac dressing', priceCents: 1100, scores: { fresh: 0.95, brightAcidic: 0.9, crispy: 0.4, rich: 0.1, savory: 0.4, proteinForward: 0.2, carbHeavy: 0.2, adventurous: 0.3, handheld: 0, portion: 0.4 } },
      { id: 'beirut_kebab', name: 'Lamb Kebab Plate', description: 'Two grilled lamb skewers with rice, salad and garlic sauce', priceCents: 2000, scores: { savory: 0.9, proteinForward: 0.9, rich: 0.5, brightAcidic: 0.3, carbHeavy: 0.4, comforting: 0.5, adventurous: 0.3, handheld: 0, portion: 0.8 }, tags: { proteins: ['beef'] } },
    ],
  },
  {
    restaurant: sf('Sakura', 'sakura', 'japanese', 4.3, 800),
    items: [
      { id: 'sakura_tonkotsu', name: 'Tonkotsu Ramen', description: 'Rich pork bone broth, chashu, soft egg, wood ear and scallion', priceCents: 1800, scores: { brothy: 0.95, rich: 0.9, comforting: 0.95, savory: 0.95, proteinForward: 0.5, carbHeavy: 0.6, adventurous: 0.2, handheld: 0, portion: 0.8 } },
      { id: 'sakura_sashimi', name: 'Salmon Sashimi', description: 'Eight slices of salmon', priceCents: 1900, scores: { fresh: 0.95, brightAcidic: 0.3, rich: 0.3, savory: 0.6, proteinForward: 0.95, carbHeavy: 0, adventurous: 0.3, handheld: 0, portion: 0.4 } },
      { id: 'sakura_katsu_curry', name: 'Chicken Katsu Curry', description: 'Panko-fried chicken cutlet with Japanese curry over rice', priceCents: 1700, scores: { rich: 0.85, comforting: 0.9, crispy: 0.8, savory: 0.85, carbHeavy: 0.8, proteinForward: 0.5, adventurous: 0.1, handheld: 0, portion: 0.9 } },
    ],
  },
  {
    restaurant: sf('Seoul Garden', 'seoul_garden', 'korean', 4.4, 650),
    items: [
      { id: 'seoul_yukgaejang', name: 'Yukgaejang', description: 'Spicy shredded beef soup with scallion, fernbrake and glass noodles, with rice', priceCents: 1700, scores: { brothy: 0.95, spicy: 0.8, comforting: 0.8, rich: 0.4, savory: 0.9, proteinForward: 0.6, carbHeavy: 0.3, adventurous: 0.5, handheld: 0, portion: 0.7 }, tags: { carbs: ['rice'] } },
      { id: 'seoul_bulgogi', name: 'Bulgogi', description: 'Thin-sliced marinated ribeye with onions, served with rice and banchan', priceCents: 1900, scores: { savory: 0.9, rich: 0.5, comforting: 0.7, proteinForward: 0.8, carbHeavy: 0.5, adventurous: 0.2, handheld: 0, portion: 0.8 }, tags: { carbs: ['rice'] } },
      { id: 'seoul_kimchi_jjigae', name: 'Kimchi Jjigae', description: 'Kimchi and pork belly stew with tofu, with rice', priceCents: 1600, scores: { brothy: 0.85, spicy: 0.8, rich: 0.6, comforting: 0.85, savory: 0.9, brightAcidic: 0.5, proteinForward: 0.5, carbHeavy: 0.3, adventurous: 0.5, handheld: 0, portion: 0.7 }, tags: { carbs: ['rice'] } },
    ],
  },
  {
    restaurant: sf('Bombay Spice', 'bombay_spice', 'indian', 4.2, 900),
    items: [
      { id: 'bombay_butter_chicken', name: 'Butter Chicken', description: 'Tandoori chicken in a creamy tomato sauce, with basmati rice', priceCents: 1800, scores: { rich: 0.9, comforting: 0.9, spicy: 0.3, savory: 0.85, proteinForward: 0.6, carbHeavy: 0.5, adventurous: 0.1, handheld: 0, portion: 0.8 }, tags: { carbs: ['rice'] } },
      { id: 'bombay_chana', name: 'Chana Masala', description: 'Chickpeas in a spiced tomato and onion gravy, with rice', priceCents: 1500, scores: { comforting: 0.7, spicy: 0.5, rich: 0.4, savory: 0.8, proteinForward: 0.3, carbHeavy: 0.5, adventurous: 0.2, handheld: 0, portion: 0.6 }, tags: { carbs: ['rice'] } },
      { id: 'bombay_vindaloo', name: 'Lamb Vindaloo', description: 'Fiery Goan curry with vinegar and chile, with rice', priceCents: 1900, scores: { spicy: 0.95, rich: 0.7, savory: 0.85, comforting: 0.6, brightAcidic: 0.4, proteinForward: 0.6, carbHeavy: 0.5, adventurous: 0.4, handheld: 0, portion: 0.8 }, tags: { proteins: ['beef'], carbs: ['rice'] } },
    ],
  },
  {
    restaurant: sf('Fog City Grill', 'fog_city_grill', 'american', 4.5, 1100),
    items: [
      { id: 'fog_salmon', name: 'Grilled Salmon', description: 'Wild salmon with lemon, herbs and charred broccolini', priceCents: 2800, scores: { fresh: 0.7, brightAcidic: 0.7, savory: 0.6, rich: 0.4, proteinForward: 0.9, carbHeavy: 0.1, adventurous: 0.2, handheld: 0, comforting: 0.4, portion: 0.6 } },
      { id: 'fog_chicken', name: 'Half Roast Chicken', description: 'Brick-roasted half chicken with pan jus and roasted potatoes', priceCents: 2600, scores: { comforting: 0.9, savory: 0.85, rich: 0.5, proteinForward: 0.8, carbHeavy: 0.3, adventurous: 0.05, handheld: 0.2, portion: 0.8 } },
      { id: 'fog_salad', name: 'Little Gem Salad', description: 'Little gem lettuce, radish, herbs and green goddess dressing', priceCents: 1400, scores: { fresh: 0.95, brightAcidic: 0.8, rich: 0.3, savory: 0.4, proteinForward: 0.1, carbHeavy: 0.05, adventurous: 0.1, handheld: 0, portion: 0.4 }, tags: { proteins: ['vegetarian'] } },
    ],
  },
  {
    restaurant: sf('Larb House', 'larb_house', 'thai', 4.7, 120),
    items: [],
  },
];

export function fixtureCandidates(kb: KnowledgeBase): RestaurantCandidatesInput[] {
  return FIXTURE_RESTAURANTS.map(({ restaurant, items }) => ({
    restaurant,
    items: items.map((raw): MenuItem => {
      const tagged = tagItem(kb, raw);
      return {
        id: raw.id,
        placeId: restaurant.placeId,
        name: raw.name,
        description: raw.description,
        priceCents: raw.priceCents,
        scores: { ...tagged.scores, ...raw.scores },
        tags: {
          proteins: raw.tags?.proteins ?? tagged.tags.proteins,
          carbs: raw.tags?.carbs ?? tagged.tags.carbs,
          formats: raw.tags?.formats ?? tagged.tags.formats,
          cuisine: raw.tags?.cuisine ?? tagged.tags.cuisine ?? restaurant.cuisine,
          archetypeId: raw.tags?.archetypeId ?? tagged.tags.archetypeId,
        },
      };
    }),
  }));
}
