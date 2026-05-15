# backend/agents.py
# This file contains the LangGraph flow and agent logic for the Nutrition AI backend.
# It is used by the FastAPI server (main.py) to process user queries.

# ============================================
# 1. IMPORTS
# ============================================
import os
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from dotenv import load_dotenv
from typing import TypedDict, Optional, Any
from langgraph.graph import StateGraph, END
from langchain_google_vertexai import ChatVertexAI
from langchain_core.messages import SystemMessage, HumanMessage
from google.cloud import bigquery
from google.oauth2 import service_account
import json
import re
from prompt_librarian import get_librarian_prompt
from prompt_visual import VISUAL_CONTEXT

# ============================================
# 2. MAP NUTRIENTS
# ============================================
def apply_all_nutrient_aliases(name):
    """Applies both Macro specific aliases and Micro Vitamin prefixes."""
    n_lower = str(name).lower()
    orig = str(name)

    # 1. Macro Aliases (Exact Match)
    macro_map = {
        'carbohydrate, by difference': 'Total Carbohydrate',
        'total sugars': 'of which Sugars',
        'fiber, total dietary': 'of which Dietary Fiber',
        'total lipid (fat)': 'Total Fat',
        'fatty acids, total saturated': 'of which Saturated Fat',
        'fatty acids, total trans': 'of which Trans Fat',
        'fatty acids, total monounsaturated': 'of which Monounsaturated Fat', 
        'fatty acids, total polyunsaturated': 'of which Polyunsaturated Fat',
    }
    if n_lower in macro_map:
        return macro_map[n_lower]

    # 2. Micro Aliases (Substring Match & Prefix)
    prefix = ""
    check_str = ""
    
    if 'carotene' in n_lower or 'retinol' in n_lower:
        prefix, check_str = "Vitamin A, ", "vitamin a"
    elif 'thiamin' in n_lower:
        prefix, check_str = "Vitamin B1, ", "vitamin b1"
    elif 'riboflavin' in n_lower:
        prefix, check_str = "Vitamin B2, ", "vitamin b2"
    elif 'niacin' in n_lower:
        prefix, check_str = "Vitamin B3, ", "vitamin b3"
    elif 'pantothenic' in n_lower:
        prefix, check_str = "Vitamin B5, ", "vitamin b5"
    elif 'biotin' in n_lower:
        prefix, check_str = "Vitamin B7, ", "vitamin b7"
    elif 'folate' in n_lower:
        prefix, check_str = "Vitamin B9, ", "vitamin b9"
    elif 'b-complex' in n_lower:
        prefix, check_str = "Vitamin B, ", "vitamin b"
    elif 'ascorbic' in n_lower:
        prefix, check_str = "Vitamin C, ", "vitamin c"
    elif 'tocopherol' in n_lower:
        prefix, check_str = "Vitamin E, ", "vitamin e"
    elif 'phylloquinone' in n_lower:
        prefix, check_str = "Vitamin K, ", "vitamin k"
    else:
        return orig

    # 3. Prevent Double-Prefixing
    # If the database already explicitly says "Vitamin C", don't add it again.
    if check_str in n_lower:
        return orig
    
    # Capitalize the first letter of the original word and prepend
    orig_capitalized = orig[0].upper() + orig[1:] if orig else orig
    return prefix + orig_capitalized

# ============================================
# 3. PERSONALIZED TARGETS
# ============================================
# For Calories & Macros (Energy): The Mifflin-St Jeor Equation 
# For Vitamins & Minerals (Micros): The NIH DRIs 
def get_personalized_targets(profile: dict):
    if not profile:
        profile = {} # Fallback just in case
        
    gender = profile.get('gender', 'Female').lower()
    age = int(profile.get('age', 30))
    weight = float(profile.get('weight', 70)) # kg
    height = float(profile.get('height', 165)) # cm
    activity = float(profile.get('activity', 1.2))

    # 1. BMR (Mifflin-St Jeor Equation)
    if gender == 'male':
        bmr = (10 * weight) + (6.25 * height) - (5 * age) + 5
    else:
        bmr = (10 * weight) + (6.25 * height) - (5 * age) - 161

    # 2. Total Daily Energy Expenditure (TDEE)
    tdee = bmr * activity

    # 3. Macro Scaling (50% Carbs, 20% Protein, 30% Fat)
    carbs = (tdee * 0.50) / 4   
    protein = (tdee * 0.20) / 4 
    fat = (tdee * 0.30) / 9     
    sat_fat = (tdee * 0.10) / 9 
    sugars = (tdee * 0.10) / 4  
    fiber = (tdee / 1000) * 14  # 14g per 1000 kcal

    # 4. Micro Baselines (NIH Adjustments based on gender and age)
    return {
        'Energy': tdee,
        'Water': 3700.0 if gender == 'male' else 2700.0,
        'Total Carbohydrate': carbs,
        'of which Sugars': sugars,
        'of which Dietary Fiber': fiber,
        'Protein': protein,
        'Total Fat': fat,
        'of which Saturated Fat': sat_fat,
        'of which Trans Fat': 2.0, 
        'of which Polyunsaturated Fat': (tdee * 0.10) / 9,
        'of which Monounsaturated Fat': (tdee * 0.10) / 9,
        
        # Vitamins & Minerals
        'Vitamin A, IU': 3000.0 if gender == 'male' else 2333.0,
        'Vitamin A, RAE': 900.0 if gender == 'male' else 700.0,
        'Vitamin B1, Thiamin': 1.2 if gender == 'male' else 1.1,
        'Vitamin B2, Riboflavin': 1.3 if gender == 'male' else 1.1,
        'Vitamin B3, Niacin': 16.0 if gender == 'male' else 14.0,
        'Vitamin B5, Pantothenic acid': 5.0,
        'Vitamin B6': 1.3 if age <= 50 else (1.7 if gender == 'male' else 1.5),
        'Vitamin B7, Biotin': 30.0,
        'Vitamin B9, Folate, total': 400.0,
        'Vitamin B12': 2.4,
        'Vitamin C, total ascorbic acid': 90.0 if gender == 'male' else 75.0,
        'Vitamin D (D2 + D3), International Units': 600.0 if age <= 70 else 800.0,
        'Vitamin E, alpha-tocopherol': 15.0,
        'Vitamin K (phylloquinone)': 120.0 if gender == 'male' else 90.0,
        
        'Calcium, Ca': 1000.0 if age <= 50 else 1200.0,
        'Iron, Fe': 8.0 if gender == 'male' or age > 50 else 18.0, # Women need more pre-menopause
        'Magnesium, Mg': 400.0 if gender == 'male' else 310.0,
        'Phosphorus, P': 700.0,
        'Potassium, K': 3400.0 if gender == 'male' else 2600.0,
        'Sodium, Na': 2300.0,
        'Zinc, Zn': 11.0 if gender == 'male' else 8.0,
        'Copper, Cu': 0.9,
        'Manganese, Mn': 2.3 if gender == 'male' else 1.8,
        'Selenium, Se': 55.0
    }

