import OpenAI from "openai";
import { MealAnalysisResult } from "../types/openai";
import { extractCleanJSON, parsePartialJSON } from "../utils/openai";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

export { openai };

export class OpenAIService {
  static async analyzeMealImage(
    imageBase64: string,
    language: string = "english",
    updateText?: string,
    editedIngredients: any[] = []
  ): Promise<MealAnalysisResult> {
    try {
      console.log("🤖 Starting OpenAI meal analysis...");
      console.log("🌐 Language:", language);
      console.log("📝 Update text provided:", !!updateText);
      console.log("🥗 Edited ingredients:", editedIngredients.length);

      if (!openai || !process.env.OPENAI_API_KEY) {
        console.log("⚠️ No OpenAI API key, using fallback analysis");
        return this.getFallbackAnalysis(language);
      }

      const isHebrew = language === "hebrew";

      // Build the analysis prompt
      let analysisPrompt = this.buildAnalysisPrompt(isHebrew);

      // Add update context if provided
      if (updateText) {
        analysisPrompt += isHebrew
          ? `\n\nעדכון מהמשתמש: ${updateText}\nאנא עדכן את הניתוח בהתאם לעדכון זה.`
          : `\n\nUser update: ${updateText}\nPlease update the analysis according to this information.`;
      }

      // Add edited ingredients context
      if (editedIngredients.length > 0) {
        const ingredientsList = editedIngredients
          .map((ing) => ing.name || ing)
          .join(", ");
        analysisPrompt += isHebrew
          ? `\n\nרכיבים שנערכו על ידי המשתמש: ${ingredientsList}\nהשתמש ברכיבים אלה בניתוח.`
          : `\n\nUser-edited ingredients: ${ingredientsList}\nUse these ingredients in the analysis.`;
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: analysisPrompt,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: isHebrew
                  ? "אנא נתח את התמונה הזו של האוכל ותן ניתוח תזונתי מפורט."
                  : "Please analyze this food image and provide detailed nutritional analysis.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
        max_tokens: 2000,
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from OpenAI");
      }

      console.log("📄 Raw OpenAI response preview:", content.substring(0, 200));

      // Extract and parse JSON
      const cleanedJSON = extractCleanJSON(content);
      const analysisData = parsePartialJSON(cleanedJSON);

      // Validate and transform the response
      const result = this.transformOpenAIResponse(analysisData, isHebrew);

      console.log("✅ OpenAI analysis completed successfully");
      console.log("📊 Analysis summary:", {
        name: result.name,
        calories: result.calories,
        confidence: result.confidence,
        ingredients: result.ingredients.length,
      });

      return result;
    } catch (error) {
      console.error("💥 OpenAI analysis error:", error);
      console.log("🔄 Falling back to mock analysis");
      return this.getFallbackAnalysis(language);
    }
  }

