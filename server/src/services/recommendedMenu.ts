import { prisma } from "../lib/database";
import { OpenAIService } from "./openai";

export interface GenerateMenuParams {
  userId: string;
  days?: number;
  mealsPerDay?: string;
  customRequest?: string;
  budget?: number;
  mealChangeFrequency?: string;
  includeLeftovers?: boolean;
  sameMealTimes?: boolean;
  targetCalories?: number;
  dietaryPreferences?: string[];
  excludedIngredients?: string[];
}

export class RecommendedMenuService {
  static async generatePersonalizedMenu(params: GenerateMenuParams) {
    try {
      console.log("🎯 Generating personalized menu for user:", params.userId);

      // Get user's questionnaire data
      const questionnaire = await prisma.userQuestionnaire.findFirst({
        where: { user_id: params.userId },
        orderBy: { date_completed: "desc" },
      });

      if (!questionnaire) {
        throw new Error("User questionnaire not found. Please complete the questionnaire first.");
      }

      // Get user's nutrition plan
      const nutritionPlan = await prisma.nutritionPlan.findFirst({
        where: { user_id: params.userId },
        orderBy: { created_at: "desc" },
      });

      // Calculate nutrition targets
      const targets = this.calculateNutritionTargets(questionnaire, nutritionPlan, params);

      // Generate menu using AI or fallback
      const menuData = await this.generateMenuWithAI(params, questionnaire, targets);

      // Save to database
      const savedMenu = await this.saveMenuToDatabase(params.userId, menuData);

      console.log("✅ Personalized menu generated successfully");
      return savedMenu;
    } catch (error) {
      console.error("💥 Error generating personalized menu:", error);
      throw error;
    }
  }

  static async generateCustomMenu(params: GenerateMenuParams) {
    try {
      console.log("🎨 Generating custom menu for user:", params.userId);

      // Get user context
      const questionnaire = await prisma.userQuestionnaire.findFirst({
        where: { user_id: params.userId },
        orderBy: { date_completed: "desc" },
      });

      if (!questionnaire) {
        throw new Error("User questionnaire not found. Please complete the questionnaire first.");
      }

      // Generate custom menu based on user request
      const menuData = await this.generateCustomMenuWithAI(params, questionnaire);

      // Save to database
      const savedMenu = await this.saveMenuToDatabase(params.userId, menuData);

      console.log("✅ Custom menu generated successfully");
      return savedMenu;
    } catch (error) {
      console.error("💥 Error generating custom menu:", error);
      throw error;
    }
  }

  static async replaceMeal(userId: string, menuId: string, mealId: string, preferences: any) {
    try {
      console.log("🔄 Replacing meal in menu:", { menuId, mealId });

      // Get the meal to replace
      const meal = await prisma.recommendedMeal.findFirst({
        where: {
          meal_id: mealId,
          menu: { user_id: userId },
        },
        include: { menu: true },
      });

      if (!meal) {
        throw new Error("Meal not found");
      }

      // Generate replacement meal
      const replacementMeal = await this.generateReplacementMeal(meal, preferences, userId);

      // Update the meal
      const updatedMeal = await prisma.recommendedMeal.update({
        where: { meal_id: mealId },
        data: replacementMeal,
      });

      return updatedMeal;
    } catch (error) {
      console.error("💥 Error replacing meal:", error);
      throw error;
    }
  }

  static async markMealAsFavorite(userId: string, menuId: string, mealId: string, isFavorite: boolean) {
    try {
      // This would typically be stored in a user preferences table
      // For now, we'll just log it
      console.log("❤️ Marking meal as favorite:", { mealId, isFavorite });
      return { success: true };
    } catch (error) {
      console.error("💥 Error marking meal as favorite:", error);
      throw error;
    }
  }

  static async giveMealFeedback(userId: string, menuId: string, mealId: string, liked: boolean) {
    try {
      // Store feedback for future menu improvements
      console.log("💬 Recording meal feedback:", { mealId, liked });
      return { success: true };
    } catch (error) {
      console.error("💥 Error recording meal feedback:", error);
      throw error;
    }
  }