# Vitamin Exceptions for formatting
VITAMIN_EXCEPTIONS = sorted([
    "Vitamin A", "Vitamin B", "Vitamin B1", "Vitamin B2", "Vitamin B3", 
    "Vitamin B5", "Vitamin B6", "Vitamin B7", "Vitamin B9", "Vitamin B12", 
    "B-Complex", "Vitamin C", "Vitamin D", "Vitamin E", "Vitamin K"
], key=len, reverse=True)

# ============================================
# 4. FORMAT LABELS
# ============================================
def format_label(text):
    if not text:
        return text
    # Replace underscores with spaces
    text = str(text).replace("_", " ")
    # First letter of the first word in upper case, all the words format to lower case
    formatted = text.lower()
    if formatted:
        formatted = formatted[0].upper() + formatted[1:]
    
    # Keep exceptions as they are (case-sensitive)
    for exc in VITAMIN_EXCEPTIONS:
        # Use regex for whole-word case-insensitive replacement
        pattern = re.compile(r'\b' + re.escape(exc) + r'\b', re.IGNORECASE)
        formatted = pattern.sub(exc, formatted)
    return formatted

# ============================================
# 5. LOAD VARIABLES
# ============================================
load_dotenv()
PROJECT_ID = os.getenv("GCP_PROJECT_ID")
LOCATION = os.getenv("LOCATION")
AI_MODEL = os.getenv("AI_MODEL")
AI_TEMPERATURE = os.getenv("AI_TEMPERATURE")

# Initialize BigQuery client securely
# For local development only, use application default credentials on cloud run
# CREDENTIALS_FILE = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
#credentials = service_account.Credentials.from_service_account_file(CREDENTIALS_FILE)
#bq_client = bigquery.Client(credentials=credentials, project=PROJECT_ID)
bq_client = bigquery.Client(project=PROJECT_ID)

# ============================================
# 6. LANGGRAPH STATE
# ============================================
# Define LangGraph State 
class State(TypedDict):
    query: str
    food_type_filter: str 
    diet_type_filter: str  
    size_filter: str       
    is_daily_log: bool    
    user_profile: dict     
    totals: pd.DataFrame   
    sql_query: Optional[str]
    data: Optional[pd.DataFrame]
    error: Optional[str]
    visual_type: Any
    fig: Any # Plotly figure or metric string

# ============================================
#  7. LIBRARIAN NODE
# ============================================
def librarian_node(state: State):
    """Generates SQL query from user input."""

    # Extract the filter from the state (default to "All" if missing)
    current_food_filter = state.get("food_type_filter", "All")      # Extract food filter
    current_diet_filter = state.get("diet_type_filter", "All")     # Extract diet filter
    current_size_filter = state.get("size_filter", "By portion")   # Extract size filter

    # Pass filters to the prompt
    sys_prompt = get_librarian_prompt(current_food_filter, current_diet_filter, current_size_filter) 
    
    messages = [
        SystemMessage(content=sys_prompt),
        HumanMessage(content=state["query"])
    ]

    # Instantiate the LLM to generate SQL query
    llm = ChatVertexAI(
        model_name=AI_MODEL, 
        temperature=AI_TEMPERATURE,
        project=PROJECT_ID,
        location=LOCATION
    )

    response = llm.invoke(messages)
    sql_query = response.content.strip()
    
    # Clean up markdown if the LLM adds it
    if sql_query.startswith("```sql"):
        sql_query = sql_query[6:]
    if sql_query.startswith("```"):
        sql_query = sql_query[3:]
    if sql_query.endswith("```"):
        sql_query = sql_query[:-3]
        
    return {"sql_query": sql_query.strip(), "error": None}

