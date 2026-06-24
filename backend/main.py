# ============================================
# 1. IMPORTS
# ============================================
from fastapi import FastAPI, Request, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
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
# BACKGROUND LOGGING HELPER FUNCTION
# ============================================
def save_log_to_bigquery(user_query: str, ai_answer: str, has_error: bool):
    """Saves the chat log to BigQuery silently in the background."""
    try:
        table_id = "health-lifestyle-493817.db_nutrition.chat_logs"
        
        row_to_insert = [
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "user_question": str(user_query),
                "ai_answer": str(ai_answer),
                "has_error": bool(has_error)
            }
        ]
        
        # insert_rows_json safely handles escaping quotes and prevents SQL injection
        errors = bq_client.insert_rows_json(table_id, row_to_insert)
        if errors:
            print(f"Error saving log to BigQuery: {errors}")
            
    except Exception as e:
        print(f"Background task crashed: {e}")

# ============================================
# 4. FASTAPI ROUTES (API ENDPOINTS)
# ============================================
@app.post("/ask/")
async def ask(request: Request, background_tasks: BackgroundTasks):
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

    response_data = {
        "sql_query": result.get("sql_query"),
        "error": result.get("error"),
        "visual_type": result.get("visual_type"),
        "summary": result.get("summary", "Here is the result."),
        "data": result.get("data"),     
        "totals": result.get("totals"), 
        "fig": result.get("fig")        
    }
    
    # ============================================
    # TRIGGER THE ZERO-DELAY BACKGROUND TASK
    # ============================================
    is_error = True if response_data.get("error") else False
    summary_text = response_data.get("error") if is_error else response_data.get("summary")
    
    background_tasks.add_task(
        save_log_to_bigquery, 
        user_query=user_query, 
        ai_answer=summary_text, 
        has_error=is_error
    )
    
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
    
    uvicorn.run(app, host="0.0.0.0", port=port)