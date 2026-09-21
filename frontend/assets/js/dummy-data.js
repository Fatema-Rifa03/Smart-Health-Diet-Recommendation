/* ==========================================================================
   Smart Health & Diet Recommendation System - Local Storage Dummy Data Store
   ========================================================================== */

(function () {
  'use strict';

  const KEYS = {
    CURRENT_USER: 'shd_current_user',
    USERS: 'shd_users',
    DIETITIANS: 'shd_dietitians',
    MEALS: 'shd_logged_meals',
    WATER: 'shd_water_intake',
    SLEEP: 'shd_sleep_log',
    WEIGHT: 'shd_weight_progress',
    RECIPES: 'shd_recipes',
    MEAL_PLANS: 'shd_meal_plans',
    CHAT_MESSAGES: 'shd_chat_messages',
    GUIDANCE_REQUESTS: 'shd_guidance_requests',
    FOOD_DATABASE: 'shd_food_database',
    AUDIT_LOGS: 'shd_audit_logs',
    SETTINGS: 'shd_settings'
  };

  const defaultFoods = [
    { id: 'f1', name: 'Berry Oatmeal', category: 'Breakfast', calories: 350, protein: 12, carbs: 55, fat: 6, portion: '1 bowl (250g)' },
    { id: 'f2', name: 'Scrambled Eggs with Avocado', category: 'Breakfast', calories: 420, protein: 18, carbs: 10, fat: 28, portion: '2 eggs + 1/2 avocado' },
    { id: 'f3', name: 'Grilled Chicken Salad', category: 'Lunch', calories: 480, protein: 42, carbs: 15, fat: 18, portion: '1 bowl (300g)' },
    { id: 'f4', name: 'Quinoa & Veggie Bowl', category: 'Lunch', calories: 410, protein: 14, carbs: 62, fat: 12, portion: '1 bowl' },
    { id: 'f5', name: 'Grilled Salmon with Asparagus', category: 'Dinner', calories: 550, protein: 46, carbs: 12, fat: 26, portion: '200g fillet' },
    { id: 'f6', name: 'Brown Rice & Lentil Curry', category: 'Dinner', calories: 490, protein: 19, carbs: 75, fat: 9, portion: '1 plate' },
    { id: 'f7', name: 'Mixed Roasted Nuts', category: 'Snacks', calories: 180, protein: 6, carbs: 8, fat: 15, portion: 'Handful (30g)' },
    { id: 'f8', name: 'Greek Yogurt with Honey', category: 'Snacks', calories: 210, protein: 15, carbs: 22, fat: 4, portion: '150g' }
  ];

  const defaultDietitians = [
    {
      id: 'd1',
      name: 'Dr. Sarah Jenkins',
      email: 'sarah.j@smarthealth.com',
      specialty: 'Clinical Nutrition & Weight Loss',
      experience: '8 Years',
      status: 'Approved',
      rating: 4.9,
      avatar: 'https://images.unsplash.com/photo-1594824813566-78a933f2c38f?w=150&auto=format&fit=crop&q=80'
    },
    {
      id: 'd2',
      name: 'Dr. Michael Chen',
      email: 'michael.c@smarthealth.com',
      specialty: 'Sports Nutrition & Muscle Gain',
      experience: '6 Years',
      status: 'Approved',
      rating: 4.8,
      avatar: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150&auto=format&fit=crop&q=80'
    },
    {
      id: 'd3',
      name: 'Dr. Emily Vance',
      email: 'emily.v@smarthealth.com',
      specialty: 'Diabetic & Renal Diets',
      experience: '5 Years',
      status: 'Pending',
      rating: 4.7,
      avatar: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=150&auto=format&fit=crop&q=80'
    }
  ];

  const defaultUsers = [
    {
      id: 'u1',
      name: 'Fatema Rifa',
      email: 'user@example.com',
      role: 'user',
      status: 'Active',
      age: 24,
      gender: 'Female',
      height: 165,
      weight: 64.5,
      targetWeight: 60.0,
      goal: 'Weight Loss & Healthy Living',
      dailyCalorieLimit: 2000,
      waterTarget: 2.5,
      sleepTarget: 8,
      joinedDate: '2026-01-15'
    },
    {
      id: 'u2',
      name: 'Tanvir Ahmed',
      email: 'tanvir@example.com',
      role: 'user',
      status: 'Active',
      age: 28,
      gender: 'Male',
      height: 178,
      weight: 76.0,
      targetWeight: 80.0,
      goal: 'Muscle Building',
      dailyCalorieLimit: 2500,
      waterTarget: 3.0,
      sleepTarget: 8,
      joinedDate: '2026-02-10'
    },
    {
      id: 'u3',
      name: 'Nusrat Jahan',
      email: 'nusrat@example.com',
      role: 'user',
      status: 'Active',
      age: 26,
      gender: 'Female',
      height: 160,
      weight: 58.0,
      targetWeight: 55.0,
      goal: 'Keto Maintenance',
      dailyCalorieLimit: 1800,
      waterTarget: 2.5,
      sleepTarget: 7.5,
      joinedDate: '2026-03-01'
    }
  ];

  const defaultLoggedMeals = [
    { id: 'm1', userId: 'u1', date: new Date().toISOString().split('T')[0], category: 'Breakfast', name: 'Berry Oatmeal', calories: 350, loggedAt: '08:30 AM' },
    { id: 'm2', userId: 'u1', date: new Date().toISOString().split('T')[0], category: 'Lunch', name: 'Grilled Chicken Salad', calories: 480, loggedAt: '01:15 PM' },
    { id: 'm3', userId: 'u1', date: new Date().toISOString().split('T')[0], category: 'Snacks', name: 'Mixed Roasted Nuts', calories: 180, loggedAt: '04:45 PM' }
  ];

  const defaultWaterLog = { userId: 'u1', currentAmount: 1.8, targetAmount: 2.5 };
  const defaultSleepLog = { userId: 'u1', durationHours: 7.5, qualityScore: 88, bedtime: '11:00 PM', wakeTime: '06:30 AM' };
  const defaultWeightHistory = [
    { date: '1 MAY', weight: 67.5 },
    { date: '7 MAY', weight: 66.8 },
    { date: '14 MAY', weight: 66.2 },
    { date: '21 MAY', weight: 65.5 },
    { date: '28 MAY', weight: 64.9 },
    { date: 'TODAY', weight: 64.5 }
  ];

  const defaultChats = [
    { id: 'c1', sender: 'Dr. Sarah Jenkins', text: 'Hello Fatema! How is your new breakfast diet plan working for you?', time: '10:15 AM', isDietitian: true },
    { id: 'c2', sender: 'Fatema Rifa', text: 'Hi Dr. Sarah! I feel much more energetic. I logged my oatmeal today!', time: '10:18 AM', isDietitian: false },
    { id: 'c3', sender: 'Dr. Sarah Jenkins', text: 'That is wonderful news! Keep up the good water intake today as well.', time: '10:20 AM', isDietitian: true }
  ];

  const defaultRecipes = [
    { id: 'r1', title: 'High-Protein Avocado Chicken Bowl', category: 'Lunch', calories: 450, prepTime: '20 mins', author: 'Dr. Sarah Jenkins', image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&auto=format&fit=crop&q=80' },
    { id: 'r2', title: 'Berry Chia Protein Smoothie', category: 'Breakfast', calories: 280, prepTime: '10 mins', author: 'Dr. Michael Chen', image: 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=300&auto=format&fit=crop&q=80' }
  ];

  const defaultAuditLogs = [
    { id: 'AUD-105', type: 'System Alert', description: 'Database backup synchronized successfully.', timestamp: 'Today, 08:30 AM', status: 'Completed', actor: 'System' },
    { id: 'AUD-104', type: 'User Event', description: 'Calorie limit alert triggered for user Fatema Rifa', timestamp: 'Today, 04:45 PM', status: 'Logged', actor: 'Fatema Rifa' },
    { id: 'AUD-103', type: 'Dietitian Action', description: 'Published new meal plan: Low-Carb Weight Loss', timestamp: 'Today, 02:15 PM', status: 'Completed', actor: 'Dr. Sarah Jenkins' },
    { id: 'AUD-102', type: 'Admin Action', description: 'Approved Dietitian Dr. Sarah Jenkins', timestamp: 'Yesterday, 11:30 AM', status: 'Approved', actor: 'Admin' },
    { id: 'AUD-101', type: 'System Event', description: 'System initialize with local dummy storage state', timestamp: 'Yesterday, 09:00 AM', status: 'Active', actor: 'System' }
  ];

  const defaultSettings = {
    warnPct: 80,
    defaultWater: 2.5,
    defaultSleep: 8.0,
    maintenanceMode: false,
    autoApproveDietitians: false
  };

  window.SHD_Data = {
    init: function () {
      if (!localStorage.getItem(KEYS.FOOD_DATABASE)) localStorage.setItem(KEYS.FOOD_DATABASE, JSON.stringify(defaultFoods));
      if (!localStorage.getItem(KEYS.DIETITIANS)) localStorage.setItem(KEYS.DIETITIANS, JSON.stringify(defaultDietitians));
      if (!localStorage.getItem(KEYS.USERS)) localStorage.setItem(KEYS.USERS, JSON.stringify(defaultUsers));
      if (!localStorage.getItem(KEYS.MEALS)) localStorage.setItem(KEYS.MEALS, JSON.stringify(defaultLoggedMeals));
      if (!localStorage.getItem(KEYS.WATER)) localStorage.setItem(KEYS.WATER, JSON.stringify(defaultWaterLog));
      if (!localStorage.getItem(KEYS.SLEEP)) localStorage.setItem(KEYS.SLEEP, JSON.stringify(defaultSleepLog));
      if (!localStorage.getItem(KEYS.WEIGHT)) localStorage.setItem(KEYS.WEIGHT, JSON.stringify(defaultWeightHistory));
      if (!localStorage.getItem(KEYS.CHAT_MESSAGES)) localStorage.setItem(KEYS.CHAT_MESSAGES, JSON.stringify(defaultChats));
      if (!localStorage.getItem(KEYS.GUIDANCE_REQUESTS)) localStorage.setItem(KEYS.GUIDANCE_REQUESTS, JSON.stringify([]));
      if (!localStorage.getItem(KEYS.RECIPES)) localStorage.setItem(KEYS.RECIPES, JSON.stringify(defaultRecipes));
      if (!localStorage.getItem(KEYS.AUDIT_LOGS)) localStorage.setItem(KEYS.AUDIT_LOGS, JSON.stringify(defaultAuditLogs));
      if (!localStorage.getItem(KEYS.SETTINGS)) localStorage.setItem(KEYS.SETTINGS, JSON.stringify(defaultSettings));
      if (!localStorage.getItem(KEYS.CURRENT_USER)) localStorage.setItem(KEYS.CURRENT_USER, JSON.stringify({ name: 'System Administrator', email: 'admin@smarthealth.com', role: 'admin' }));
    },

    getFoodDatabase: () => JSON.parse(localStorage.getItem(KEYS.FOOD_DATABASE)) || [],
    getDietitians: () => JSON.parse(localStorage.getItem(KEYS.DIETITIANS)) || [],
    getUsers: () => JSON.parse(localStorage.getItem(KEYS.USERS)) || [],
    getLoggedMeals: () => JSON.parse(localStorage.getItem(KEYS.MEALS)) || [],
    getWaterLog: () => JSON.parse(localStorage.getItem(KEYS.WATER)) || defaultWaterLog,
    getSleepLog: () => JSON.parse(localStorage.getItem(KEYS.SLEEP)) || defaultSleepLog,
    getWeightHistory: () => JSON.parse(localStorage.getItem(KEYS.WEIGHT)) || defaultWeightHistory,
    getChats: () => JSON.parse(localStorage.getItem(KEYS.CHAT_MESSAGES)) || [],
    getGuidanceRequests: () => JSON.parse(localStorage.getItem(KEYS.GUIDANCE_REQUESTS)) || [],
    getRecipes: () => JSON.parse(localStorage.getItem(KEYS.RECIPES)) || [],
    getAuditLogs: () => JSON.parse(localStorage.getItem(KEYS.AUDIT_LOGS)) || [],
    getSettings: () => JSON.parse(localStorage.getItem(KEYS.SETTINGS)) || defaultSettings,
    getCurrentUser: () => JSON.parse(localStorage.getItem(KEYS.CURRENT_USER)),

    setCurrentUser: (userObj) => localStorage.setItem(KEYS.CURRENT_USER, JSON.stringify(userObj)),

    // User CRUD
    addUser: function (user) {
      const users = this.getUsers();
      user.id = 'u_' + Date.now();
      user.status = user.status || 'Active';
      user.joinedDate = user.joinedDate || new Date().toISOString().split('T')[0];
      users.push(user);
      localStorage.setItem(KEYS.USERS, JSON.stringify(users));
      this.addAuditLog('Admin Action', `Added new user account: ${user.name} (${user.email})`, 'Completed');
      return users;
    },

    updateUser: function (id, updatedFields) {
      const users = this.getUsers();
      const index = users.findIndex(u => u.id === id);
      if (index !== -1) {
        users[index] = { ...users[index], ...updatedFields };
        localStorage.setItem(KEYS.USERS, JSON.stringify(users));
        this.addAuditLog('Admin Action', `Updated user account details for ${users[index].name}`, 'Completed');
      }
      return users;
    },

    deleteUser: function (id) {
      let users = this.getUsers();
      const target = users.find(u => u.id === id);
      users = users.filter(u => u.id !== id);
      localStorage.setItem(KEYS.USERS, JSON.stringify(users));
      if (target) {
        this.addAuditLog('Admin Action', `Deleted user account: ${target.name}`, 'Warning');
      }
      return users;
    },

    toggleUserStatus: function (id) {
      const users = this.getUsers();
      const user = users.find(u => u.id === id);
      if (user) {
        user.status = (user.status === 'Active' ? 'Inactive' : 'Active');
        localStorage.setItem(KEYS.USERS, JSON.stringify(users));
        this.addAuditLog('Admin Action', `Toggled account status for ${user.name} to ${user.status}`, 'Completed');
      }
      return users;
    },

    // Dietitian CRUD & Approval
    addDietitian: function (dietitian) {
      const dietitians = this.getDietitians();
      dietitian.id = 'd_' + Date.now();
      dietitian.status = dietitian.status || 'Pending';
      dietitian.rating = dietitian.rating || 5.0;
      dietitian.avatar = dietitian.avatar || 'https://images.unsplash.com/photo-1594824813566-78a933f2c38f?w=150&auto=format&fit=crop&q=80';
      dietitians.push(dietitian);
      localStorage.setItem(KEYS.DIETITIANS, JSON.stringify(dietitians));
      this.addAuditLog('Dietitian Registration', `Registered new dietitian: ${dietitian.name}`, 'Pending');
      return dietitians;
    },

    approveDietitian: function (id) {
      const dietitians = this.getDietitians();
      const d = dietitians.find(item => item.id === id);
      if (d) {
        d.status = 'Approved';
        localStorage.setItem(KEYS.DIETITIANS, JSON.stringify(dietitians));
        this.addAuditLog('Admin Action', `Approved dietitian registration for ${d.name}`, 'Approved');
      }
      return dietitians;
    },

    rejectDietitian: function (id) {
      const dietitians = this.getDietitians();
      const d = dietitians.find(item => item.id === id);
      if (d) {
        d.status = 'Rejected';
        localStorage.setItem(KEYS.DIETITIANS, JSON.stringify(dietitians));
        this.addAuditLog('Admin Action', `Rejected dietitian registration for ${d.name}`, 'Rejected');
      }
      return dietitians;
    },

    suspendDietitian: function (id) {
      const dietitians = this.getDietitians();
      const d = dietitians.find(item => item.id === id);
      if (d) {
        d.status = 'Suspended';
        localStorage.setItem(KEYS.DIETITIANS, JSON.stringify(dietitians));
        this.addAuditLog('Admin Action', `Suspended dietitian account for ${d.name}`, 'Warning');
      }
      return dietitians;
    },

    deleteDietitian: function (id) {
      let dietitians = this.getDietitians();
      const d = dietitians.find(item => item.id === id);
      dietitians = dietitians.filter(item => item.id !== id);
      localStorage.setItem(KEYS.DIETITIANS, JSON.stringify(dietitians));
      if (d) {
        this.addAuditLog('Admin Action', `Deleted dietitian profile: ${d.name}`, 'Warning');
      }
      return dietitians;
    },

    // Food Database CRUD
    addFood: function (food) {
      const foods = this.getFoodDatabase();
      food.id = 'f_' + Date.now();
      foods.push(food);
      localStorage.setItem(KEYS.FOOD_DATABASE, JSON.stringify(foods));
      this.addAuditLog('Admin Action', `Added food item "${food.name}" to catalog`, 'Completed');
      return foods;
    },

    updateFood: function (id, updatedFields) {
      const foods = this.getFoodDatabase();
      const index = foods.findIndex(f => f.id === id);
      if (index !== -1) {
        foods[index] = { ...foods[index], ...updatedFields };
        localStorage.setItem(KEYS.FOOD_DATABASE, JSON.stringify(foods));
        this.addAuditLog('Admin Action', `Updated food item "${foods[index].name}"`, 'Completed');
      }
      return foods;
    },

    deleteFood: function (id) {
      let foods = this.getFoodDatabase();
      const target = foods.find(f => f.id === id);
      foods = foods.filter(f => f.id !== id);
      localStorage.setItem(KEYS.FOOD_DATABASE, JSON.stringify(foods));
      if (target) {
        this.addAuditLog('Admin Action', `Deleted food item "${target.name}" from catalog`, 'Warning');
      }
      return foods;
    },

    // Settings
    saveSettings: function (newSettings) {
      const current = this.getSettings();
      const updated = { ...current, ...newSettings };
      localStorage.setItem(KEYS.SETTINGS, JSON.stringify(updated));
      this.addAuditLog('Admin Action', 'Updated system threshold and configuration settings', 'Completed');
      return updated;
    },

    // Audit Log Management
    addAuditLog: function (type, description, status = 'Logged', actor = 'Admin') {
      const logs = this.getAuditLogs();
      const newLog = {
        id: 'AUD-' + Math.floor(100 + Math.random() * 900),
        type: type,
        description: description,
        timestamp: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        status: status,
        actor: actor
      };
      logs.unshift(newLog);
      if (logs.length > 50) logs.pop();
      localStorage.setItem(KEYS.AUDIT_LOGS, JSON.stringify(logs));
      return logs;
    },

    clearAuditLogs: function () {
      localStorage.setItem(KEYS.AUDIT_LOGS, JSON.stringify([]));
      return [];
    },

    // Utility additions
    addMeal: function (meal) {
      const meals = this.getLoggedMeals();
      meal.id = 'm_' + Date.now();
      meal.loggedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      meals.push(meal);
      localStorage.setItem(KEYS.MEALS, JSON.stringify(meals));
      return meals;
    },

    addWater: function (amount) {
      const water = this.getWaterLog();
      water.currentAmount = parseFloat((water.currentAmount + amount).toFixed(1));
      localStorage.setItem(KEYS.WATER, JSON.stringify(water));
      return water;
    },

    addWeight: function (newWeight) {
      const history = this.getWeightHistory();
      history.push({ date: 'TODAY', weight: parseFloat(newWeight) });
      localStorage.setItem(KEYS.WEIGHT, JSON.stringify(history));
      return history;
    },

    addChatMessage: function (text, isDietitian = false, senderName = 'Fatema Rifa') {
      const chats = this.getChats();
      const msg = { id: 'c_' + Date.now(), sender: senderName, text: text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), isDietitian: isDietitian };
      chats.push(msg);
      localStorage.setItem(KEYS.CHAT_MESSAGES, JSON.stringify(chats));
      return chats;
    },

    addGuidanceRequest: function (request) {
      const requests = this.getGuidanceRequests();
      const newRequest = {
        id: 'req_' + Date.now(),
        status: 'Pending',
        createdAt: new Date().toISOString(),
        ...request
      };
      requests.unshift(newRequest);
      localStorage.setItem(KEYS.GUIDANCE_REQUESTS, JSON.stringify(requests));
      return newRequest;
    },

    updateGuidanceRequestStatus: function (id, status) {
      const requests = this.getGuidanceRequests();
      const request = requests.find(item => item.id === id);
      if (request) {
        request.status = status;
        request.updatedAt = new Date().toISOString();
        localStorage.setItem(KEYS.GUIDANCE_REQUESTS, JSON.stringify(requests));
      }
      return requests;
    }
  };

  window.SHD_Data.init();
})();
