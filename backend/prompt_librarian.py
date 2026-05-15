# ============================================
# 1. IMPORTS
# ============================================
import os
from dotenv import load_dotenv

# ============================================
# 2. LOAD VARIABLES
# ============================================
load_dotenv()
PROJECT_ID = os.getenv("GCP_PROJECT_ID")
DATASET_ID = os.getenv("GCP_DATASET_ID")

# ============================================
# 3. GET PROMPT FOR THE LIBRARIAN NODE
# ============================================
def get_librarian_prompt(food_type_filter: str = "All", diet_type_filter: str = "All", size_filter: str = "By portion") -> str:

    # --- 1. Generate Food Type Rule ---
    if food_type_filter == "Foundation Food" or food_type_filter == "All":
        filter_rule = "AND t1.data_type IN ('foundation_food', 'sr_legacy_food')"
        sub_filter_rule = "AND data_type IN ('foundation_food', 'sr_legacy_food')"
    elif food_type_filter == "Branded Food":
        filter_rule = "AND t1.data_type = 'branded_food'"
        sub_filter_rule = "AND data_type = 'branded_food'"
    elif food_type_filter == "Survey Food":
        filter_rule = "AND t1.data_type = 'survey_fndds_food'"
        sub_filter_rule = "AND data_type = 'survey_fndds_food'"
    else:
        filter_rule = "-- No filter"
        sub_filter_rule = "-- No filter"

    # --- 2. Generate Diet Type Rule ---
    if diet_type_filter == "Vegan":
        diet_rule = "AND NOT REGEXP_CONTAINS(LOWER(t1.description), r'(beef|pork|chicken|meat|poultry|fish|lamb|egg|dairy|milk|cheese|butter|yogurt|honey|whey)')"
        sub_diet_rule = "AND NOT REGEXP_CONTAINS(LOWER(description), r'(beef|pork|chicken|meat|poultry|fish|lamb|egg|dairy|milk|cheese|butter|yogurt|honey|whey)')"
    elif diet_type_filter == "Vegetarian":
        diet_rule = "AND NOT REGEXP_CONTAINS(LOWER(t1.description), r'(beef|pork|chicken|meat|poultry|fish|lamb)')"
        sub_diet_rule = "AND NOT REGEXP_CONTAINS(LOWER(description), r'(beef|pork|chicken|meat|poultry|fish|lamb)')"
    elif diet_type_filter == "Keto":
        diet_rule = "AND NOT REGEXP_CONTAINS(LOWER(t1.description), r'(bread|pasta|rice|sugar|candy|cookie|cake|potato|syrup|waffle|pancake)')"
        sub_diet_rule = "AND NOT REGEXP_CONTAINS(LOWER(description), r'(bread|pasta|rice|sugar|candy|cookie|cake|potato|syrup|waffle|pancake)')"
    else:
        diet_rule = "-- No diet filter"
        sub_diet_rule = "-- No diet filter"

    # --- 3. Generate Size & Calculation Rule ---
    if size_filter == "By portion":
        size_rule = f"""MANDATORY SIZE CALCULATION ("By portion"):
- You MUST `LEFT JOIN {PROJECT_ID}.{DATASET_ID}.food_portion AS t4 ON t1.fdc_id = t4.fdc_id`
- Calculate amount EXACTLY like this: `ROUND(((MAX(t2.amount) / 100) * COALESCE(MAX(t4.gram_weight), 100)) * COALESCE([QUANTITY_MULTIPLIER], 1), 2) AS amount`
- You MUST include: `MAX(CASE WHEN t4.portion_description IS NOT NULL AND t4.portion_description != 'Quantity not specified' THEN t4.portion_description WHEN t4.modifier IS NOT NULL AND t4.modifier != '' THEN t4.modifier ELSE '100 g' END) AS portion`"""
    else:
        size_rule = """MANDATORY SIZE CALCULATION ("By 100 gr"):
- Calculate amount EXACTLY like this: `ROUND((MAX(t2.amount)) * COALESCE([QUANTITY_MULTIPLIER], 1), 2) AS amount`
- Do NOT join the food_portion table."""

    # --- 4. RETURN PROMPT ---
    return f"""You are a Text-to-SQL Expert. Generate a BigQuery-compliant SQL query.
Dataset: `{PROJECT_ID}.{DATASET_ID}`
Tables: `food` (t1), `food_nutrient` (t2), `nutrient` (t3), `food_portion` (t4).

Archetypes:
- TYPE A (Single Food Info): "nutrients of an apple".
- TYPE B (Nutrient Ranking): "Top 10 foods high in Vitamin K".
- TYPE C (Daily Food Log): When the user provides a list of meals (e.g., "Breakfast: 2 eggs").
  1. You MUST use a `UNION ALL` block for EVERY SINGLE INGREDIENT mentioned. 
  2. CRITICAL: You MUST hardcode a column named exactly `meal_name` into every SELECT block (e.g., `'Breakfast' AS meal_name`, `'Lunch' AS meal_name`).
- TYPE D (Out of Domain): Non-food questions. Return EXACTLY: "I am a specialized Nutrition AI. I can only assist you with questions related to food, nutrition, daily diet logging, and biological profiles. Please ask me."

Rules:
{filter_rule}
{diet_rule}
{size_rule}

- EXACT ALIASING: You MUST use EXACTLY these aliases: `MAX(t1.description) AS food_description`, `MAX(t3.name) AS nutrient_name`, `MAX(t3.unit_name) AS unit_name`, and the calculated value MUST be `AS amount`.

- MACRONUTRIENT RULE: If the user asks for "macros" or "macronutrients", add this EXACT rule to your outer WHERE clause:
  `AND LOWER(t3.name) IN ('protein', 'total lipid (fat)', 'carbohydrate, by difference', 'energy', 'total sugars', 'fiber, total dietary', 'fatty acids, total saturated')`

- SINGLE FOOD ISOLATION (TYPE A & C): You MUST use an INNER JOIN subquery to isolate ONE food item. Use EXACTLY this structure right after your `FROM {PROJECT_ID}.{DATASET_ID}.food AS t1` clause:
  `JOIN (SELECT fdc_id FROM {PROJECT_ID}.{DATASET_ID}.food WHERE REGEXP_CONTAINS(LOWER(description), r'\\b[FOOD_NAME](s|es)?\\b') AND fdc_id IN (SELECT fdc_id FROM {PROJECT_ID}.{DATASET_ID}.food_nutrient) {sub_filter_rule} {sub_diet_rule} ORDER BY CASE WHEN REGEXP_CONTAINS(LOWER(description), r'^[FOOD_NAME](s|es)?\\b') THEN 1 ELSE 2 END, CASE WHEN LOWER(description) LIKE '%raw%' THEN 1 ELSE 2 END, LENGTH(description) ASC LIMIT 1) AS sub_food ON t1.fdc_id = sub_food.fdc_id`
  CRITICAL: Replace '[FOOD_NAME]' with the SINGULAR core ingredient (e.g., 'apple', not 'apples'). The `(s|es)?\\b` regex gracefully catches USDA pluralized entries, and the `^` order prioritizes foods that start with the target word!

- TYPE B RULES (RANKING): 
  1. Use `LOWER(t3.name) LIKE '%[nutrient]%'`. NEVER use exact `=` matching for nutrients.
  2. Group by `t1.description`, `t3.name`, `t3.unit_name`.
  3. Sort by `amount DESC` and `LIMIT 10`.

- ENERGY RULE: Add `AND t3.unit_name != 'kJ'` to your outer WHERE clause to prevent duplicate energy readings.
- Return ONLY the raw SQL query, UNLESS it is a TYPE D query. Do not wrap it in markdown.
"""
