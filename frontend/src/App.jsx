// ============================================
// 1. IMPORTS
// ============================================
import React, { useState, useEffect, useRef } from 'react';
import PlotlyComponent from 'react-plotly.js';
const Plot = PlotlyComponent.default || PlotlyComponent;
import { Send, Database, Table, PieChart, BarChart, Activity, ChevronDown, ChevronUp, AlertCircle, Loader2 } from 'lucide-react';
import './App.css';

// const API_URL = 'http://localhost:8000/ask/';  For local development
const API_URL = 'https://nutrition-backend-355269382421.us-central1.run.app/ask/';  // For deployed cloud run

// ============================================
// 2. MAIN APP COMPONENT
// ============================================
function App() {

  // --- 1. EXISTING STATES ---
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  // --- 2. NEW STATES FOR SIDEBAR & MODAL ---
  const [activeModal, setActiveModal] = useState(null);
  const [foodSearchQuery, setFoodSearchQuery] = useState("");
  const [foodSearchResults, setFoodSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // --- 3. STATIC LISTS ---
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

  // --- FOOD TYPE FILTER STATE ---
  const [selectedFoodType, setSelectedFoodType] = useState('Foundation Food'); // Default to Foundation Food

  // --- DIET TYPE FILTER STATE ---
  const [selectedDietType, setSelectedDietType] = useState('All'); // Default to All

  // --- SIZE FILTER STATE ---
  const [selectedSize, setSelectedSize] = useState('By portion'); // Default to By Portion

  // --- DAILY FOOD TRACKER STATE ---
  const [dailyMeals, setDailyMeals] = useState({
    breakfast: '',
    lunch: '',
    afternoon: '',
    dinner: ''
  });

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

  // FOOD TYPE, DIET TYPE, AND SIZE FILTER STATES
  const FOOD_TYPES = [
    { label: "All Foods", value: "All" },
    { label: "Foundation Food", value: "Foundation Food" },
    { label: "Branded Food", value: "Branded Food" },
    { label: "Survey Food", value: "Survey Food" }
  ];

  const DIET_TYPES = [
    { label: "All Diets", value: "All" },
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
      const response = await fetch(`${API_URL}/search_foods/?q=${encodeURIComponent(query)}`); // For deployed cloud run
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
    } else if (listType === 'diets') {
      newQuery = `Show me foods suitable for a ${itemName} diet.`;
    } else {
      newQuery = itemName;
    }

    setQuery(newQuery);
    setActiveModal(null);
  };

  const submitDailyFood = async () => {
    // 1. Combine the meals into a single AI prompt
    const diaryPrompt = `Calculate the total nutritional intake for my daily food diary:
    Breakfast: ${dailyMeals.breakfast || 'Nothing'}
    Lunch: ${dailyMeals.lunch || 'Nothing'}
    Afternoon snack: ${dailyMeals.afternoon || 'Nothing'}
    Dinner: ${dailyMeals.dinner || 'Nothing'}
    Return a detailed breakdown for every food item.`;

    // 2. Add the user's message to the chat UI (FIXED: Using 'role' instead of 'sender')
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
        content: 'Here is your daily nutrition breakdown:',
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
      setDailyMeals({ breakfast: '', lunch: '', afternoon: '', dinner: '' });
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
          food_type_filter: selectedFoodType, // Send the filter
          diet_type_filter: selectedDietType, // Send the filter
          size_filter: selectedSize           // Send the filter
        }),
      });

      if (!response.ok) throw new Error('Failed to fetch from backend');

      const data = await response.json();
      const assistantMessage = {
        role: 'assistant',
        content: 'Here is the result.',
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
    <div className="app-container">
      <header className="header">
        <div className="logo-container">
          <div className="logo-icon">🥗</div>
          <h1>Nutrition AI</h1>
        </div>
        <p className="subtitle">Ask anything about calories, fats, vitamins and more.</p>
      </header>

      {/* --- 5. NEW FLOATING LEFT SIDEBAR --- */}
      <aside className="sidebar-menu">

        {/* --- Filters Group Title --- */}
        <h4 style={{
          fontSize: '11px',
          textTransform: 'capitalize',
          letterSpacing: '0.05em',
          color: '#64748b',
          marginBottom: '8px',
          marginTop: '0px'
        }}>
          Filters:
        </h4>
        <button
          className={`side-btn ${activeModal === 'food_type' ? 'active' : ''}`}
          onClick={() => setActiveModal('food_type')}
        >
          Food Type
        </button>
        <button
          className={`side-btn ${activeModal === 'size' ? 'active' : ''}`}
          onClick={() => setActiveModal('size')}
        >
          Food Size
        </button>
        <button
          className={`side-btn ${activeModal === 'diet_type' ? 'active' : ''}`}
          onClick={() => setActiveModal('diet_type')}
        >
          Diet Type
        </button>

        {/* --- Search Group Title --- */}
        <h4 style={{
          fontSize: '11px',
          textTransform: 'capitalize',
          letterSpacing: '0.05em',
          color: '#64748b',
          marginBottom: '8px',
          marginTop: '16px' // Add margin-top for group spacing
        }}>
          Search:
        </h4>
        <button
          className={`side-btn ${activeModal === 'foods' ? 'active' : ''}`}
          onClick={() => setActiveModal('foods')}
        >
          Foods
        </button>
        <button
          className={`side-btn ${activeModal === 'vitamins' ? 'active' : ''}`}
          onClick={() => setActiveModal('vitamins')}
        >
          Vitamins
        </button>
        <button
          className={`side-btn ${activeModal === 'minerals' ? 'active' : ''}`}
          onClick={() => setActiveModal('minerals')}
        >
          Minerals
        </button>

        {/* --- Tracker Group Title --- */}
        <h4 style={{
          fontSize: '11px',
          textTransform: 'capitalize',
          letterSpacing: '0.05em',
          color: '#64748b',
          marginBottom: '0px',
          marginTop: '16px' // Add margin-top for group spacing
        }}>
          Tracker:
        </h4>

        <div style={{ flexGrow: 1 }}></div> {/* Pushes the button to the bottom if inside a flex container */}

        {/* --- USER'S BIOLOGY PROFILE SETTINGS BUTTON --- */}
        <button
          className="side-btn"
          onClick={() => setShowProfile(true)}
        >
          User Profile
        </button>

        {/* --- NEW: DAILY FOOD BUTTON --- */}
        <button
          className={`side-btn ${activeModal === 'daily_food' ? 'active' : ''}`}
          onClick={() => setActiveModal('daily_food')}
          style={{ borderTop: '1px solid #e2e8f0', marginTop: 'auto', paddingTop: '16px' }}
        >
          Daily Food
        </button>

      </aside>

      {/* --- 6. NEW DYNAMIC SHARED MODAL --- */}
      {activeModal && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>

            {/* --- UPDATED ALIGNED HEADER --- */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              paddingBottom: '12px',
              borderBottom: '1px solid #e2e8f0'
            }}>
              <h2 style={{
                margin: 0,
                fontSize: '1.25rem',
                color: '#1e293b',
                fontWeight: '700'
              }}>
                {activeModal === 'food_type' && 'Filter by Food Type'}
                {activeModal === 'diet_type' && 'Filter by Diet Type'}
                {activeModal === 'size' && 'Indicate Food Size Type'}
                {activeModal === 'foods' && 'Search Foods'}
                {activeModal === 'vitamins' && 'Search Vitamins'}
                {activeModal === 'minerals' && 'Search Minerals'}
                {activeModal === 'daily_food' && 'Daily Food Diary'}
              </h2>
              <button
                onClick={() => setActiveModal(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  lineHeight: '1',
                  padding: '0'
                }}
              >
                ×
              </button>
            </div>

            <div className="modal-body">

              {/* --- NEW: Food Type Filter UI --- */}
              {activeModal === 'food_type' && (
                <ul className="grid-list single-col">
                  {FOOD_TYPES.map(type => (
                    <li
                      key={type.value}
                      /* --- UPDATED: ALL THREE TOOLTIPS --- */
                      title={
                        type.label === 'Foundation Food'
                          ? "Foundation Foods are basic, unbranded ingredients and raw agricultural products (such as fresh fruits, vegetables, and raw meats). They serve as the core building blocks for recipes and other complex food databases."
                          : type.label === 'Survey Food'
                            ? "Survey Foods reflect what people actually eat. They are comprehensive profiles of mixed dishes and composite foods (like pizza, casseroles, or mixed salads) derived from national dietary surveys."
                            : type.label === 'Branded Food'
                              ? "Branded Foods are commercially packaged products and restaurant menu items. Their nutritional data is provided directly by food brands and manufacturers, typically reflecting the Nutrition Facts panel found on the product packaging."
                              : ""
                      }
                      onClick={() => {
                        setSelectedFoodType(type.value);
                        setActiveModal(null);
                      }}
                      style={{
                        cursor: 'pointer',
                        backgroundColor: selectedFoodType === type.value ? '#e2e8f0' : '#f8fafc',
                        borderLeft: selectedFoodType === type.value ? '4px solid #1e293b' : '1px solid #f1f5f9'
                      }}
                    >
                      {type.label}
                    </li>
                  ))}
                </ul>
              )}

              {/* --- NEW: Diet Type Filter UI --- */}
              {activeModal === 'diet_type' && (
                <ul className="grid-list single-col">
                  {DIET_TYPES.map(type => (
                    <li
                      key={type.value}
                      onClick={() => {
                        setSelectedDietType(type.value);
                        setActiveModal(null);
                      }}
                      style={{
                        cursor: 'pointer',
                        backgroundColor: selectedDietType === type.value ? '#e2e8f0' : '#f8fafc',
                        borderLeft: selectedDietType === type.value ? '4px solid #1e293b' : '1px solid #f1f5f9'
                      }}
                    >
                      {type.label}
                    </li>
                  ))}
                </ul>
              )}

              {/* --- NEW: Size Filter UI --- */}
              {activeModal === 'size' && (
                <ul className="grid-list single-col">
                  {SIZE_TYPES.map(type => (
                    <li
                      key={type.value}
                      onClick={() => {
                        setSelectedSize(type.value);
                        setActiveModal(null);
                      }}
                      style={{
                        cursor: 'pointer',
                        backgroundColor: selectedSize === type.value ? '#e2e8f0' : '#f8fafc',
                        borderLeft: selectedSize === type.value ? '4px solid #1e293b' : '1px solid #f1f5f9'
                      }}
                    >
                      {type.label}
                    </li>
                  ))}
                </ul>
              )}

              {activeModal === 'foods' && (
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

              {activeModal === 'vitamins' && (
                <ul className="grid-list">
                  {VITAMINS_LIST.map(item => (
                    <li key={item} onClick={() => handleItemSelect(item, 'vitamins')} style={{ cursor: 'pointer' }}>
                      {item}
                    </li>
                  ))}
                </ul>
              )}

              {activeModal === 'minerals' && (
                <ul className="grid-list">
                  {MINERALS_LIST.map(item => (
                    <li key={item} onClick={() => handleItemSelect(item, 'minerals')} style={{ cursor: 'pointer' }}>
                      {item}
                    </li>
                  ))}
                </ul>
              )}

              {/* --- DAILY FOOD MODAL BODY --- */}
              {activeModal === 'daily_food' && (
                <div style={{ padding: '0px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                    Type what you eat naturally (e.g., "1 cup of milk, 2 slices of whole wheat bread").
                  </p>

                  {['breakfast', 'lunch', 'afternoon', 'dinner'].map((meal) => (
                    <div key={meal}>
                      <label style={{ display: 'block', textTransform: 'capitalize', marginBottom: '4px', fontSize: '14px', fontWeight: 'bold' }}>
                        {meal === 'afternoon' ? 'Afternoon snack' : meal}
                      </label>
                      <textarea
                        value={dailyMeals[meal]}
                        onChange={(e) => setDailyMeals({ ...dailyMeals, [meal]: e.target.value })}
                        placeholder={`What did you have for ${meal === 'afternoon' ? 'afternoon snack' : meal}?`}
                        style={{
                          width: '100%', minHeight: '60px', padding: '8px',
                          borderRadius: '8px', border: '1px solid #cbd5e1', resize: 'vertical'
                        }}
                      />
                    </div>
                  ))}

                  <button
                    onClick={() => {
                      submitDailyFood();
                      setActiveModal(null);
                    }}
                    style={{
                      backgroundColor: '#155289', color: 'white', padding: '10px',
                      borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer',
                      marginTop: '8px'
                    }}
                  >
                    Calculate Daily Nutrients
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* --- USER'S BIOLOGY PROFILE MODAL --- */}
      {showProfile && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white', padding: '24px', borderRadius: '12px',
            width: '90%', maxWidth: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
          }}>

            {/* --- UPDATED HEADER: Dark Grey Title & Underline --- */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              paddingBottom: '12px',
              borderBottom: '1px solid #e2e8f0' /* Subtle light grey line */
            }}>
              <h2 style={{
                margin: 0,
                fontSize: '1.25rem',
                color: '#1e293b', /* Dark slate grey to match your filters */
                fontWeight: '700'
              }}>
                User's Biology Profile
              </h2>
              <button
                onClick={() => setShowProfile(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#94a3b8', /* Muted grey for the "X" */
                  lineHeight: '1'
                }}
              >
                ×
              </button>
            </div>

            {/* --- FORM BODY (Remains same) --- */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Gender */}
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

              {/* Age & Height Row */}
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

              {/* Weight */}
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', marginBottom: '4px' }}>Weight (kg)</label>
                <input
                  type="number" value={userProfile.weight}
                  onChange={(e) => setUserProfile({ ...userProfile, weight: Number(e.target.value) })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </div>

              {/* Activity Level */}
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

              {/* Save Button */}
              <button
                onClick={() => setShowProfile(false)}
                style={{
                  marginTop: '10px', width: '100%', padding: '12px',
                  backgroundColor: '#155289', color: 'white', border: 'none',
                  borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer'
                }}
              >
                Save Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- NEW: INFORMATION MODAL --- */}
      {showInfo && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white', padding: '24px', borderRadius: '12px',
            width: '90%', maxWidth: '450px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
          }}>

            {/* Header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid #e2e8f0'
            }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b', fontWeight: '700' }}>
                About Nutrition AI
              </h2>
              <button
                onClick={() => setShowInfo(false)}
                style={{
                  background: 'none', border: 'none', fontSize: '1.5rem',
                  cursor: 'pointer', color: '#94a3b8', lineHeight: '1', padding: '0'
                }}
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

      {/* --- EXISTING CHAT CONTAINER --- */}
      <main className="chat-container">
        <div className="messages-list">
          {messages.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">🥦</div>
              <h2>How can I help you today?</h2>
              <p>Try: "What are the macronutrients of an apple?" or "Show me high protein foods."</p>
            </div>
          )}

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

                            {type === 'table' && (
                              <div className="table-container">
                                <Expander
                                  title={(msg.visual_type.length === 1 || msg.visual_type.includes('pie')) ? "Results Table" : "Show table"}
                                  icon={<Table size={16} />}
                                  defaultOpen={msg.visual_type.length === 1 || msg.visual_type.includes('pie')}
                                >
                                  <TableDisplay data={msg.data} />
                                </Expander>
                              </div>
                            )}

                            {/* --- NEW: DAILY DIARY RENDERING --- */}
                            {type === 'diary' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
                                {/* Table 1: The Summed Totals (Open by default) */}
                                <div className="table-container">
                                  <Expander title="Daily Nutrient Totals" icon={<Table size={16} />} defaultOpen={true}>
                                    <TableDisplay data={msg.totals} />
                                  </Expander>
                                </div>
                                {/* Table 2: The Meal-by-Meal Breakdown (Closed by default) */}
                                <div className="table-container">
                                  <Expander title="Detailed Meal Breakdown" icon={<Table size={16} />} defaultOpen={false}>
                                    <TableDisplay data={msg.data} />
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
                  <span>Searching...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />

          {/* --- NEW: FLOATING INFO ICON (Bottom Left) --- */}
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
      </main>

      <footer className="footer">
        {/* --- ALWAYS VISIBLE ACTIVE FILTER INDICATOR --- */}
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <span style={{
            backgroundColor: '#e2e8f0', color: '#334155', padding: '4px 12px',
            borderRadius: '16px', fontSize: '12px', fontWeight: '600', display: 'inline-block'
          }}>
            <span style={{ filter: 'saturate(25%)', marginRight: '6px' }}>🔍</span>
            Filtering by:
            {selectedFoodType !== 'All' ? ` ${selectedFoodType} |` : ''}
            {selectedDietType !== 'All' ? ` ${selectedDietType} Diet |` : ''}
            {selectedSize === 'By 100 gr' ? ' Amount per 100 gr' : ' Amount per portion'}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="input-container">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="E.g., What are the top 10 foods highest in protein?"
            disabled={loading}
          />
          {/* Ensure this button tag is present! */}
          <button type="submit" disabled={loading || !query.trim()}>
            <Send size={20} />
          </button>
        </form>
      </footer>
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