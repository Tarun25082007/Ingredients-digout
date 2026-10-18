package com.digout.dto;

public record UserProfileDTO(
        String fullName,
        String email,
        Integer age,
        String gender,
        Double heightCm,
        Double weightKg,
        String activityLevel,
        String calorieGoal,
        String medicalConditions,
        Boolean profileCompleted,
        String strictnessLevel,
        Double bmi,
        String bmiCategory
) {
    public static UserProfileDTO fromUser(com.digout.models.User user) {
        Double bmi = null;
        String bmiCategory = null;
        if (user.getHeightCm() != null && user.getHeightCm() > 0 && user.getWeightKg() != null && user.getWeightKg() > 0) {
            double heightInMeters = user.getHeightCm() / 100.0;
            bmi = Math.round((user.getWeightKg() / (heightInMeters * heightInMeters)) * 10.0) / 10.0;
            if (bmi < 18.5) bmiCategory = "Underweight";
            else if (bmi < 25.0) bmiCategory = "Normal weight";
            else if (bmi < 30.0) bmiCategory = "Overweight";
            else bmiCategory = "Obese";
        }
        return new UserProfileDTO(
                user.getFullName(),
                user.getEmail(),
                user.getAge(),
                user.getGender() != null ? user.getGender() : "PREFER_NOT_TO_SAY",
                user.getHeightCm(),
                user.getWeightKg(),
                user.getActivityLevel() != null ? user.getActivityLevel() : "MODERATE",
                user.getCalorieGoal() != null ? user.getCalorieGoal() : "MAINTENANCE",
                user.getMedicalConditions() != null ? user.getMedicalConditions() : "",
                user.getProfileCompleted() != null ? user.getProfileCompleted() : false,
                user.getStrictnessLevel() != null ? user.getStrictnessLevel() : "STANDARD",
                bmi,
                bmiCategory
        );
    }
}