# ====================================================
#  8. DATA RETRIEVAL NODE
# ====================================================
def data_retrieval_node(state: State):
    """Executes the SQL query against BigQuery."""
    sql_query = state.get("sql_query")

    if not sql_query:
        return {"error": "No SQL query generated."}
    
    # --- CATCH OUT-OF-DOMAIN TEXT ---
    # If the string doesn't start with SELECT or WITH, it is our refusal message
    if not sql_query.strip().upper().startswith(("SELECT", "WITH")):
        # Add "sql_query": None to hide the frontend dropdown!
        return {"error": sql_query.strip(), "data": None, "sql_query": None}

    try:
        df = bq_client.query(sql_query).to_dataframe()
        
        # --- CATCH EMPTY RESULTS EARLY ---
        if df.empty:
            return {"error": "No data found for this query. Try adjusting your spelling or using simpler terms.", "data": None}
        
        # --- TRAFFIC LIGHT: AUTOMATIC ROUTING ---
        if state.get("is_daily_log", False) or "meal_name" in df.columns:
            try:
                # 0. Ultimate Column Safety Net (Aggressive Renaming)
                col_map = {}
                for c in df.columns:
                    cl = str(c).lower().strip()
                    if 'amount' in cl or 'value' in cl:
                        col_map[c] = 'amount'
                    elif 'unit' in cl or 'measure' in cl:
                        col_map[c] = 'unit_name'
                    elif ('description' in cl or 'item' in cl or 'food' in cl) and 'food_description' not in col_map.values():
                        if cl not in ['food_type', 'fdc_id']:
                            col_map[c] = 'food_description'
                    elif 'nutrient' in cl:
                        col_map[c] = 'nutrient_name'

                if col_map:
                    df = df.rename(columns=col_map)

                # 1. Fill missing critical columns
                if 'unit_name' not in df.columns:
                    df['unit_name'] = ''
                if 'food_description' not in df.columns:
                    df['food_description'] = 'Unknown Food'
                if 'nutrient_name' not in df.columns:
                    df['nutrient_name'] = 'Unknown Nutrient'
                if 'amount' not in df.columns:
                    num_cols = [c for c in df.select_dtypes(include=['number']).columns if 'id' not in c.lower() and 'portion' not in c.lower()]
                    if num_cols:
                        df = df.rename(columns={num_cols[0]: 'amount'})
                    else:
                        df['amount'] = 0.0

                amount_col = 'amount'

                # --- THE TEXT SCRUBBER ---
                df[amount_col] = df[amount_col].astype(str).str.replace(r'[^\d\.]', '', regex=True)
                df[amount_col] = pd.to_numeric(df[amount_col], errors='coerce').fillna(0.0)

                # --- REMOVE ZERO VALUES ---
                df = df[df[amount_col] > 0].copy()

                # 2. Capitalize descriptions safely
                df['food_description'] = df['food_description'].astype(str).str.capitalize()

                # --- GROUP THE DATA ---
                df_totals = df.groupby('nutrient_name', as_index=False).agg({
                    amount_col: 'sum',
                    'unit_name': 'first'
                })

                # 3. Apply Aliases
                if 'nutrient_name' in df_totals.columns:
                    df_totals['nutrient_name'] = df_totals['nutrient_name'].apply(apply_all_nutrient_aliases)

                # --- CALCULATE % OF DAILY GOAL ---
                user_targets = get_personalized_targets(state.get("user_profile", {}))
                df_totals['Daily Target Num'] = df_totals['nutrient_name'].map(user_targets)
                df_totals['pct_goal'] = (df_totals[amount_col] / df_totals['Daily Target Num'].fillna(999999)) * 100
                df_totals['% of Goal'] = df_totals['pct_goal'].apply(lambda x: f"{x:.1f}%" if x < 999000 else "N/A")

                # --- FORMAT COLUMNS FOR THE UI ---
                def format_eu_amount(val, unit):
                    if pd.isna(val) or val >= 999000: return "N/A"
                    u = str(unit).lower().strip() if pd.notnull(unit) else ""
                    unit_str = f" {u}" if u else ""
                    us_format = f"{val:,.2f}"
                    eu_format = us_format.replace(',', 'X').replace('.', ',').replace('X', '.')
                    if eu_format.endswith(',00'): eu_format = eu_format[:-3]
                    return f"{eu_format}{unit_str}"

                df_totals['Target'] = df_totals.apply(lambda row: format_eu_amount(row['Daily Target Num'], row.get('unit_name', '')), axis=1)
                df_totals['Total Amount'] = df_totals.apply(lambda row: format_eu_amount(row[amount_col], row.get('unit_name', '')), axis=1)

                # 4. Process Macros
                # --- NEW GLOBAL SORTING LOGIC ---
                macro_order = ['Energy', 'Water', 'Total Carbohydrate', 'of which Sugars', 'of which Dietary Fiber', 'Protein', 'Total Fat', 'of which Saturated Fat', 'of which Trans Fat', 'of which Polyunsaturated Fat', 'of which Monounsaturated Fat']
                macro_order_lower = [m.lower() for m in macro_order]

                def get_global_sort_key(name):
                    n = str(name).lower().strip()
                    # Priority 1: Macros (Sorted by the predefined list order)
                    if n in macro_order_lower:
                        return (1, macro_order_lower.index(n), n)
                    
                    # Priority 2: Vitamins (Grouped and ordered by Vitamin Type)
                    if 'vitamin a' in n or 'carotene' in n or 'retinol' in n: return (2, 1, n)
                    if 'vitamin b1' in n or 'thiamin' in n: return (2, 2, n)
                    if 'vitamin b2' in n or 'riboflavin' in n: return (2, 3, n)
                    if 'vitamin b3' in n or 'niacin' in n: return (2, 4, n)
                    if 'vitamin b5' in n or 'pantothenic' in n: return (2, 5, n)
                    if 'vitamin b6' in n: return (2, 6, n)
                    if 'vitamin b7' in n or 'biotin' in n: return (2, 7, n)
                    if 'vitamin b9' in n or 'folate' in n: return (2, 8, n)
                    if 'vitamin b12' in n: return (2, 9, n)
                    if 'vitamin b' in n or 'b-complex' in n: return (2, 10, n)
                    if 'vitamin c' in n or 'ascorbic' in n: return (2, 11, n)
                    if 'vitamin d' in n: return (2, 12, n)
                    if 'vitamin e' in n or 'tocopherol' in n: return (2, 13, n)
                    if 'vitamin k' in n or 'phylloquinone' in n: return (2, 14, n)
                    
                    # Priority 3: Minerals and everything else (Sorted alphabetically)
                    return (3, 99, n)

                # --- 1. Sort the "Detailed Meal Breakdown" Table (df) ---
                # This ensures the details group nicely by Meal -> Food -> Proper Nutrient Order
                if 'nutrient_name' in df.columns:
                    df['nutrient_name'] = df['nutrient_name'].apply(apply_all_nutrient_aliases)
                    df['sort_key'] = df['nutrient_name'].apply(get_global_sort_key)
                    
                    sort_cols = []
                    
                    if 'meal_name' in df.columns:
                        # 1. Standardize meal names (e.g., 'lunch' becomes 'Lunch')
                        df['meal_name'] = df['meal_name'].astype(str).str.title()
                        
                        # 2. Define the exact chronological meal order
                        meal_order = ['Breakfast', 'Lunch', 'Afternoon Snack', 'Dinner']
                        
                        # 3. Create a sort key for the meals (unknown meals go to the bottom)
                        df['meal_sort_key'] = df['meal_name'].apply(lambda x: meal_order.index(x) if x in meal_order else 99)
                        
                        sort_cols.extend(['meal_sort_key', 'food_description'])
                        
                        # 4. Reorder the DataFrame columns so 'meal_name' is always first
                        cols = df.columns.tolist()
                        cols.insert(0, cols.pop(cols.index('meal_name')))
                        df = df[cols]
                    else:
                        sort_cols.append('food_description')
                        
                    # 5. Add the nutrient sort key to the end of the sorting logic
                    sort_cols.append('sort_key')
                    
                    # 6. Apply the multi-level sort
                    df = df.sort_values(sort_cols, ascending=True)
                    
                    # 7. Clean up the temporary sorting columns
                    cols_to_drop = ['sort_key']
                    if 'meal_sort_key' in df.columns:
                        cols_to_drop.append('meal_sort_key')
                    df = df.drop(columns=cols_to_drop)

                # --- 2. Sort the "Daily Nutrient Totals" Table (df_totals) ---
                df_totals['sort_key'] = df_totals['nutrient_name'].apply(get_global_sort_key)
                df_totals = df_totals.sort_values('sort_key', ascending=True)

                # --- 3. Split data for the UI Charts ---
                # Note: Plotly draws horizontal bars from bottom-to-top, so we must reverse the chart data (ascending=False)
                df_macros = df_totals[df_totals['sort_key'].apply(lambda x: x[0] == 1)].copy()
                df_macros = df_macros.sort_values('sort_key', ascending=False) 

                df_micros = df_totals[df_totals['sort_key'].apply(lambda x: x[0] > 1)].copy()
                df_micros = df_micros.sort_values('sort_key', ascending=False)

                figs = []
                v_types = []

                # --- CHART GENERATION ---
                if not df_macros.empty:
                    chart_macros = df_macros[df_macros['pct_goal'] < 999000]
                    fig_mac = go.Figure(go.Bar(
                        x=chart_macros['pct_goal'],
                        y=chart_macros['nutrient_name'],
                        orientation='h',
                        marker_color='#155289',
                        text=chart_macros['Total Amount'],
                        textposition='auto'
                    ))

                    fig_mac.add_vline(x=100, line_dash="dash", line_color="#ef4444", line_width=2)

                    max_x = max(chart_macros['pct_goal'].max() if not chart_macros.empty else 0, 130)
                    fig_mac.update_layout(title="Daily Total: Macronutrients (% of Goal)", margin=dict(l=180, r=60, t=40, b=20), xaxis_title="% of Daily Target", xaxis=dict(range=[0, max_x * 1.20]))
                    figs.append(fig_mac)
                    v_types.append("bar")

                if not df_micros.empty:
                    chart_micros = df_micros[df_micros['pct_goal'] < 999000]
                    fig_mic = go.Figure(go.Bar(
                        x=chart_micros['pct_goal'],
                        y=chart_micros['nutrient_name'],
                        orientation='h',
                        marker_color='#7A9FC4',
                        text=chart_micros['Total Amount'],
                        textposition='auto'
                    ))

                    fig_mic.add_vline(x=100, line_dash="dash", line_color="#ef4444", line_width=2)

                    max_x = max(chart_micros['pct_goal'].max() if not chart_micros.empty else 0, 130)
                    fig_mic.update_layout(title="Daily Total: Vitamins & Minerals (% of Goal)", margin=dict(l=200, r=60, t=40, b=20), xaxis_title="% of Daily Target", xaxis=dict(range=[0, max_x * 1.20]))
                    figs.append(fig_mic)
                    v_types.append("bar")

                v_types.append("diary")

                # --- PREPARE THE CLEAN TABLE ---
                df_totals_clean = df_totals[['nutrient_name', 'Total Amount', 'Target', '% of Goal']].copy()
                df_totals_clean.columns = ['Nutrient Name', 'Amount', 'Target', '% of Goal']

                return {
                    "visual_type": v_types,
                    "data": df,
                    "totals": df_totals_clean,
                    "fig": figs
                }

            except Exception as e:
                print(f"Diary Math Error: {e}")
                
                # ULTIMATE SAFETY NET: If math fails, forcefully convert any categorical columns
                # back to strings so main.py never crashes!
                for col in df.select_dtypes(include=['category']).columns:
                    df[col] = df[col].astype(str)
                
                return {"data": df, "error": f"Could not calculate daily targets: {str(e)}"}
        
        else:
            # --- GENERAL SEARCH & RANKING (TYPE A & B) ---
            # Bypass the diary math entirely and pass it straight to the Visualizer
            return {"data": df, "error": None}

    # ---  MISSING OUTER EXCEPT BLOCK ---
    except Exception as e:
        print(f"Database Query Error: {e}")
        return {"error": f"Failed to retrieve data from BigQuery: {str(e)}"}

