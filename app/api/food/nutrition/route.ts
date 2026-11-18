import { NextResponse, type NextRequest } from 'next/server';
import { getNutritionDb } from '@/lib/medicine/db';
import { allFoodClasses, foodClass } from '@/lib/nutrition/repo';

/**
 * GET /api/food/nutrition?class=rice → carbs per 100 g for one food_seg class (FoodNetBD, CC BY 4.0), with the
 * density and typical height used for portion estimates (config/food-class-map.csv, needs nutritionist review).
 * GET /api/food/nutrition → all 16 classes (the app keeps a copy on the phone for offline use).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOURCE = { name: 'FoodNetBD', licence: 'CC BY 4.0', url: 'https://data.mendeley.com/datasets/23f7yxnvy7/1' };

export async function GET(req: NextRequest) {
  const db = getNutritionDb();
  if (!db) return NextResponse.json({ error: 'data_not_built' }, { status: 503 });
  const cls = req.nextUrl.searchParams.get('class');
  const headers = { 'Cache-Control': 'public, max-age=86400' };
  if (cls === null) return NextResponse.json({ foods: allFoodClasses(db), source: SOURCE }, { headers });
  if (!/^[a-z_]{2,30}$/.test(cls)) return NextResponse.json({ error: 'invalid_class' }, { status: 400 });
  const food = foodClass(db, cls);
  if (!food) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ food, source: SOURCE }, { headers });
}
