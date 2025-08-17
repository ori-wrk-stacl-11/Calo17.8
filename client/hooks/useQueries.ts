import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
import {
  nutritionAPI,
  authAPI,
  calendarAPI,
  userAPI,
  api,
} from "@/src/services/api";
import { MealAnalysisData, Meal } from "@/src/types";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Centralized query keys
export const queryKeys = {
  auth: ["auth"] as const,
  meals: ["meals"] as const,
  meal: (id: string) => ["meal", id] as const,
  dailyStats: (date: string) => ["dailyStats", date] as const,
  globalStats: ["globalStats"] as const,
  calendar: (year: number, month: number) => ["calendar", year, month] as const,
  calendarStats: (year: number, month: number) =>
    ["calendarStats", year, month] as const,
  userProfile: ["userProfile"] as const,
  tooltips: ["tooltips"] as const,
  statistics: (timeRange: string, start?: string, end?: string) =>
    ["statistics", timeRange, start, end] as const,
  devices: ["devices"] as const,
  deviceActivity: (deviceId: string, date: string) => ["deviceActivity", deviceId, date] as const,
  deviceAnalytics: (deviceId: string, days: number) => ["deviceAnalytics", deviceId, days] as const,
} as const;

// Tooltip hooks
export const useTooltipVisibility = (tooltipId: string) => {
  return useQuery({
    queryKey: [...queryKeys.tooltips, tooltipId],
    queryFn: async () => {
      const shown = await AsyncStorage.getItem(`tooltip_${tooltipId}_shown`);
      return shown === "true";
    },
    staleTime: Infinity,
  });
};

export const useMarkTooltipShown = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tooltipId: string) => {
      await AsyncStorage.setItem(`tooltip_${tooltipId}_shown`, "true");
      return tooltipId;
    },
    onSuccess: (tooltipId) => {
      queryClient.setQueryData([...queryKeys.tooltips, tooltipId], true);
    },
  });
};

// Auth Hooks
export function useSignIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authAPI.signIn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth });
    },
  });
}

export function useSignUp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authAPI.signUp,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth });
    },
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authAPI.signOut,
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

// Meal Hooks
export function useMeals() {
  return useQuery({
    queryKey: queryKeys.meals,
    queryFn: () => nutritionAPI.getMeals(),
    staleTime: 1000 * 60 * 15,
    select: (data: Meal[]) => {
      return (
        data?.sort(
          (a: Meal, b: Meal) =>
            new Date(b.upload_time || 0).getTime() -
            new Date(a.upload_time || 0).getTime()
        ) || []
      );
    },
  });
}

export function useMealsInfinite(limit = 20) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.meals, "infinite"],
    queryFn: ({ pageParam = 0 }) => nutritionAPI.getMeals(pageParam, limit),
    getNextPageParam: (lastPage, pages) => {
      if (lastPage.length < limit) return undefined;
      return pages.length * limit;
    },
    staleTime: 1000 * 60 * 15,
    initialPageParam: 0,
  });
}

export function useAnalyzeMeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (imageBase64: string) => nutritionAPI.analyzeMeal(imageBase64),
    onSuccess: () => {
      // Don't invalidate meals here as we haven't saved yet
    },
  });
}