# ====================================================
#  9. VISUALIZER NODE
# ====================================================
def visualizer_node(state: State):
    """Determines the visualization type and creates the figure using an LLM."""
    
    # --- BYPASS FOR DAILY DIARY ---
    if "diary" in (state.get("visual_type") or []):
        return {}

    df = state.get("data")
    error = state.get("error")
    
    if error or df is None or df.empty:
        err_msg = error or "No data found for this query. Try adjusting your spelling or using simpler terms (e.g., 'carrots' instead of 'carrot, raw')."
        return {"visual_type": ["none"], "fig": [None], "error": err_msg}

    # --- SMART FILTERING LOGIC (v2: FDC ID precise filtering) ---
    if "nutrient_name" in df.columns and df["nutrient_name"].nunique() > 1:
        if "fdc_id" in df.columns and df["fdc_id"].nunique() > 1:
            first_id = df["fdc_id"].iloc[0]
            df = df[df["fdc_id"] == first_id].copy()
        elif "food_description" in df.columns and df["food_description"].nunique() > 1:
            first_food = df["food_description"].iloc[0]
            df = df[df["food_description"] == first_food].copy()

    # --- UNIVERSAL DEDUPLICATION SAFETY NET ---
    dedup_cols = [col for col in ['food_description', 'nutrient_name', 'amount'] if col in df.columns]
    if dedup_cols:
        df = df.drop_duplicates(subset=dedup_cols, keep='first')

    # --- UNIVERSAL DATA CLEANER ---
    if "food_description" in df.columns:
        df = df[df["food_description"].notna()]
        df = df[df["food_description"].astype(str).str.strip() != ""]
        
    # --- GLOBAL ALIASES (Applied immediately so Tables & Pies inherit them) ---
    if "nutrient_name" in df.columns:
        df["nutrient_name"] = df["nutrient_name"].apply(apply_all_nutrient_aliases)
        
    # Initialize the LLM for the Visualizer   
    llm = ChatVertexAI(
        model_name=AI_MODEL, 
        temperature=AI_TEMPERATURE,
        project=PROJECT_ID,
        location=LOCATION
    )
     
    df_summary = df.head(20).to_json(orient='records')
    
    # --- Build the Visualizer Prompt ---
    messages = [
        SystemMessage(content=VISUAL_CONTEXT),
        HumanMessage(content=f"User Query: {state['query']}\n\nData Summary: {df_summary}\n\nProvide the JSON configuration.")
    ]
    
    response = llm.invoke(messages)
    content = response.content.strip()
    
    # --- JSONSafety Protocol ---
    if content.startswith("```json"):
        content = content[7:]
    if content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]
    content = content.strip()
    
    # --- Parse LLM Output ---
    try:
        config = json.loads(content)
        v_types = config.get("type", ["table"])
        if not isinstance(v_types, list):
            v_types = [v_types]
            
        final_types = []
        final_figs = []
        
        # --- UNIT INFERENCE ---
        unit_from_df = ""
        if "unit_name" in df.columns:
            valid_units = df["unit_name"].dropna().unique()
            if len(valid_units) > 0:
                unit_from_df = str(valid_units[0]).lower().strip()
        
        unit = unit_from_df if unit_from_df else config.get("unit", "").lower().strip()
        if unit:
            unit = f" {unit}"
            
        # Define protected words so format_label doesn't ruin our aliases
        protected_labels = ['Total Carbohydrate', 'of which Sugars', 'of which Dietary Fiber', 'Total Fat', 'of which Saturated Fat', 'of which Trans Fat', 'of which Monounsaturated Fat', 'of which Polyunsaturated Fat', 'Energy', 'Water', 'Protein']

        # --- CHART GENERATION LOOP ---
        for v_type in v_types:
            if v_type in ["bar", "macro_bar", "micro_bar"]:
                name_col = config.get("y_col")

                # Logic to determine the correct column for the chart
                if "nutrient_name" in df.columns and "food_description" in df.columns:
                    if df["food_description"].nunique() == 1 and df["nutrient_name"].nunique() > 1:
                        name_col = "nutrient_name"
                    elif not name_col or name_col not in df.columns:
                        name_col = "food_description"
                elif not name_col or name_col not in df.columns:
                    string_cols = df.select_dtypes(include=['object', 'string']).columns
                    name_col = string_cols[0] if len(string_cols) > 0 else df.columns[0]

                # Logic to determine the correct column for the chart values
                val_col = config.get("x_col")
                if val_col == "fdc_id":
                    val_col = None
                    
                if not val_col or val_col not in df.columns:
                    if "amount" in df.columns:
                        val_col = "amount"
                    else:
                        num_cols = [col for col in df.select_dtypes(include=['number']).columns if col != 'fdc_id']
                        val_col = num_cols[0] if len(num_cols) > 0 else df.columns[0]

                # --- Data Preparation ---
                temp_df = df.copy()
                macro_order = ['Energy', 'Water', 'Total Carbohydrate', 'of which Sugars', 'of which Dietary Fiber', 'Protein', 'Total Fat', 'of which Saturated Fat', 'of which Trans Fat', 'of which Monounsaturated Fat', 'of which Polyunsaturated Fat']

                # --- Conditional Styling & Data Filtering ---
                if v_type == "macro_bar":
                    color = "#155289"
                    title = config.get("title_macro", "Macronutrients")
                    temp_df = temp_df[temp_df[name_col].isin(macro_order)]
                    
                    # Exclude zeros
                    temp_df = temp_df[temp_df[val_col].round(1) > 0]
                    if temp_df.empty: continue
                    
                    # Sort macro (Reverse because Plotly draws bottom to top)
                    temp_df['sort_idx'] = temp_df[name_col].apply(lambda x: macro_order.index(x) if x in macro_order else 99)
                    df_sorted = temp_df.sort_values('sort_idx', ascending=False)

                # --- Macro Bar Chart Creation ---
                elif v_type == "micro_bar":
                    color = "#95AAD3"
                    title = config.get("title_micro", "Vitamins and Minerals")
                    temp_df = temp_df[~temp_df[name_col].isin(macro_order)]
                    
                    # Exclude zeros
                    temp_df = temp_df[temp_df[val_col].round(1) > 0]
                    if temp_df.empty: continue
                    
                    # Sort micro (Vitamins A, B1, B2, B3, B5, B6, B7, B9, B12, C, D, E, K)
                    def get_micro_sort(name):
                        n = str(name).lower()
                        if 'vitamin a' in n or 'carotene' in n or 'retinol' in n: return 1
                        if 'vitamin b1' in n or 'thiamin' in n: return 2
                        if 'vitamin b2' in n or 'riboflavin' in n: return 3
                        if 'vitamin b3' in n or 'niacin' in n: return 4
                        if 'vitamin b5' in n or 'pantothenic' in n: return 5
                        if 'vitamin b6' in n: return 6
                        if 'vitamin b7' in n or 'biotin' in n: return 7
                        if 'vitamin b9' in n or 'folate' in n: return 8
                        if 'vitamin b12' in n: return 9
                        if 'vitamin b' in n or 'b-complex' in n: return 10
                        if 'vitamin c' in n or 'ascorbic' in n: return 11
                        if 'vitamin d' in n: return 12
                        if 'vitamin e' in n or 'tocopherol' in n: return 13
                        if 'vitamin k' in n or 'phylloquinone' in n: return 14
                        return 20
                    
                    temp_df['sort_idx'] = temp_df[name_col].apply(get_micro_sort)
                    df_sorted = temp_df.sort_values(['sort_idx', name_col], ascending=[False, False])

                else:
                    # Standard comparative bar graph
                    color = "#95AAD3" 
                    title = config.get("title", "Nutrient Data")
                    temp_df = temp_df[temp_df[val_col].round(1) > 0]
                    if temp_df.empty: continue
                    df_sorted = temp_df.sort_values(by=val_col, ascending=True)

                # Format labels securely (don't break our new aliases)
                df_sorted[name_col] = df_sorted[name_col].apply(lambda x: x if x in protected_labels else format_label(x))
                
                # Calculate percentage
                total = df_sorted[val_col].sum()
                df_sorted['pct'] = (df_sorted[val_col] / total * 100).round(1) if total > 0 else 0
                
                def get_bar_label(row):
                    u = str(row['unit_name']).lower().strip() if 'unit_name' in row and pd.notnull(row['unit_name']) else ""
                    unit_str = f" {u}" if u else ""
                    
                    us_format = f"{row[val_col]:,.2f}" 
                    eu_format = us_format.replace(',', 'X').replace('.', ',').replace('X', '.')
                    
                    # NEW: Drop percentage for Energy!
                    if str(row[name_col]).lower() == 'energy':
                        return f"{eu_format}{unit_str}"
                    else:
                        return f"{eu_format}{unit_str} ({row['pct']}%)"
                
                # Add text labels to bars
                df_sorted['display_text'] = df_sorted.apply(get_bar_label, axis=1)
                
                # Dynamic Height Calculation
                calc_height = max(400, len(df_sorted) * 25)
                
                # Format labels securely (don't break our new aliases)
                x_label = format_label(val_col)
                y_label = format_label(name_col)
                display_title = format_label(title)
                
                # --- OVERRIDE TITLE CASING ---
                if display_title.lower() == "vitamins and minerals":
                    display_title = "Vitamins and Minerals"
                elif display_title.lower() == "macronutrients":
                    display_title = "Macronutrients"

                # --- Create the Bar Chart ---
                fig = go.Figure(go.Bar(
                    x=df_sorted[val_col].tolist(),
                    y=df_sorted[name_col].tolist(),
                    orientation='h',
                    text=df_sorted['display_text'].tolist(),
                    textposition='outside',
                    marker_color=color,
                    name=''
                ))
                
                # Dynamic Axis Scaling
                max_val = df_sorted[val_col].max()
                buffer_val = max_val * 1.30

                # --- Styling & Polish ---
                fig.update_layout(
                    title=display_title,
                    xaxis=dict(range=[0, buffer_val], title=x_label),
                    yaxis_title=y_label,
                    height=calc_height,
                    plot_bgcolor="white", paper_bgcolor="white",
                    font=dict(color="#242424"),
                    margin=dict(l=200, r=150, t=40, b=5), 
                    title_font_color="#242424",
                    bargap=0.1, bargroupgap=0.1,
                    showlegend=False
                )
                fig.update_xaxes(title_font=dict(size=12, color="#242424"), tickfont_color="#242424", automargin=True)
                fig.update_yaxes(title_font=dict(size=12, color="#242424"), tickfont_color="#242424", automargin=True)

                # --- Append Figure ---
                final_types.append("bar")
                final_figs.append(fig)

            # --- Pie Chart Creation ---
            elif v_type == "pie":
                name_col = config.get("names")

                # UNCONDITIONAL FORCE: If single food but multiple nutrients, Y-axis MUST be nutrients
                if "nutrient_name" in df.columns and "food_description" in df.columns:
                    if df["food_description"].nunique() == 1 and df["nutrient_name"].nunique() > 1:
                        name_col = "nutrient_name"
                    elif not name_col or name_col not in df.columns:
                        name_col = "food_description"
                elif not name_col or name_col not in df.columns:
                    string_cols = df.select_dtypes(include=['object', 'string']).columns
                    name_col = string_cols[0] if len(string_cols) > 0 else df.columns[0]

                val_col = config.get("values")
                # Prevent fdc_id from being used as the value
                if val_col == "fdc_id":
                    val_col = None

                # Ensure we have a valid value column
                if not val_col or val_col not in df.columns:
                    if "amount" in df.columns:
                        val_col = "amount"
                    else:
                        num_cols = [col for col in df.select_dtypes(include=['number']).columns if col != 'fdc_id']
                        val_col = num_cols[0] if len(num_cols) > 0 else df.columns[0]
                
                # Filter out non-macronutrients for pie charts (e.g., Energy)
                temp_df = df.copy()
                if name_col in temp_df.columns:
                    temp_df = temp_df[temp_df[name_col].astype(str).str.contains('Protein|Carbohydrate|lipid', case=False, na=False)]
                    
                # Rule: Zero Value Filtering
                temp_df = temp_df[temp_df[val_col].round(1) > 0]
                if temp_df.empty: continue

                # Rule 1: Highest to Lowest
                df_sorted = temp_df.sort_values(by=val_col, ascending=False)
                
                # Format name column values (for pie slices and legends)
                df_sorted[name_col] = df_sorted[name_col].apply(format_label)
                
                # Calculate percentage
                total = df_sorted[val_col].sum()
                df_sorted['pct_calc'] = (df_sorted[val_col] / total * 100).round(1) if total > 0 else 0
                
                # Row-by-row labels for pie
                def get_pie_label(row):
                    u = str(row['unit_name']).lower().strip() if 'unit_name' in row and pd.notnull(row['unit_name']) else ""
                    unit_str = f" {u}" if u else ""
                    return f"{row[val_col]:.1f}{unit_str} ({row['pct_calc']}%)"
                
                # Apply label formatting to pie chart data
                df_sorted['pie_label'] = df_sorted.apply(get_pie_label, axis=1)
                
                # Get number of slices and set colors
                n = len(df_sorted)
                blue_colors = ["#155289", "#95AAD3", "#B9DBF4"]
                if n > 0:
                    # Use provided colors, looping if more than 3 categories
                    color_seq = [blue_colors[i % len(blue_colors)] for i in range(n)]
                else:
                    color_seq = blue_colors
                
                # Format display title using format_label helper
                display_title = format_label(config.get("title", "Nutrient Composition"))
                
                # Create unit_lower for hover text
                df_sorted['unit_lower'] = df_sorted['unit_name'].fillna("").astype(str).str.lower().str.strip() if 'unit_name' in df_sorted.columns else ""
                
                # --- Create the Pie Chart ---
                fig = px.pie(
                    df_sorted, values=val_col, names=name_col,
                    title=display_title,
                    color_discrete_sequence=color_seq,
                    custom_data=['unit_lower']
                )
                fig.update_traces(
                    textposition='outside',
                    text=df_sorted['pie_label'],
                    textinfo='text',
                    hovertemplate="%{label}<br>%{value:.2f} %{customdata[0]}<extra></extra>"
                )
                fig.update_layout(
                    plot_bgcolor="white", paper_bgcolor="white",
                    font=dict(color="#242424"),
                    title_font_color="#242424",
                    legend=dict(font=dict(color="#242424"))
                )
                final_types.append("pie")
                final_figs.append(fig)

            # --- Metric Display Creation ---
            elif v_type == "metric":
                # Safely grab the amount, ignoring fdc_id
                if "amount" in df.columns:
                    val = float(df["amount"].iloc[0])
                else:
                    num_cols = [col for col in df.select_dtypes(include=['number']).columns if col != 'fdc_id']
                    val = float(df[num_cols[0]].iloc[0]) if len(num_cols) > 0 else float(df.iloc[0, 0])
                
                # Get the label for the metric (e.g., "Calories")
                label = format_label(config.get("title") or df.columns[0])
                
                # Metric unit
                u = str(df["unit_name"].iloc[0]).lower().strip() if "unit_name" in df.columns and pd.notnull(df["unit_name"].iloc[0]) else ""
                unit_str = f" {u}" if u else ""
                
                # Add the metric to the final output arrays (these were previously missing!)
                final_types.append("metric")
                final_figs.append({"label": label, "value": f"{val:.1f}{unit_str}"})

            # --- Table Creation ---
            elif v_type == "table":
                df_clean = df.copy()
                
                # 1. Safely find the amount column
                val_col = None
                if "amount" in df_clean.columns:
                    val_col = "amount"
                else:
                    num_cols = [col for col in df_clean.select_dtypes(include=['number']).columns if col != 'fdc_id']
                    if len(num_cols) > 0:
                        val_col = num_cols[0]
                
                if val_col:
                    # 2. Apply zero filter
                    df_clean = df_clean[df_clean[val_col].round(1) > 0]
                    
                    if not df_clean.empty:
                        # --- 3. HIERARCHICAL TABLE SORTING (Must happen BEFORE column renaming) ---
                        if "nutrient_name" in df_clean.columns:
                            macro_order = ['Energy', 'Water', 'Total Carbohydrate', 'of which Sugars', 'of which Dietary Fiber', 'Protein', 'Total Fat', 'of which Saturated Fat', 'of which Trans Fat', 'of which Monounsaturated Fat', 'of which Polyunsaturated Fat']
                            
                            def get_table_sort_key(name):
                                n = str(name).strip() # Strip accidental whitespace
                                n_lower = n.lower()
                                
                                # Priority 1: Macros
                                if n in macro_order:
                                    return (1, macro_order.index(n), n)
                                    
                                # Priority 2: Vitamins
                                if 'vitamin a' in n_lower or 'carotene' in n_lower or 'retinol' in n_lower: return (2, 1, n)
                                if 'vitamin b1' in n_lower or 'thiamin' in n_lower: return (2, 2, n)
                                if 'vitamin b2' in n_lower or 'riboflavin' in n_lower: return (2, 3, n)
                                if 'vitamin b3' in n_lower or 'niacin' in n_lower: return (2, 4, n)
                                if 'vitamin b5' in n_lower or 'pantothenic' in n_lower: return (2, 5, n)
                                if 'vitamin b6' in n_lower: return (2, 6, n)
                                if 'vitamin b7' in n_lower or 'biotin' in n_lower: return (2, 7, n)
                                if 'vitamin b9' in n_lower or 'folate' in n_lower: return (2, 8, n)
                                if 'vitamin b12' in n_lower: return (2, 9, n)
                                if 'vitamin b' in n_lower or 'b-complex' in n_lower: return (2, 10, n)
                                if 'vitamin c' in n_lower or 'ascorbic' in n_lower: return (2, 11, n)
                                if 'vitamin d' in n_lower: return (2, 12, n)
                                if 'vitamin e' in n_lower or 'tocopherol' in n_lower: return (2, 13, n)
                                if 'vitamin k' in n_lower or 'phylloquinone' in n_lower: return (2, 14, n)
                                
                                # Priority 3: Minerals (Alphabetical Tiebreaker)
                                return (3, 99, n) 
                                
                            df_clean['_sort_key'] = df_clean['nutrient_name'].apply(get_table_sort_key)
                            df_clean = df_clean.sort_values(by='_sort_key', ascending=True).drop(columns=['_sort_key'])
                                            
                        # 4. Format numbers with EU commas
                        def get_table_val(row):
                            u = str(row['unit_name']).lower().strip() if 'unit_name' in row and pd.notnull(row['unit_name']) else ""
                            unit_str = f" {u}" if u else ""
                            us_format = f"{row[val_col]:,.2f}"
                            eu_format = us_format.replace(',', 'X').replace('.', ',').replace('X', '.')
                            return f"{eu_format}{unit_str}"
                        
                        df_clean[val_col] = df_clean.apply(get_table_val, axis=1)

                # 5. Drop redundant columns
                df_clean.drop(columns=[c for c in df_clean.columns if c.lower() in ["unit", "measure", "unit_name", "fdc_id"]], errors='ignore', inplace=True)
                
                # 6. Apply final aesthetic formatting (Sentence Case Headers)
                df_clean.columns = [format_label(col) for col in df_clean.columns]
                df_clean.index = range(1, len(df_clean) + 1)
                
                final_types.append("table")
                final_figs.append(df_clean)

        # Return the results
        return {"visual_type": final_types, "fig": final_figs, "data": df}

    # Return error JSON instead of crashing
    except Exception as e:
        print(f"Visualizer logic error: {e}")
        return {"visual_type": ["table"], "fig": [df], "data": df}


# ====================================================
#  10. BUILD LANGGRAPH (FINAL ASSEMBLY)
# ====================================================
workflow = StateGraph(State)
workflow.add_node("librarian", librarian_node)
workflow.add_node("data_retrieval", data_retrieval_node)
workflow.add_node("visualizer", visualizer_node)

workflow.set_entry_point("librarian")
workflow.add_edge("librarian", "data_retrieval")
workflow.add_edge("data_retrieval", "visualizer")
workflow.add_edge("visualizer", END)

# Compile and export the app
agents_flow = workflow.compile()