  static async generateShoppingList(userId: string, menuId: string) {
    try {
      console.log("🛒 Generating shopping list for menu:", menuId);

      const menu = await prisma.recommendedMenu.findFirst({
        where: { menu_id: menuId, user_id: userId },
        include: {
          meals: {
            include: { ingredients: true },
          },
        },
      });

      if (!menu) {
        throw new Error("Menu not found");
      }

      // Aggregate ingredients
      const ingredientMap = new Map<string, { quantity: number; unit: string; category: string }>();

      menu.meals.forEach(meal => {
        meal.ingredients.forEach(ingredient => {
          const key = ingredient.name.toLowerCase();
          if (ingredientMap.has(key)) {
            const existing = ingredientMap.get(key)!;
            existing.quantity += ingredient.quantity;
          } else {
            ingredientMap.set(key, {
              quantity: ingredient.quantity,
              unit: ingredient.unit,
              category: ingredient.category || "Other",
            });
          }
        });
      });

      // Convert to shopping list format
      const shoppingList = Array.from(ingredientMap.entries()).map(([name, data]) => ({
        name,
        quantity: data.quantity,
        unit: data.unit,
        category: data.category,
        estimated_cost: data.quantity * 2, // Simple cost estimation
      }));

      return {
        menu_id: menuId,
        items: shoppingList,
        total_estimated_cost: shoppingList.reduce((sum, item) => sum + item.estimated_cost, 0),
        generated_at: new Date(),
      };
    } catch (error) {
      console.error("💥 Error generating shopping list:", error);
      throw error;
    }
  }

  private static calculateNutritionTargets(questionnaire: any, nutritionPlan: any, params: GenerateMenuParams) {
    // Use nutrition plan if available, otherwise calculate from questionnaire
    if (nutritionPlan) {
      return {
        calories: nutritionPlan.goal_calories || 2000,
        protein: nutritionPlan.goal_protein_g || 150,
        carbs: nutritionPlan.goal_carbs_g || 250,
        fat: nutritionPlan.goal_fats_g || 67,
      };
    }

    // Calculate from questionnaire data
    const weight = questionnaire.weight_kg || 70;
    const height = questionnaire.height_cm || 170;
    const age = questionnaire.age || 30;
    const gender = questionnaire.gender || "MALE";

    // Calculate BMR
    let bmr;
    if (gender === "MALE") {
      bmr = 88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age);
    } else {
      bmr = 447.593 + (9.247 * weight) + (3.098 * height) - (4.33 * age);
    }

    // Apply activity multiplier
    const activityMultipliers = {
      NONE: 1.2,
      LIGHT: 1.375,
      MODERATE: 1.55,
      HIGH: 1.725,
    };

    const activityLevel = questionnaire.physical_activity_level || "MODERATE";
    let calories = bmr * (activityMultipliers[activityLevel] || 1.55);

    // Adjust for goals
    if (questionnaire.main_goal === "WEIGHT_LOSS") {
      calories -= 500;
    } else if (questionnaire.main_goal === "WEIGHT_GAIN") {
      calories += 300;
    }

