# ============================================
# 1. IMPORTS
# ============================================
from fastapi import FastAPI, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from agents import agents_flow, bq_client
import json
import pandas as pd

# ============================================
# 2. APP INITIALIZATION
# ============================================
app = FastAPI()

# ============================================
# 3. CORS CONFIGURATION
# ============================================
# This tells the server it is allowed to accept requests from outside websites.
app.add_middleware(
    CORSMiddleware,
    #allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_origins=[
        "http://localhost:5173", # Your local React app
        "http://localhost:3000", # Alternative local port just in case
        # "https://your-future-vercel-url.vercel.app" <-- We will add this later!
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# 4. FASTAPI ROUTES (API ENDPOINTS)
# ============================================
@app.post("/ask/")
async def ask(request: Request):
    body = await request.json()
    user_query = body.get("user_query")
    food_type_filter = body.get("food_type_filter", "All")  # Catch the food type filter
    diet_type_filter = body.get("diet_type_filter", "All")  # Catch the diet type filter
    size_filter = body.get("size_filter", "By portion")     # Catch the size filter
    is_daily_log = body.get("is_daily_log", False)          # Catch the daily food log
    user_profile = body.get("user_profile", {})             # Catch the biological profile (default to empty dict)
    
    # Pass it into the LangGraph state
    initial_state = {
        "query": user_query,
        "food_type_filter": food_type_filter,
        "diet_type_filter": diet_type_filter,   
        "size_filter": size_filter,             
        "is_daily_log": is_daily_log,           
        "user_profile": user_profile,           
        "sql_query": None,
        "data": None,
        "error": None,
        "visual_type": None,
        "fig": None
    }
    
    # Run the LangGraph flow
    result = agents_flow.invoke(initial_state)
    
    # Serialize the result for JSON response
    response_data = {
        "sql_query": result.get("sql_query"),
        "error": result.get("error"),
        "visual_type": result.get("visual_type"),
    }
    
    # Handle the data (DataFrame -> List of dicts)
    df = result.get("data")
    if isinstance(df, pd.DataFrame):
        response_data["data"] = df.fillna("").to_dict(orient="records")
    else:
        response_data["data"] = None

    # --- ADD THIS TO CATCH THE MATH TABLE ---
    totals = result.get("totals")
    if isinstance(totals, pd.DataFrame):
        response_data["totals"] = totals.fillna("").to_dict(orient="records")
    else:
        response_data["totals"] = None

    # Handle figures (Plotly Figures or metrics)
    figs = result.get("fig")
    serialized_figs = []
    
    if figs is not None:
        # Normalize to list if single element
        if not isinstance(figs, list):
            figs = [figs]
            
        for f in figs:
            if hasattr(f, "to_json"):
                # Plotly figure
                serialized_figs.append(json.loads(f.to_json()))
            elif isinstance(f, pd.DataFrame):
                # Table data
                serialized_figs.append(f.to_dict(orient="records"))
            elif isinstance(f, dict):
                # Metric or already dict
                serialized_figs.append(f)
            else:
                # Fallback for any other type
                serialized_figs.append(f)
    
    response_data["fig"] = serialized_figs
    
    return response_data

# ============================================
# 5. SEARCH FOODS (AUTOCOMPLETE)
# ============================================
@app.get("/search_foods/")
def search_foods(q: str = Query(..., min_length=3)):
    """Quickly searches BigQuery for food descriptions matching the user's input."""
    try:
        # We limit to 15 results to keep the UI snappy and readable
        sql = f"""
            SELECT DISTINCT fdc_id, description AS name
            FROM `health-lifestyle-493817.db_nutrition.food`
            WHERE LOWER(description) LIKE '%{q.lower()}%'
            LIMIT 15
        """
        
        # Execute query (assuming bq_client is available in your main.py scope)
        df = bq_client.query(sql).to_dataframe()
        
        # Convert the dataframe to a list of dictionaries for JSON
        results = df.to_dict(orient="records")
        return {"results": results}

    # Return error JSON instead of crashing
    except Exception as e:
        print(f"Search Error: {e}")
        return {"error": str(e), "results": []}

# ============================================
# 6. RUN SERVER
# ============================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="[IP_ADDRESS]", port=8000)
