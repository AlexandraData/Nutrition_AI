# ============================================
# 1. IMPORTS
# ============================================
from fastapi import FastAPI, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from agents import agents_flow, bq_client

# ============================================
# 2. APP INITIALIZATION
# ============================================
app = FastAPI()

# ============================================
# 3. CORS CONFIGURATION
# ============================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",                    
        "http://localhost:3000",                    
        "https://health-lifestyle-493817.web.app"   
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

    thread_id = body.get("thread_id", "default_thread")     
    is_daily_log = body.get("is_daily_log", False)          
    user_profile = body.get("user_profile", {})             
    
    initial_state = {
        "query": user_query,          
        "is_daily_log": is_daily_log,           
        "user_profile": user_profile,           
        "sql_query": None,
        "data": None,
        "error": None,
        "visual_type": None,
        "fig": None,
        "summary": None
    }

    config = {"configurable": {"thread_id": thread_id}}

    # Run the LangGraph flow
    result = agents_flow.invoke(initial_state, config=config)

    # CONVERSATIONAL INTERCEPTOR:
    sql_string = result.get("sql_query") or ""
    if "CONVERSATION" in sql_string.upper():
        result["sql_query"] = None
        result["data"] = None
        result["visual_type"] = None
        result["totals"] = None
        result["fig"] = None

    # --- 🔴 THE FIX: PASS DATA DIRECTLY ---
    # agents.py already serialized all data into safe lists and dicts. 
    # We pass it straight to the frontend without running redundant instance checks.
    response_data = {
        "sql_query": result.get("sql_query"),
        "error": result.get("error"),
        "visual_type": result.get("visual_type"),
        "summary": result.get("summary", "Here is the result."),
        "data": result.get("data"),     # <--- Safely passed through
        "totals": result.get("totals"), # <--- Safely passed through
        "fig": result.get("fig")        # <--- Safely passed through
    }
    
    return response_data

# ============================================
# 5. SEARCH FOODS (AUTOCOMPLETE)
# ============================================
@app.get("/search_foods/")
def search_foods(q: str = Query(..., min_length=3)):
    """Quickly searches BigQuery for food descriptions matching the user's input."""
    try:
        sql = f"""
            SELECT DISTINCT fdc_id, description AS name
            FROM `health-lifestyle-493817.db_nutrition.food`
            WHERE LOWER(description) LIKE '%{q.lower()}%'
            LIMIT 15
        """
        df = bq_client.query(sql).to_dataframe()
        results = df.to_dict(orient="records")
        return {"results": results}

    except Exception as e:
        print(f"Search Error: {e}")
        return {"error": str(e), "results": []}

# ============================================
# 6. RUN SERVER
# ============================================
if __name__ == "__main__":
    import os
    import uvicorn
    
    port = int(os.environ.get("PORT", 8000))
    
    # 🔴 THE FIX: Google Cloud Run requires "0.0.0.0", not the literal string "[IP_ADDRESS]"
    uvicorn.run(app, host="0.0.0.0", port=port)