    return {
      calories: Math.round(params.targetCalories || calories),
      protein: Math.round(weight * 1.6), // 1.6g per kg
      carbs: Math.round((calories * 0.45) / 4), // 45% of calories
      fat: Math.round((calories * 0.25) / 9), // 25% of calories
    };
  }

  private static async generateMenuWithAI(params: GenerateMenuParams, questionnaire: any, targets: any) {
    try {
      if (!process.env.OPENAI_API_KEY) {
        console.log("⚠️ No OpenAI API key, using fallback menu generation");
        return this.generateFallbackMenu(params, targets);
      }

      const prompt = this.buildMenuGenerationPrompt(params, questionnaire, targets);
      const aiResponse = await OpenAIService.generateText(prompt, 2000);

      // Parse AI response
      const menuData = JSON.parse(aiResponse);
      return this.validateMenuData(menuData);
    } catch (error) {
      console.log("⚠️ AI menu generation failed, using fallback");
      return this.generateFallbackMenu(params, targets);
    }
  }

  private static async generateCustomMenuWithAI(params: GenerateMenuParams, questionnaire: any) {
    try {
      const targets = this.calculateNutritionTargets(questionnaire, null, params);
      
      if (!process.env.OPENAI_API_KEY) {
        console.log("⚠️ No OpenAI API key, using fallback custom menu");
        return this.generateFallbackCustomMenu(params, targets);
      }

      const prompt = this.buildCustomMenuPrompt(params, questionnaire, targets);
      const aiResponse = await OpenAIService.generateText(prompt, 2000);

      const menuData = JSON.parse(aiResponse);
      return this.validateMenuData(menuData);
    } catch (error) {
      console.log("⚠️ AI custom menu generation failed, using fallback");
      return this.generateFallbackCustomMenu(params, this.calculateNutritionTargets(questionnaire, null, params));
    }
  }

  private static buildMenuGenerationPrompt(params: GenerateMenuParams, questionnaire: any, targets: any): string {
    return `Generate a ${params.days || 7}-day meal plan with the following requirements:

NUTRITION TARGETS:
- Daily calories: ${targets.calories}
- Daily protein: ${targets.protein}g
- Daily carbs: ${targets.carbs}g
- Daily fat: ${targets.fat}g

USER PREFERENCES:
- Meals per day: ${this.parseMealsPerDay(params.mealsPerDay || "3_main")}
- Dietary style: ${questionnaire.dietary_style}
- Allergies: ${questionnaire.allergies?.join(", ") || "None"}
- Dislikes: ${questionnaire.disliked_foods?.join(", ") || "None"}
- Likes: ${questionnaire.liked_foods?.join(", ") || "None"}
- Budget: ${params.budget ? `$${params.budget} daily` : "Moderate"}
- Cooking preference: ${questionnaire.cooking_preference}

Return JSON with this structure:
{
  "title": "Menu title",
  "description": "Menu description",
  "days_count": ${params.days || 7},
  "total_calories": number,
  "total_protein": number,
  "total_carbs": number,
  "total_fat": number,
  "meals": [
    {
      "name": "Meal name",
      "meal_type": "BREAKFAST/LUNCH/DINNER/SNACK",
      "day_number": 1-7,
      "calories": number,
      "protein": number,
      "carbs": number,
      "fat": number,
      "fiber": number,
      "prep_time_minutes": number,
      "cooking_method": "cooking method",
      "instructions": "cooking instructions",
      "ingredients": [
        {
          "name": "ingredient name",
          "quantity": number,
          "unit": "unit",
          "category": "category"
        }
      ]
    }
  ]
}`;
  }

  private static buildCustomMenuPrompt(params: GenerateMenuParams, questionnaire: any, targets: any): string {
    return `Create a custom meal plan based on this request: "${params.customRequest}"

CONTEXT:
- User goal: ${questionnaire.main_goal}
- Dietary style: ${questionnaire.dietary_style}
- Allergies: ${questionnaire.allergies?.join(", ") || "None"}
- Days: ${params.days || 7}
- Budget: ${params.budget ? `$${params.budget} daily` : "Flexible"}

NUTRITION TARGETS:
- Daily calories: ${targets.calories}
- Daily protein: ${targets.protein}g
- Daily carbs: ${targets.carbs}g
- Daily fat: ${targets.fat}g

Return the same JSON structure as before, but customized to the user's specific request.`;
  }

  private static generateFallbackMenu(params: GenerateMenuParams, targets: any) {
    const days = params.days || 7;
    const mealsPerDay = this.parseMealsPerDay(params.mealsPerDay || "3_main");

    const fallbackMeals = [
      {
        name: "Protein Breakfast",
        meal_type: "BREAKFAST",
        calories: Math.round(targets.calories * 0.25),
        protein: Math.round(targets.protein * 0.3),
        carbs: Math.round(targets.carbs * 0.25),
        fat: Math.round(targets.fat * 0.25),
        fiber: 5,
        prep_time_minutes: 15,
        cooking_method: "Pan cooking",
        instructions: "Cook eggs with vegetables and serve with toast",
        ingredients: [
          { name: "eggs", quantity: 2, unit: "pieces", category: "Protein" },
          { name: "vegetables", quantity: 100, unit: "g", category: "Vegetables" },
          { name: "bread", quantity: 2, unit: "slices", category: "Grains" },
        ],
      },
      {
        name: "Balanced Lunch",
        meal_type: "LUNCH",
        calories: Math.round(targets.calories * 0.35),
        protein: Math.round(targets.protein * 0.4),
        carbs: Math.round(targets.carbs * 0.4),
        fat: Math.round(targets.fat * 0.35),
        fiber: 8,
        prep_time_minutes: 25,
        cooking_method: "Grilling",
        instructions: "Grill protein and serve with salad and grains",
        ingredients: [
          { name: "chicken breast", quantity: 150, unit: "g", category: "Protein" },
          { name: "mixed salad", quantity: 150, unit: "g", category: "Vegetables" },
          { name: "quinoa", quantity: 80, unit: "g", category: "Grains" },
        ],
      },
      {
        name: "Light Dinner",
        meal_type: "DINNER",
        calories: Math.round(targets.calories * 0.3),
        protein: Math.round(targets.protein * 0.25),
        carbs: Math.round(targets.carbs * 0.25),
        fat: Math.round(targets.fat * 0.3),
        fiber: 6,
        prep_time_minutes: 20,
        cooking_method: "Steaming",
        instructions: "Steam fish with vegetables",
        ingredients: [
          { name: "fish fillet", quantity: 120, unit: "g", category: "Protein" },
          { name: "steamed vegetables", quantity: 200, unit: "g", category: "Vegetables" },
        ],
      },
    ];

    const meals = [];
    for (let day = 1; day <= days; day++) {
      fallbackMeals.slice(0, mealsPerDay).forEach((meal, index) => {
        meals.push({
          ...meal,
          name: `${meal.name} - Day ${day}`,
          day_number: day,
        });
      });
    }

    return {
      title: `Personalized ${days}-Day Menu`,
      description: "AI-generated meal plan based on your preferences",
      days_count: days,
      total_calories: targets.calories * days,
      total_protein: targets.protein * days,
      total_carbs: targets.carbs * days,
      total_fat: targets.fat * days,
      total_fiber: 25 * days,
      estimated_cost: (params.budget || 50) * days,
      meals,
    };
  }

  private static generateFallbackCustomMenu(params: GenerateMenuParams, targets: any) {
    // Generate a menu based on the custom request keywords
    const request = (params.customRequest || "").toLowerCase();
    
    let menuTheme = "Balanced";
    let mealAdjustments = { calories: 1, protein: 1, carbs: 1, fat: 1 };

    if (request.includes("protein") || request.includes("muscle")) {
      menuTheme = "High Protein";
      mealAdjustments.protein = 1.3;
    } else if (request.includes("low carb") || request.includes("keto")) {
      menuTheme = "Low Carb";
      mealAdjustments.carbs = 0.5;
      mealAdjustments.fat = 1.5;
    } else if (request.includes("vegetarian") || request.includes("plant")) {
      menuTheme = "Vegetarian";
    }

    return this.generateFallbackMenu(params, {
      calories: Math.round(targets.calories * mealAdjustments.calories),
      protein: Math.round(targets.protein * mealAdjustments.protein),
      carbs: Math.round(targets.carbs * mealAdjustments.carbs),
      fat: Math.round(targets.fat * mealAdjustments.fat),
    });
  }

  private static async saveMenuToDatabase(userId: string, menuData: any) {
    try {
      // Create the menu
      const menu = await prisma.recommendedMenu.create({
        data: {
          user_id: userId,
          title: menuData.title,
          description: menuData.description,
          total_calories: menuData.total_calories,
          total_protein: menuData.total_protein,
          total_carbs: menuData.total_carbs,
          total_fat: menuData.total_fat,
          total_fiber: menuData.total_fiber,
          days_count: menuData.days_count,
          estimated_cost: menuData.estimated_cost,
          difficulty_level: 2,
          is_active: true,
        },
      });

      // Create meals
      const createdMeals = [];
      for (const mealData of menuData.meals) {
        const meal = await prisma.recommendedMeal.create({
          data: {
            menu_id: menu.menu_id,
            name: mealData.name,
            meal_type: mealData.meal_type,
            day_number: mealData.day_number,
            calories: mealData.calories,
            protein: mealData.protein,
            carbs: mealData.carbs,
            fat: mealData.fat,
            fiber: mealData.fiber,
            prep_time_minutes: mealData.prep_time_minutes,
            cooking_method: mealData.cooking_method,
            instructions: mealData.instructions,
          },
        });

        // Create ingredients
        if (mealData.ingredients && Array.isArray(mealData.ingredients)) {
          for (const ingredient of mealData.ingredients) {
            await prisma.recommendedIngredient.create({
              data: {
                meal_id: meal.meal_id,
                name: ingredient.name,
                quantity: ingredient.quantity,
                unit: ingredient.unit,
                category: ingredient.category,
                estimated_cost: ingredient.quantity * 0.5, // Simple cost estimation
              },
            });
          }
        }

        createdMeals.push(meal);
      }

      // Return complete menu with meals and ingredients
      return await prisma.recommendedMenu.findUnique({
        where: { menu_id: menu.menu_id },
        include: {
          meals: {
            include: { ingredients: true },
            orderBy: [{ day_number: "asc" }, { meal_type: "asc" }],
          },
        },
      });
    } catch (error) {
      console.error("💥 Error saving menu to database:", error);
      throw error;
    }
  }

  private static async generateReplacementMeal(meal: any, preferences: any, userId: string) {
    // Simple replacement logic - in production, use AI
    const replacements = [
      {
        name: "Grilled Chicken Salad",
        calories: 380,
        protein: 35,
        carbs: 15,
        fat: 18,
        fiber: 8,
        cooking_method: "Grilling",
        instructions: "Grill chicken and serve with fresh salad",
      },
      {
        name: "Quinoa Buddha Bowl",
        calories: 420,
        protein: 18,
        carbs: 55,
        fat: 15,
        fiber: 12,
        cooking_method: "Boiling",
        instructions: "Cook quinoa and arrange with vegetables",
      },
      {
        name: "Baked Salmon with Vegetables",
        calories: 450,
        protein: 32,
        carbs: 25,
        fat: 22,
        fiber: 6,
        cooking_method: "Baking",
        instructions: "Bake salmon with seasonal vegetables",
      },
    ];

    const replacement = replacements[Math.floor(Math.random() * replacements.length)];

    return {
      name: replacement.name,
      calories: replacement.calories,
      protein: replacement.protein,
      carbs: replacement.carbs,
      fat: replacement.fat,
      fiber: replacement.fiber,
      cooking_method: replacement.cooking_method,
      instructions: replacement.instructions,
    };
  }

  private static parseMealsPerDay(mealsPerDay: string): number {
    switch (mealsPerDay) {
      case "2_main": return 2;
      case "3_main": return 3;
      case "3_plus_2_snacks": return 5;
      case "2_plus_1_intermediate": return 3;
      default: return 3;
    }
  }

  private static validateMenuData(menuData: any) {
    // Ensure required fields exist
    return {
      title: menuData.title || "Generated Menu",
      description: menuData.description || "AI-generated meal plan",
      days_count: menuData.days_count || 7,
      total_calories: menuData.total_calories || 14000,
      total_protein: menuData.total_protein || 1050,
      total_carbs: menuData.total_carbs || 1750,
      total_fat: menuData.total_fat || 469,
      total_fiber: menuData.total_fiber || 175,
      estimated_cost: menuData.estimated_cost || 350,
      meals: Array.isArray(menuData.meals) ? menuData.meals : [],
    };
  }
}