export function useSaveMeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      mealData,
      imageBase64,
    }: {
      mealData: MealAnalysisData;
      imageBase64?: string;
    }) => nutritionAPI.saveMeal(mealData, imageBase64),
    onMutate: async ({ mealData }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.meals });

      const previousMeals = queryClient.getQueryData<Meal[]>(queryKeys.meals);

      const tempId = Date.now();
      const optimisticMeal: Meal = {
        meal_id: tempId,
        id: `temp-${tempId}`,
        user_id: "temp-user",
        image_url: "",
        upload_time: new Date().toISOString(),
        analysis_status: "COMPLETED" as const,
        meal_name: mealData.meal_name || "New Meal",
        calories: mealData.calories || 0,
        protein_g: mealData.protein_g || 0,
        carbs_g: mealData.carbs_g || 0,
        fats_g: mealData.fats_g || 0,
        fiber_g: mealData.fiber_g || null,
        sugar_g: mealData.sugar_g || null,
        sodium_mg: mealData.sodium_g || null,
        created_at: new Date().toISOString(),
        name: mealData.meal_name || "New Meal",
        description: mealData.description,
        protein: mealData.protein_g || 0,
        carbs: mealData.carbs_g || 0,
        fat: mealData.fats_g || 0,
        fiber: mealData.fiber_g,
        sugar: mealData.sugar_g,
        sodium: mealData.sodium_g,
        userId: "temp-user",
      };

      queryClient.setQueryData<Meal[]>(queryKeys.meals, (old) => {
        if (!old) return [optimisticMeal];
        return [optimisticMeal, ...old];
      });

      return { previousMeals };
    },
    onSuccess: (data, variables, context) => {
      queryClient.setQueryData<Meal[]>(queryKeys.meals, (old) => {
        if (!old) return [data];
        return [data, ...old.slice(1)];
      });

      const today = new Date().toISOString().split("T")[0];
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyStats(today) });
      queryClient.invalidateQueries({ queryKey: queryKeys.globalStats });

      const currentDate = new Date();
      queryClient.invalidateQueries({
        queryKey: queryKeys.calendar(
          currentDate.getFullYear(),
          currentDate.getMonth() + 1
        ),
      });
    },
    onError: (err, variables, context) => {
      if (context?.previousMeals) {
        queryClient.setQueryData(queryKeys.meals, context.previousMeals);
      }
    },
  });
}

export function useUpdateMeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      mealId,
      updateText,
    }: {
      mealId: string;
      updateText: string;
    }) => nutritionAPI.updateMeal(mealId, updateText),
    onSuccess: (response, variables) => {
      if (response.success && response.data) {
        queryClient.setQueryData<Meal[]>(queryKeys.meals, (old) => {
          if (!old) return [response.data];
          return old.map((meal) =>
            meal.meal_id?.toString() === variables.mealId ||
            meal.id === variables.mealId
              ? response.data
              : meal
          );
        });

        const today = new Date().toISOString().split("T")[0];
        queryClient.invalidateQueries({
          queryKey: queryKeys.dailyStats(today),
        });
      }
    },
  });
}

export function useDuplicateMeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ mealId, newDate }: { mealId: string; newDate?: string }) =>
      nutritionAPI.duplicateMeal(mealId, newDate),
    onSuccess: (response) => {
      if (response.success && response.data) {
        queryClient.setQueryData<Meal[]>(queryKeys.meals, (old) => {
          if (!old) return [response.data];
          return [response.data, ...old];
        });

        const targetDate =
          response.data.upload_time?.split("T")[0] ||
          new Date().toISOString().split("T")[0];
        queryClient.invalidateQueries({
          queryKey: queryKeys.dailyStats(targetDate),
        });
      }
    },
  });
}

export function useToggleMealFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (mealId: string) => nutritionAPI.toggleMealFavorite(mealId),
    onMutate: async (mealId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.meals });

      const previousMeals = queryClient.getQueryData<Meal[]>(queryKeys.meals);

      queryClient.setQueryData<Meal[]>(queryKeys.meals, (old) => {
        if (!old) return old;
        return old.map((meal) =>
          meal.meal_id?.toString() === mealId || meal.id === mealId
            ? { ...meal, isFavorite: !meal.is_favorite }
            : meal
        );
      });

      return { previousMeals };
    },
    onError: (err, mealId, context) => {
      if (context?.previousMeals) {
        queryClient.setQueryData(queryKeys.meals, context.previousMeals);
      }
    },
  });
}