  static async updateMealAnalysis(
    originalAnalysis: any,
    updateText: string,
    language: string = "english"
  ): Promise<MealAnalysisResult> {
    try {
      console.log("🔄 Updating meal analysis with OpenAI...");

      if (!openai || !process.env.OPENAI_API_KEY) {
        console.log("⚠️ No OpenAI API key, using fallback update");
        return this.getFallbackUpdate(originalAnalysis, updateText, language);
      }

      const isHebrew = language === "hebrew";

      const updatePrompt = isHebrew
        ? `אתה מנתח תזונה מומחה. קיבלת ניתוח קיים של ארוחה ועדכון מהמשתמש.

ניתוח קיים:
שם: ${originalAnalysis.name}
קלוריות: ${originalAnalysis.calories}
חלבון: ${originalAnalysis.protein}ג
פחמימות: ${originalAnalysis.carbs}ג
שומן: ${originalAnalysis.fat}ג

עדכון מהמשתמש: ${updateText}

אנא עדכן את הניתוח בהתאם לעדכון. החזר JSON עם המבנה הבא:`
        : `You are a nutrition analysis expert. You received an existing meal analysis and an update from the user.

Existing analysis:
Name: ${originalAnalysis.name}
Calories: ${originalAnalysis.calories}
Protein: ${originalAnalysis.protein}g
Carbs: ${originalAnalysis.carbs}g
Fat: ${originalAnalysis.fat}g

User update: ${updateText}

Please update the analysis according to the update. Return JSON with the following structure:`;

      const jsonStructure = `{
  "name": "Updated meal name",
  "description": "Updated description",
  "calories": number,
  "protein": number,
  "carbs": number,
  "fat": number,
  "fiber": number,
  "sugar": number,
  "sodium": number,
  "confidence": number (0-100),
  "ingredients": [
    {
      "name": "ingredient name",
      "calories": number,
      "protein": number,
      "carbs": number,
      "fat": number
    }
  ],
  "servingSize": "serving size",
  "cookingMethod": "cooking method",
  "healthNotes": "health notes"
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: updatePrompt + "\n\n" + jsonStructure,
          },
          {
            role: "user",
            content: updateText,
          },
        ],
        max_tokens: 1500,
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from OpenAI");
      }

      const cleanedJSON = extractCleanJSON(content);
      const updatedData = parsePartialJSON(cleanedJSON);

      return this.transformOpenAIResponse(updatedData, isHebrew);
    } catch (error) {
      console.error("💥 OpenAI update error:", error);
      return this.getFallbackUpdate(originalAnalysis, updateText, language);
    }
  }

  static async generateText(prompt: string, maxTokens: number = 1000): Promise<string> {
    try {
      if (!openai || !process.env.OPENAI_API_KEY) {
        return "AI text generation not available - no API key configured";
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: maxTokens,
        temperature: 0.7,
      });

      return response.choices[0]?.message?.content || "No response generated";
    } catch (error) {
      console.error("💥 OpenAI text generation error:", error);
      return "Text generation failed";
    }
  }

  private static buildAnalysisPrompt(isHebrew: boolean): string {
    if (isHebrew) {
      return `אתה מנתח תזונה מומחה. נתח את תמונת האוכל ותן ניתוח תזונתי מפורט.

החזר JSON עם המבנה הבא:
{
  "name": "שם הארוחה",
  "description": "תיאור קצר",
  "calories": מספר,
  "protein": מספר,
  "carbs": מספר,
  "fat": מספר,
  "fiber": מספר,
  "sugar": מספר,
  "sodium": מספר,
  "confidence": מספר (0-100),
  "ingredients": [
    {
      "name": "שם הרכיב",
      "calories": מספר,
      "protein": מספר,
      "carbs": מספר,
      "fat": מספר
    }
  ],
  "servingSize": "גודל מנה",
  "cookingMethod": "שיטת הכנה",
  "healthNotes": "הערות בריאות"
}

תן ערכים מדויקים ומפורטים. אם לא בטוח, תן הערכה סבירה.`;
    }

    return `You are a nutrition analysis expert. Analyze the food image and provide detailed nutritional analysis.

Return JSON with this structure:
{
  "name": "Meal name",
  "description": "Brief description",
  "calories": number,
  "protein": number,
  "carbs": number,
  "fat": number,
  "fiber": number,
  "sugar": number,
  "sodium": number,
  "confidence": number (0-100),
  "ingredients": [
    {
      "name": "ingredient name",
      "calories": number,
      "protein": number,
      "carbs": number,
      "fat": number
    }
  ],
  "servingSize": "serving size",
  "cookingMethod": "cooking method",
  "healthNotes": "health notes"
}

Provide accurate and detailed values. If uncertain, give reasonable estimates.`;
  }

  private static transformOpenAIResponse(
    data: any,
    isHebrew: boolean
  ): MealAnalysisResult {
    return {
      name: data.name || (isHebrew ? "ארוחה לא ידועה" : "Unknown Meal"),
      description: data.description || "",
      calories: Number(data.calories) || 0,
      protein: Number(data.protein) || 0,
      carbs: Number(data.carbs) || 0,
      fat: Number(data.fat) || 0,
      fiber: Number(data.fiber) || 0,
      sugar: Number(data.sugar) || 0,
      sodium: Number(data.sodium) || 0,
      confidence: Number(data.confidence) || 75,
      ingredients: Array.isArray(data.ingredients)
        ? data.ingredients.map((ing: any) => ({
            name: ing.name || "Unknown ingredient",
            calories: Number(ing.calories) || 0,
            protein: Number(ing.protein) || 0,
            carbs: Number(ing.carbs) || 0,
            fat: Number(ing.fat) || 0,
            fiber: Number(ing.fiber) || 0,
            sugar: Number(ing.sugar) || 0,
            sodium_mg: Number(ing.sodium_mg) || 0,
            cholesterol_mg: Number(ing.cholesterol_mg) || 0,
            saturated_fats_g: Number(ing.saturated_fats_g) || 0,
            polyunsaturated_fats_g: Number(ing.polyunsaturated_fats_g) || 0,
            monounsaturated_fats_g: Number(ing.monounsaturated_fats_g) || 0,
            omega_3_g: Number(ing.omega_3_g) || 0,
            omega_6_g: Number(ing.omega_6_g) || 0,
            soluble_fiber_g: Number(ing.soluble_fiber_g) || 0,
            insoluble_fiber_g: Number(ing.insoluble_fiber_g) || 0,
            alcohol_g: Number(ing.alcohol_g) || 0,
            caffeine_mg: Number(ing.caffeine_mg) || 0,
            serving_size_g: Number(ing.serving_size_g) || 0,
            glycemic_index: ing.glycemic_index || null,
            insulin_index: ing.insulin_index || null,
            vitamins_json: ing.vitamins_json || {},
            micronutrients_json: ing.micronutrients_json || {},
            allergens_json: ing.allergens_json || {},
          }))
        : [],
      servingSize: data.servingSize || "1 serving",
      cookingMethod: data.cookingMethod || "Unknown",
      healthNotes: data.healthNotes || "",
    };
  }

  private static getFallbackAnalysis(language: string): MealAnalysisResult {
    const isHebrew = language === "hebrew";

    return {
      name: isHebrew ? "ארוחה מנותחת" : "Analyzed Meal",
      description: isHebrew
        ? "ניתוח בסיסי של הארוחה"
        : "Basic meal analysis",
      calories: 400,
      protein: 25,
      carbs: 45,
      fat: 15,
      fiber: 8,
      sugar: 12,
      sodium: 600,
      confidence: 60,
      ingredients: [
        {
          name: isHebrew ? "רכיבים מעורבים" : "Mixed ingredients",
          calories: 400,
          protein: 25,
          carbs: 45,
          fat: 15,
          fiber: 8,
          sugar: 12,
          sodium_mg: 600,
          cholesterol_mg: 0,
          saturated_fats_g: 0,
          polyunsaturated_fats_g: 0,
          monounsaturated_fats_g: 0,
          omega_3_g: 0,
          omega_6_g: 0,
          soluble_fiber_g: 0,
          insoluble_fiber_g: 0,
          alcohol_g: 0,
          caffeine_mg: 0,
          serving_size_g: 0,
          glycemic_index: null,
          insulin_index: null,
          vitamins_json: {},
          micronutrients_json: {},
          allergens_json: {},
        },
      ],
      servingSize: isHebrew ? "מנה אחת" : "1 serving",
      cookingMethod: isHebrew ? "לא ידוע" : "Unknown",
      healthNotes: isHebrew
        ? "ניתוח בסיסי - הוסף מפתח OpenAI לניתוח מדויק יותר"
        : "Basic analysis - add OpenAI API key for more accurate analysis",
    };
  }

  private static getFallbackUpdate(
    originalAnalysis: any,
    updateText: string,
    language: string
  ): MealAnalysisResult {
    const isHebrew = language === "hebrew";

    // Simple text-based updates
    let updatedName = originalAnalysis.name;
    let updatedCalories = originalAnalysis.calories;

    // Basic keyword detection for updates
    if (updateText.toLowerCase().includes("more") || updateText.includes("יותר")) {
      updatedCalories = Math.round(updatedCalories * 1.2);
    }
    if (updateText.toLowerCase().includes("less") || updateText.includes("פחות")) {
      updatedCalories = Math.round(updatedCalories * 0.8);
    }

    return {
      ...originalAnalysis,
      name: updatedName,
      calories: updatedCalories,
      healthNotes: isHebrew
        ? `עודכן על ידי המשתמש: ${updateText}`
        : `Updated by user: ${updateText}`,
      confidence: Math.max(50, (originalAnalysis.confidence || 75) - 10),
    };
  }
}