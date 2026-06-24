// ============================================
// 1. IMPORTS
// ============================================
import React, { useState, useEffect, useRef } from 'react';
import PlotlyComponent from 'react-plotly.js';
const Plot = PlotlyComponent.default || PlotlyComponent;
import {
  Send, Database, Table, PieChart, BarChart, Activity, ChevronDown,
  ChevronUp, AlertCircle, Loader2, User, Utensils, Tag, Scale, Leaf,
  Search, Pill, Droplet, Apple, Beef, Fish, MessageCircle
} from 'lucide-react';
import './App.css';
import jsPDF from "jspdf";
import "jspdf-autotable";
import html2canvas from "html2canvas";

// const API_URL = 'http://localhost:8000/ask/';  For local development
const BASE_URL = 'https://nutrition-backend-355269382421.us-central1.run.app';    // For deployed cloud run
const API_URL = `${BASE_URL}/ask/`;

// ============================================
// 2. MAIN APP COMPONENT
// ============================================
function App() {

  // --- EXISTING STATES ---
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  // --- THREAD ID FOR MEMORY ---
  // Create a random ID once when the page loads
  const [threadId, setThreadId] = useState(() => Math.random().toString(36).substring(7));

  // --- CHAT HISTORY STATE (Loads from Browser Memory) ---
  const [chatHistory, setChatHistory] = useState(() => {
    const saved = localStorage.getItem('nutrition_ai_chats');
    return saved ? JSON.parse(saved) : [];
  });

  // --- FUNCTION TO SAVE & CLEAR CHAT ---
  const startNewChat = () => {
    // Only save if there's actually a conversation to save
    if (messages.length > 0) {
      // Find the first question the user asked to use as the button title
      const firstUserMsg = messages.find(m => m.role === 'user');
      const title = firstUserMsg ? firstUserMsg.content : "Daily Food Log";

      const newChatToSave = {
        threadId: threadId,
        title: title,
        messages: messages
      };

      // Add to the top of the history list, and keep a maximum of 15 recent chats
      const updatedHistory = [newChatToSave, ...chatHistory].slice(0, 15);

      setChatHistory(updatedHistory); // Update React UI
      localStorage.setItem('nutrition_ai_chats', JSON.stringify(updatedHistory)); // Save to browser
    }

    // Now clear the screen for the new chat
    setMessages([]);
    setThreadId(Math.random().toString(36).substring(7));
    setQuery("");
  };

  // --- FUNCTION TO LOAD PAST CHATS ---
  const loadPastChat = (pastChat) => {
    setMessages(pastChat.messages);
    setThreadId(pastChat.threadId);
  };

  // --- STATES FOR SIDEBAR & MODAL ---
  const [activeModal, setActiveModal] = useState(null);
  const [foodSearchQuery, setFoodSearchQuery] = useState("");
  const [foodSearchResults, setFoodSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // --- STATIC LISTS ---
  const VITAMINS_LIST = [
    "Vitamin A", "Vitamin B1 (Thiamin)", "Vitamin B2 (Riboflavin)", "Vitamin B3 (Niacin)",
    "Vitamin B5 (Pantothenic acid)", "Vitamin B6", "Vitamin B7 (Biotin)", "Vitamin B9 (Folate)",
    "Vitamin B12", "Vitamin C", "Vitamin D", "Vitamin E", "Vitamin K"
  ];

  const MINERALS_LIST = [
    "Calcium, Ca", "Copper, Cu", "Iron, Fe", "Magnesium, Mg", "Manganese, Mn",
    "Phosphorus, P", "Potassium, K", "Selenium, Se", "Sodium, Na", "Zinc, Zn"
  ];

  const DIETS_LIST = [
    "Standard", "Vegetarian", "Vegan"
  ];

  // --- STYLE CHIP STATE & DATA ---
  const [expandedCategory, setExpandedCategory] = useState(null);

  // 1. Create a reference to attach to our helper container
  const helpersRef = useRef(null);

  // 2. Listen for clicks anywhere on the screen
  useEffect(() => {
    function handleClickOutside(event) {
      // If the helper menu is open AND the click was outside the helpersRef container...
      if (helpersRef.current && !helpersRef.current.contains(event.target)) {
        setExpandedCategory(null); // Close the menu
      }
    }

    // Add the event listener
    document.addEventListener("mousedown", handleClickOutside);

    // Clean up the listener when the component unmounts
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const helperQueries = {
    "Foods": [
      "What are the nutrients of a raw apple?",
      "What are the Top 10 fruits with high sugar?",
      "What are the top 10 foods in Omega-3?",
      "What are the Top 15 foods in trans fats?",
      "What are the nutrients of a salmon, coho, wild, cooked?",
      "What are the nutrients of chicken breast?",
      "What are the Top 10 high-protein raw foods?",
      "What are the Top 10 high-protein nuts and seeds?",
      "What are the macronutrients of a banana?",
      "How much protein is in an egg?",
      "What is the vitamin K content of spinach?",
      "What are the Top 20 foods in iron, not fortified, not cereal?",
      "Show me the Top 10 foods in cholesterol",
      "What is the cholesterol content of Cookies, brownies, commercially prepared?",
      'What are the nutrients of Beef, loin, tenderloin roast, separable lean only, boneless, trimmed to 0" fat, select, cooked, roasted?'
    ],
    "Food Size": [
      "What are the calories in 2 sweet potatoes?",
      "Nutrients in 150g of turkey",
      "What are the sugars in 5 strawberries?",
      "Show me the macronutrients of 3 slices of bread"
    ],
    "Diet Type": [
      "Top foods suitable for a Standard diet",
      "Top foods suitable for a Vegetarian diet",
      "Top foods suitable for a Vegan diet"
    ],
    "Food List": [
      "🔍 Search Food List..."
    ],
    "Vitamins": [
      "Top 10 foods in Vitamin A",
      "Top 10 foods in Vitamin B1 (Thiamin)",
      "Top 10 foods in Vitamin B2 (Riboflavin)",
      "Top 10 foods in Vitamin B3 (Niacin)",
      "Top 10 foods in Vitamin B5 (Pantothenic acid)",
      "Top 10 foods in Vitamin B6",
      "Top 10 foods in Vitamin B7 (Biotin)",
      "Top 10 foods in Vitamin B9 (Folate)",
      "Top 10 foods in Vitamin B12",
      "Top 10 foods in Vitamin C",
      "Top 10 foods in Vitamin D",
      "Top 10 foods in Vitamin E",
      "Top 10 foods in Vitamin K"
    ],
    "Minerals": [
      "Top 10 foods high in Calcium, Ca",
      "Top 10 foods high in Copper, Cu",
      "Top 10 foods high in Iron, Fe",
      "Top 10 foods high in Magnesium, Mg",
      "Top 10 foods high in Manganese, Mn",
      "Top 10 foods high in Phosphorus, P",
      "Top 10 foods high in Potassium, K",
      "Top 10 foods high in Selenium, Se",
      "Top 10 foods high in Sodium, Na",
      "Top 10 foods high in Zinc, Zn"
    ]
  };

  // --- ICON MAPPING FUNCTION FOR CATEGORIES ---
  const getCategoryIcon = (category) => {
    switch (category) {
      case "Foods": return <Apple size={14} />;
      case "Food Size": return <Scale size={14} />;
      case "Diet Type": return <Leaf size={14} />;
      case "Food List": return <Search size={14} />;
      case "Vitamins": return <Pill size={14} />;
      case "Minerals": return <Droplet size={14} />;
      default: return null;
    }
  };

  // --- DAILY FOOD TRACKER STATE ---
  const [dailyMeals, setDailyMeals] = useState({
    breakfast: [''],
    lunch: [''],
    afternoon: [''],
    dinner: ['']
  });

  // --- DYNAMIC INGREDIENT HANDLERS ---
  const handleIngredientChange = (mealType, index, value) => {
    const updatedMeals = { ...dailyMeals };
    updatedMeals[mealType][index] = value;
    setDailyMeals(updatedMeals);
  };

  const addIngredientLine = (mealType) => {
    const updatedMeals = { ...dailyMeals };
    updatedMeals[mealType].push('');
    setDailyMeals(updatedMeals);
  };

  // --- USER PROFILE STATE ---
  const [showProfile, setShowProfile] = useState(false);
  const [userProfile, setUserProfile] = useState({
    gender: 'Male',
    age: 30,
    weight: 71, // kg
    height: 182, // cm
    activity: 1.375 // 1.2 = Sedentary, 1.375 = Light, 1.55 = Moderate, 1.725 = Active
  });

  // --- DATA SOURCE INFO STATE ---
  const [showInfo, setShowInfo] = useState(false);
  const [showIngredientTips, setShowIngredientTips] = useState(false);

  // DIET TYPE, AND SIZE FILTER STATES

  const DIET_TYPES = [
    { label: "Standard", value: "Standard" },
    { label: "Vegetarian", value: "Vegetarian" },
    { label: "Vegan", value: "Vegan" }
  ];

  const SIZE_TYPES = [
    { label: "By portion", value: "By portion" },
    { label: "By 100 gr", value: "By 100 gr" }
  ];

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // --- 4. NEW FOOD SEARCH HANDLER ---
  const handleFoodSearch = async (e) => {
    const query = e.target.value;
    setFoodSearchQuery(query);

    // Only search if they've typed at least 3 characters
    if (query.length < 3) {
      setFoodSearchResults([]);
      return;
    }

    setIsSearching(true);

    try {
      // const response = await fetch(`http://localhost:8000/search_foods/?q=${encodeURIComponent(query)}`); // For local development
      const response = await fetch(`${BASE_URL}/search_foods/?q=${encodeURIComponent(query)}`); // For deployed cloud run
      if (!response.ok) throw new Error("Network response was not ok");

      const data = await response.json();
      setFoodSearchResults(data.results || []);
    } catch (error) {
      console.error("Failed to fetch foods:", error);
      setFoodSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // --- NEW ITEM SELECT HANDLER ---
  const handleItemSelect = (itemName, listType = 'foods') => {
    let newQuery = '';

    // Format the question based on what list the user clicked from
    if (listType === 'foods') {
      newQuery = `What are the nutrients of ${itemName}?`;
    } else if (listType === 'vitamins' || listType === 'minerals') {
      newQuery = `What are the top 10 foods in ${itemName}?`;
      //} else if (listType === 'diets') {
      //  newQuery = `Show me foods suitable for a ${itemName} diet.`;
    } else if (listType === 'food_type') {
      newQuery = `Show me 10 examples of ${itemName}.`;
    } else if (listType === 'diet_type') {
      newQuery = `Show me top foods suitable for a ${itemName} diet.`;
    } else if (listType === 'size') {
      newQuery = `Show me the nutrients of an apple calculated ${itemName.toLowerCase()}.`;
    } else {
      newQuery = itemName;
    }

    setQuery(newQuery);
    setActiveModal(null);
  };

  const submitDailyFood = async () => {
    // 1. Collect all valid items across all meals to get the exact count
    const allItems = [
      ...dailyMeals.breakfast,
      ...dailyMeals.lunch,
      ...dailyMeals.afternoon,
      ...dailyMeals.dinner
    ].filter(item => item.trim() !== '');

    const totalItemsCount = allItems.length;

    // Optional: Prevent them from submitting a completely empty day
    if (totalItemsCount === 0) return;

    // 2. Format arrays as vertical bulleted lists (LLMs process lists better than commas)
    const formatMeal = (mealArray) => {
      const cleaned = mealArray.filter(item => item.trim() !== '');
      return cleaned.length > 0 ? cleaned.map(item => `  - ${item}`).join('\n') : '  - Nothing';
    };

    // 3. Build a highly constrained prompt using the exact item count
    const diaryPrompt = `Calculate the total nutritional intake for my daily food diary. 
    I am providing EXACTLY ${totalItemsCount} food items. You MUST return a nutritional breakdown for EVERY SINGLE ONE of these ${totalItemsCount} items.

    My Meals:
    Breakfast:
    ${formatMeal(dailyMeals.breakfast)}

    Lunch:
    ${formatMeal(dailyMeals.lunch)}

    Afternoon snack:
    ${formatMeal(dailyMeals.afternoon)}

    Dinner:
    ${formatMeal(dailyMeals.dinner)}

    CRITICAL INSTRUCTIONS:
    1. Do NOT skip any items. 
    2. If you cannot find an exact match in the database, search for the closest generic equivalent (e.g., if "whole wheat bread" fails, search for "wheat bread").
    3. Verify that your final output includes exactly ${totalItemsCount} distinct foods before finalizing your response.`;

    // 4. Add the user's message to the chat UI
    const newUserMsg = { role: 'user', content: "Calculated Daily Food Diary." };
    setMessages(prev => [...prev, newUserMsg]);
    setLoading(true);

    try {
      // 3. Send to backend just like a normal query
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_query: diaryPrompt,
          is_daily_log: true,
          user_profile: userProfile
        }),
      });

      if (!response.ok) throw new Error('Failed to fetch from backend');

      const data = await response.json();

      // Using 'role: assistant' and adding a text 'content' so the chat bubble isn't empty
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.summary || 'Here is your daily nutrition breakdown:', // Look for the AI summary, fallback to the static text
        visual_type: data.visual_type,
        data: data.data,
        fig: data.fig,
        totals: data.totals
      }]);
    } catch (error) {
      // Using 'role: assistant' and matching your existing error UI structure
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Failed to calculate diary.',
        error: 'There was an issue processing your daily food.'
      }]);
    } finally {
      setLoading(false);
      // Clear the form for the next day
      setDailyMeals({ breakfast: [''], lunch: [''], afternoon: [''], dinner: [''] });
    }
  };

  // --- EXISTING SUBMIT HANDLER ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    const userMessage = { role: 'user', content: query };
    setMessages(prev => [...prev, userMessage]);
    setQuery('');
    setLoading(true);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_query: query,
          thread_id: threadId,        // Pass the ID to the backend
          is_daily_log: false,        // Catch the daily food log
          user_profile: userProfile   // Catch the biological profile
        }),
      });

      if (!response.ok) throw new Error('Failed to fetch from backend');

      const data = await response.json();
      const assistantMessage = {
        role: 'assistant',
        content: data.summary || 'Here is the result.', // Look for the AI summary, fallback if it fails
        ...data
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Error: ' + error.message,
        error: error.message
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-layout">

      {/* ========================================= */}
      {/* 1. LEFT SIDEBAR                     */}
      {/* ========================================= */}
      <aside className="main-sidebar">
        {/* Logo & Subtitle */}
        <div className="sidebar-brand">
          <h2>🥗 Nutrition AI</h2>
        </div>

        {/* Tracker Section */}
        <div className="sidebar-section">
          <h4>Food Tracker</h4>
          <button className="side-btn" onClick={() => setShowProfile(true)}>
            <User size={16} /> User Profile
          </button>
          <button className="side-btn" onClick={() => setActiveModal('daily_food')}>
            <Utensils size={16} /> Daily Food
          </button>
        </div>

        {/* New Chat Button */}
        <button className="new-chat-btn" onClick={startNewChat}>
          <MessageCircle size={16} /> New Chat
        </button>

        {/* Recent Chats */}
        <div className="sidebar-section recent-chats">
          <h4>Recent chat</h4>
          {chatHistory.length === 0 ? (
            <p style={{ fontSize: '12px', color: '#94a3b8', padding: '0 8px' }}>No recent chats</p>
          ) : (
            chatHistory.map((chat) => (
              <button
                key={chat.threadId}
                className="history-btn"
                onClick={() => loadPastChat(chat)}
                title={chat.title}
              >
                {chat.title}
              </button>
            ))
          )}
        </div>

      </aside>

      {/* ========================================= */}
      {/* 2. MAIN CHAT AREA                         */}
      {/* ========================================= */}
      <main className="main-content">

        {/* --- WELCOME SCREEN --- */}
        {messages.length === 0 && (
          <div className="welcome-screen">
            <div className="welcome-icon">🥦</div>

            <h1 className="welcome-title">
              How can I help you<br />
              <span className="highlight-green">eat better</span> today?
            </h1>

            <p className="welcome-subtitle">
              Ask about calories, macros, vitamins, swaps, recipes — or log what you ate and I'll do the math.
            </p>

            <div className="suggestion-cards">
              <button className="suggestion-card" onClick={() => setQuery("What are the nutrients of a raw apple?")}>
                <div className="card-icon">🍎</div>
                <div className="card-text">
                  <strong>Nutrients of an apple</strong>
                  <span>Calories, carbs, fiber & more</span>
                </div>
              </button>

              <button className="suggestion-card" onClick={() => setQuery("Show me high-protein raw foods")}>
                <div className="card-icon">💪</div>
                <div className="card-text">
                  <strong>Show me high-protein foods</strong>
                  <span>Plant & animal sources, ranked</span>
                </div>
              </button>

              <button className="suggestion-card" onClick={() => setQuery("Healthy fats vs. unhealthy fats")}>
                <div className="card-icon">🥑</div>
                <div className="card-text">
                  <strong>Healthy fats vs. unhealthy fats</strong>
                  <span>What to choose, what to limit</span>
                </div>
              </button>

              <button className="suggestion-card" onClick={() => setActiveModal('daily_food')}>
                <div className="card-icon">📝</div>
                <div className="card-text">
                  <strong>Log my food intake</strong>
                  <span>Breakfast: 2 eggs</span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* --- CHAT MESSAGES WINDOW --- */}
        <div className="chat-window" style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          {messages.map((msg, idx) => (
            <div key={idx} className={`message-wrapper ${msg.role}`}>
              <div className="message-content">
                {msg.role === 'assistant' && (
                  <div className="assistant-avatar">AI</div>
                )}

                <div className="message-bubble">
                  <div className="message-text">{msg.content}</div>

                  {msg.role === 'assistant' && msg.visual_type && (
                    <div className="visualizations">
                      {msg.visual_type.map((type, i) => {
                        const isBar = type === 'bar';
                        const numItems = isBar ? (msg.fig[i].data[0]?.y?.length || 5) : 0;
                        const dynamicHeight = isBar ? Math.max(150, (numItems * 45) + 60) : 400;

                        return (
                          <div key={i} className="viz-item">
                            {type === 'metric' && (
                              <div className="metric-card">
                                <div className="metric-label">{msg.fig[i].label}</div>
                                <div className="metric-value">{msg.fig[i].value}</div>
                              </div>
                            )}

                            {/* --- PLOT RENDERING --- */}
                            {(type === 'bar' || type === 'pie') && (
                              <div className="plot-container">
                                <Plot
                                  data={msg.fig[i].data.map(trace => ({
                                    ...trace,
                                    textfont: { size: 10 },
                                    cliponaxis: false,
                                    name: typeof trace.name === 'string' ? trace.name.replaceAll('_', ' ') : trace.name,
                                    labels: Array.isArray(trace.labels) ? trace.labels.map(label => typeof label === 'string' ? label.replaceAll('_', ' ') : label) : trace.labels,
                                    hovertemplate: typeof trace.hovertemplate === 'string' ? trace.hovertemplate.replaceAll('_', ' ') : trace.hovertemplate
                                  }))}
                                  layout={{
                                    ...msg.fig[i].layout,
                                    height: dynamicHeight,
                                    bargap: 0.15,
                                    width: undefined,
                                    autosize: true,
                                    margin: { t: 40, b: 60, l: 250, r: 80 },
                                    paper_bgcolor: 'transparent',
                                    plot_bgcolor: 'transparent',
                                    xaxis: {
                                      ...(msg.fig[i].layout?.xaxis || {}),
                                      tickfont: { size: 10 },
                                      titlefont: { size: 12 }
                                    },
                                    yaxis: {
                                      ...(msg.fig[i].layout?.yaxis || {}),
                                      tickfont: { size: 10 },
                                      titlefont: { size: 12 }
                                    }
                                  }}
                                  useResizeHandler={true}
                                  style={{ width: '100%', height: `${dynamicHeight}px` }}
                                  config={{ displayModeBar: false, responsive: true }}
                                />
                              </div>
                            )}

                            {/* --- STANDARD TABLE RENDERING (ONLY ONE BLOCK NOW!) --- */}
                            {type === 'table' && (
                              <div className="table-container">
                                <Expander
                                  title={(msg.visual_type.length === 1 || msg.visual_type.includes('pie')) ? "Results Table" : "Show table"}
                                  icon={<Table size={16} />}
                                  defaultOpen={msg.visual_type.length === 1 || msg.visual_type.includes('pie')}
                                >
                                  {/* Unpack smuggled dictionary, or fallback safely to raw data */}
                                  <TableDisplay data={msg.fig[i]?.table_data || msg.data} />
                                </Expander>
                              </div>
                            )}

                            {/* --- DAILY DIARY RENDERING --- */}
                            {type === 'diary' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
                                {/* Table 1: The Summed Totals */}
                                <div className="table-container">
                                  <Expander title="Daily Nutrient Totals" icon={<Table size={16} />} defaultOpen={true}>
                                    <TableDisplay data={msg.fig[msg.fig.length - 1]?.totals || msg.totals} />
                                  </Expander>
                                </div>
                                {/* Table 2: The Meal-by-Meal Breakdown */}
                                <div className="table-container">
                                  <Expander title="Detailed Meal Breakdown" icon={<Table size={16} />} defaultOpen={false}>
                                    <TableDisplay data={msg.fig[msg.fig.length - 1]?.data || msg.data} />
                                  </Expander>
                                </div>
                              </div>
                            )}

                          </div>
                        );
                      })}

                      {msg.sql_query && (
                        <Expander title="Show SQL" icon={<Database size={16} />}>
                          <pre className="sql-code"><code>{msg.sql_query.replace(/SELECT\s+/i, 'SELECT\n  ').replace(/,\s*/g, ',\n  ')}</code></pre>
                        </Expander>
                      )}
                    </div>
                  )}

                  {msg.error && (
                    <div className="error-box">
                      <AlertCircle size={18} />
                      <span>{msg.error}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="message-wrapper assistant">
              <div className="message-content">
                <div className="assistant-avatar">AI</div>
                <div className="message-bubble loading-bubble">
                  <Loader2 className="animate-spin" size={20} />
                  <span>Searching... up to 2 min</span>
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* --- INPUT BOX & BOTTOM CHIPS --- */}
        <footer className="footer">
          <form onSubmit={handleSubmit} className="input-container">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="E.g., What are the top 10 foods highest in protein?"
              disabled={loading}
            />
            <button type="submit" disabled={loading || !query.trim()}>
              <Send size={20} />
            </button>
          </form>

          {/* --- BOTTOM HELPERS CHIPS --- */}
          <div className="bottom-helpers" ref={helpersRef}>
            {Object.entries(helperQueries).map(([category, queries]) => (
              <div key={category} className="helper-chip-wrapper">
                <button
                  type="button"
                  className="helper-chip"
                  onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
                >
                  {getCategoryIcon(category)}
                  {category}
                </button>

                {expandedCategory === category && (
                  <div className="helper-flyout">
                    {queries.map((q, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="flyout-item"
                        onClick={() => {
                          if (q === "🔍 Search Food List...") {
                            setActiveModal('food_list');
                          } else {
                            setQuery(q);
                          }
                          setExpandedCategory(null);
                        }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </footer>
      </main>


      {/* ========================================= */}
      {/* 3. FLOATING MODALS & ICONS                */}
      {/* ========================================= */}

      {/* --- DYNAMIC SHARED MODAL (Filters/Search) --- */}
      {activeModal && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid #e2e8f0' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b', fontWeight: '700' }}>
                {activeModal === 'foods' && 'Filter by Foods'}
                {activeModal === 'diet_type' && 'Filter by Diet Type'}
                {activeModal === 'size' && 'Indicate Food Size Type'}
                {activeModal === 'food_list' && 'Search Foods'}
                {activeModal === 'vitamins' && 'Search Vitamins'}
                {activeModal === 'minerals' && 'Search Minerals'}
                {activeModal === 'daily_food' && 'Daily Food Diary'}
              </h2>
              <button
                onClick={() => setActiveModal(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8', lineHeight: '1', padding: '0' }}
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              {/* Food Type Filter UI */}
              {activeModal === 'foods' && (
                <ul className="grid-list single-col">
                  {FOOD_TYPES.map(type => (
                    <li
                      key={type.value}
                      title={
                        type.label === 'Foundation Food' ? "Foundation Foods are basic, unbranded ingredients..."
                          : type.label === 'Survey Food' ? "Survey Foods reflect what people actually eat..."
                            : type.label === 'Branded Food' ? "Branded Foods are commercially packaged products..."
                              : ""
                      }
                      onClick={() => handleItemSelect(type.label, 'food_type')}
                      style={{ cursor: 'pointer' }}
                    >
                      {type.label}
                    </li>
                  ))}
                </ul>
              )}

              {/* Diet Type Filter UI */}
              {activeModal === 'diet_type' && (
                <ul className="grid-list single-col">
                  {DIET_TYPES.map(type => (
                    <li key={type.value} onClick={() => handleItemSelect(type.label, 'diet_type')} style={{ cursor: 'pointer' }}>
                      {type.label}
                    </li>
                  ))}
                </ul>
              )}

              {/* Size Filter UI */}
              {activeModal === 'size' && (
                <ul className="grid-list single-col">
                  {SIZE_TYPES.map(type => (
                    <li key={type.value} onClick={() => handleItemSelect(type.label, 'size')} style={{ cursor: 'pointer' }}>
                      {type.label}
                    </li>
                  ))}
                </ul>
              )}

              {/* Search Foods UI */}
              {activeModal === 'food_list' && (
                <div className="food-search-container">
                  <input
                    type="text"
                    placeholder="Type to search the database..."
                    value={foodSearchQuery}
                    onChange={handleFoodSearch}
                    className="food-search-input"
                  />
                  {isSearching && <div className="search-status">Searching database...</div>}
                  <ul className="search-results-list">
                    {foodSearchResults.map(food => (
                      <li key={food.fdc_id} onClick={() => handleItemSelect(food.name)}>
                        {food.name}
                      </li>
                    ))}
                    {foodSearchQuery.length >= 3 && foodSearchResults.length === 0 && !isSearching && (
                      <li className="no-results">No foods found.</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Vitamins UI */}
              {activeModal === 'vitamins' && (
                <ul className="grid-list">
                  {VITAMINS_LIST.map(item => (
                    <li key={item} onClick={() => handleItemSelect(item, 'vitamins')} style={{ cursor: 'pointer' }}>
                      {item}
                    </li>
                  ))}
                </ul>
              )}

              {/* Minerals UI */}
              {activeModal === 'minerals' && (
                <ul className="grid-list">
                  {MINERALS_LIST.map(item => (
                    <li key={item} onClick={() => handleItemSelect(item, 'minerals')} style={{ cursor: 'pointer' }}>
                      {item}
                    </li>
                  ))}
                </ul>
              )}

              {/* Daily Food UI */}
              {activeModal === 'daily_food' && (
                <div style={{ padding: '0px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                    Type what you eat and drink naturally. One ingredient per line. <br />
                    Click + to add a new ingredient.
                    <button
                      type="button"
                      onClick={() => setShowIngredientTips(true)}
                      style={{ background: 'none', border: 'none', padding: 0, margin: '0 0 0 4px', color: '#3b82f6', textDecoration: 'underline', cursor: 'pointer', fontSize: '12px' }}
                    >
                      Read this
                    </button>
                  </p>

                  {['breakfast', 'lunch', 'afternoon', 'dinner'].map((meal) => {
                    const placeholders = {
                      breakfast: 'e.g., 1 slice of bread',
                      lunch: 'e.g., 150 gr rice',
                      afternoon: 'e.g., 1 cup of tea',
                      dinner: 'e.g., 100 gr broccoli'
                    };

                    return (
                      <div key={meal}>
                        <label style={{ display: 'block', textTransform: 'capitalize', marginBottom: '4px', fontSize: '14px', fontWeight: 'bold' }}>
                          {meal === 'afternoon' ? 'Afternoon snack' : meal}
                        </label>
                        <div style={{ backgroundColor: '#333333', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {dailyMeals[meal].map((ingredient, index) => (
                            <input
                              key={index}
                              type="text"
                              value={ingredient}
                              onChange={(e) => handleIngredientChange(meal, index, e.target.value)}
                              placeholder={index === 0 ? placeholders[meal] : ""}
                              style={{ width: '100%', backgroundColor: 'transparent', border: 'none', borderBottom: '1px solid #718096', color: 'white', padding: '4px', fontSize: '14px', outline: 'none' }}
                            />
                          ))}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                            <button
                              type="button"
                              onClick={() => addIngredientLine(meal)}
                              style={{ color: '#cbd5e1', backgroundColor: '#475569', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: 'none', fontSize: '16px', lineHeight: '1' }}
                              title="Add ingredient line"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <button
                    onClick={() => {
                      submitDailyFood();
                      setActiveModal(null);
                    }}
                    style={{ backgroundColor: '#155289', color: 'white', padding: '10px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', marginTop: '8px' }}
                  >
                    Calculate Daily Nutrients
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}


      {/* --- USER PROFILE MODAL --- */}
      {showProfile && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid #e2e8f0' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b', fontWeight: '700' }}>
                User's Biology Profile
              </h2>
              <button
                onClick={() => setShowProfile(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8', lineHeight: '1' }}
              >
                ×
              </button>
            </div>

            {/* Form Body */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', marginBottom: '4px' }}>Gender</label>
                <select
                  value={userProfile.gender}
                  onChange={(e) => setUserProfile({ ...userProfile, gender: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                >
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', marginBottom: '4px' }}>Age (yrs)</label>
                  <input
                    type="number" value={userProfile.age}
                    onChange={(e) => setUserProfile({ ...userProfile, age: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', marginBottom: '4px' }}>Height (cm)</label>
                  <input
                    type="number" value={userProfile.height}
                    onChange={(e) => setUserProfile({ ...userProfile, height: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', marginBottom: '4px' }}>Weight (kg)</label>
                <input
                  type="number" value={userProfile.weight}
                  onChange={(e) => setUserProfile({ ...userProfile, weight: Number(e.target.value) })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', marginBottom: '4px' }}>Activity Level</label>
                <select
                  value={userProfile.activity}
                  onChange={(e) => setUserProfile({ ...userProfile, activity: Number(e.target.value) })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                >
                  <option value={1.2}>Sedentary (Little or no exercise)</option>
                  <option value={1.375}>Lightly active (Light exercise 1-3 days/week)</option>
                  <option value={1.55}>Moderately active (Moderate exercise 3-5 days/week)</option>
                  <option value={1.725}>Very active (Hard exercise 6-7 days/week)</option>
                </select>
              </div>

              <button
                onClick={() => setShowProfile(false)}
                style={{ marginTop: '10px', width: '100%', padding: '12px', backgroundColor: '#155289', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Save Profile
              </button>
            </div>
          </div>
        </div>
      )}


      {/* --- INFORMATION MODAL ("i" Icon) --- */}
      {showInfo && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '450px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid #e2e8f0' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b', fontWeight: '700' }}>
                About Nutrition AI
              </h2>
              <button
                onClick={() => setShowInfo(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8', lineHeight: '1', padding: '0' }}
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', color: '#334155', fontSize: '14px', lineHeight: '1.6' }}>
              <p style={{ margin: 0 }}>
                <strong>Data Source:</strong> The nutritional data provided in this application is sourced directly from the <strong>United States Department of Agriculture (USDA)</strong> FoodData Central database, ensuring highly accurate and scientifically validated food profiles.
              </p>
              <p style={{ margin: 0 }}>
                <strong>Biological Calculations:</strong> Your personalized daily targets are calculated using gold-standard clinical guidelines. Caloric and macronutrient needs use the <strong>Mifflin-St Jeor equation</strong> (adjusted for activity level), while Vitamin and Mineral targets are strictly based on the <strong>NIH Dietary Reference Intakes (DRIs)</strong> tailored to your specific age and gender.
              </p>
            </div>

          </div>
        </div>
      )}

      {/* --- INGREDIENT TIPS MODAL --- */}
      {showIngredientTips && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }}>
          <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '450px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#1e293b', fontWeight: '700' }}>
                Ingredient Matching Tips
              </h3>
              <button
                onClick={() => setShowIngredientTips(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8', lineHeight: '1', padding: '0' }}
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', color: '#334155', fontSize: '13px', lineHeight: '1.5' }}>
              <p style={{ margin: 0 }}>As there are several ingredients with similar names, in order to match the reference of USDA:</p>
              <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <li>For tap water write <strong>'Beverages, water, tap, drinking'</strong> (e.g. <em>1 liter of Beverages, water, tap, drinking</em>).</li>
                <li>For bottle water write <strong>'Water, bottled, non-carbonated, naya'</strong> (e.g. <em>1 Water, bottled, non-carbonated, naya</em>).</li>
                <li>If there is any other ingredient that is not matching your request, first check the name in the <strong>Search 'Food List'</strong> menu.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* --- FLOATING INFO ICON (Bottom Left) --- */}
      <button
        onClick={() => setShowInfo(true)}
        style={{
          position: 'fixed',
          bottom: '24px',
          left: '24px',
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          backgroundColor: '#f8fafc',
          color: '#155289',
          border: '1px solid #cbd5e1',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          fontSize: '1.1rem',
          fontWeight: 'bold',
          fontStyle: 'italic',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 900,        /* Keeps it above other elements but below modals */
          fontFamily: 'serif' /* Gives the 'i' that classic informational look */
        }}
        title="About our data"
      >
        i
      </button>

    </div>
  );
}

// --- Palette & Helper for Category Colors ---
const bluePalette = ["#155289", "#95AAD3", "#B9DBF4", "#4A82B0", "#7A9FC4", "#E0F0FE"];
// Ensure dark backgrounds get white text, and light backgrounds get dark text
const textColors = ["#ffffff", "#0f172a", "#0f172a", "#ffffff", "#0f172a", "#0f172a"];
const categoryColorMap = {};
let categoryColorIndex = 0;

function getCategoryStyle(catName) {
  // Assign a consistent color to each unique category
  if (categoryColorMap[catName] === undefined) {
    categoryColorMap[catName] = categoryColorIndex % bluePalette.length;
    categoryColorIndex++;
  }
  const cIdx = categoryColorMap[catName];
  return {
    backgroundColor: bluePalette[cIdx],
    color: textColors[cIdx],
    padding: '6px 12px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: '600',
    display: 'inline-block'
  };
}

function TableDisplay({ data }) {
  let parsedData = data;
  if (typeof data === 'string') {
    try {
      parsedData = JSON.parse(data);
    } catch (e) {
      console.error("Could not parse data string:", e);
      return <div className="p-4 text-red-500">Error reading database results.</div>;
    }
  }

  if (!Array.isArray(parsedData) || parsedData.length === 0 || !parsedData[0]) {
    return <div className="p-4 text-gray-500">No data found.</div>;
  }

  const columns = Object.keys(parsedData[0]).filter(col => col !== 'unit_name');

  return (
    <div className="table-wrapper overflow-x-auto">
      <table className="min-w-full text-left text-sm whitespace-nowrap">
        <thead className="uppercase tracking-wider border-b-2">
          <tr>
            {columns.map(col => {
              const cleanStr = col.replaceAll('_', ' ');
              const formattedHeader = cleanStr.charAt(0).toUpperCase() + cleanStr.slice(1).toLowerCase();
              return <th key={col} className="px-6 py-4">{formattedHeader}</th>;
            })}
          </tr>
        </thead>
        <tbody>
          {parsedData.map((row, i) => (
            <tr key={i} className="border-b">
              {columns.map(col => {
                if (col.includes('amount') && row.unit_name) {
                  return <td key={col} className="px-6 py-4">{`${row[col]} ${String(row.unit_name).toLowerCase()}`}</td>;
                }

                // Use the dynamic blue palette helper
                if (col.toLowerCase().includes('category') || col.toLowerCase().includes('diet')) {
                  return (
                    <td key={col} className="px-6 py-4">
                      <span style={getCategoryStyle(row[col])}>
                        {row[col]}
                      </span>
                    </td>
                  );
                }

                return <td key={col} className="px-6 py-4">{row[col]}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Expander({ title, children, icon, defaultOpen = false }) {
  // Initialize state using the new defaultOpen prop
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="expander">
      <button className="expander-header" onClick={() => setIsOpen(!isOpen)}>
        <span className="expander-title">
          {icon}
          {title}
        </span>
        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {isOpen && <div className="expander-content">{children}</div>}
    </div>
  );
}

export default App;