export function useSaveMealFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      mealId,
      feedback,
    }: {
      mealId: string;
      feedback: {
        tasteRating?: number;
        satietyRating?: number;
        energyRating?: number;
        heavinessRating?: number;
      };
    }) => nutritionAPI.saveMealFeedback(mealId, feedback),
    onSuccess: (data, variables) => {
      queryClient.setQueryData<Meal[]>(queryKeys.meals, (old) => {
        if (!old) return old;
        return old.map((meal) =>
          meal.meal_id?.toString() === variables.mealId ||
          meal.id === variables.mealId
            ? { ...meal, ...variables.feedback }
            : meal
        );
      });
    },
  });
}

// Daily Stats Hook
export function useDailyStats(date: string) {
  return useQuery({
    queryKey: queryKeys.dailyStats(date),
    queryFn: () => nutritionAPI.getDailyStats(date),
    staleTime: 1000 * 60 * 10,
  });
}

// Global Stats Hook
export function useGlobalStats() {
  return useQuery({
    queryKey: queryKeys.globalStats,
    queryFn: userAPI.getGlobalStatistics,
    staleTime: 1000 * 60 * 60,
  });
}

// Calendar Hooks
export function useCalendarData(year: number, month: number) {
  return useQuery({
    queryKey: queryKeys.calendar(year, month),
    queryFn: () => calendarAPI.getCalendarData(year, month),
    staleTime: 1000 * 60 * 15,
  });
}

export function useCalendarStats(year: number, month: number) {
  return useQuery({
    queryKey: queryKeys.calendarStats(year, month),
    queryFn: () => calendarAPI.getStatistics(year, month),
    staleTime: 1000 * 60 * 30,
  });
}

export function useAddEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      date,
      title,
      type,
    }: {
      date: string;
      title: string;
      type: string;
    }) => calendarAPI.addEvent(date, title, type),
    onSuccess: (data, variables) => {
      const eventDate = new Date(variables.date);
      queryClient.invalidateQueries({
        queryKey: queryKeys.calendar(
          eventDate.getFullYear(),
          eventDate.getMonth() + 1
        ),
      });
    },
  });
}

// Statistics query using existing API method
export const useStatistics = (
  timeRange: string,
  startDate?: string,
  endDate?: string
) => {
  const fallbackResult = {
    data: { success: false, data: null },
    isLoading: false,
    error: null,
    refetch: () => Promise.resolve(),
    isError: false,
    isSuccess: false,
  };

  try {
    const result = useQuery({
      queryKey: queryKeys.statistics(timeRange, startDate, endDate),
      queryFn: async () => {
        try {
          if (timeRange === "custom" && startDate && endDate) {
            return await nutritionAPI.getRangeStatistics(startDate, endDate);
          }
          // For other time ranges, calculate dates
          const today = new Date();
          let start: string;
          let end: string = today.toISOString().split("T")[0];

          switch (timeRange) {
            case "today":
              start = end;
              break;
            case "week":
              const weekAgo = new Date(today);
              weekAgo.setDate(today.getDate() - 7);
              start = weekAgo.toISOString().split("T")[0];
              break;
            case "month":
              const monthAgo = new Date(today);
              monthAgo.setDate(today.getDate() - 30);
              start = monthAgo.toISOString().split("T")[0];
              break;
            default:
              start = end;
          }

          return await nutritionAPI.getRangeStatistics(start, end);
        } catch (error: any) {
          console.error("Error in useStatistics queryFn:", error);
          throw new Error(error?.message || "Failed to fetch statistics");
        }
      },
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 3,
      retryDelay: 1000,
      // Ensure we always have a valid structure
      select: (data) => data || { success: false, data: null },
    });

    // Return the result if it exists, otherwise return fallback
    return result || fallbackResult;
  } catch (error) {
    console.error("Error in useStatistics hook:", error);
    return fallbackResult;
  }
};

// User profile query
export const useUserProfile = () => {
  return useQuery({
    queryKey: queryKeys.userProfile,
    queryFn: () => userAPI.getUserProfile(),
    staleTime: 10 * 60 * 1000,
  });
};

export const useDailyGoals = () => {
  return useQuery({
    queryKey: ["dailyGoals"],
    queryFn: () => api.get("/daily-goals"),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
};
