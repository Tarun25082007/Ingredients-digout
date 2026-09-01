package com.digout.dto;

import java.util.List;

public record WhoAssessmentDTO(
        String productName,
        List<IngredientDetail> ingredientsFound,
        List<WhoFlag> whoFlags,
        String overallIndicator,
        String globalEquivalent,
        String servingSize,
        String quantity,
        String dataSourceRegion,
        List<PersonalizedAlert> personalizedAlerts,
        String recommendedServingAdvice
) {
    public WhoAssessmentDTO(
            String productName,
            List<IngredientDetail> ingredientsFound,
            List<WhoFlag> whoFlags,
            String overallIndicator,
            String globalEquivalent,
            String servingSize,
            String quantity,
            String dataSourceRegion
    ) {
        this(productName, ingredientsFound, whoFlags, overallIndicator, globalEquivalent, servingSize, quantity, dataSourceRegion, null, null);
    }

    public record IngredientDetail(
            String name,
            String explanation,
            String status
    ) {}

    public record WhoFlag(
            String name,
            String status,
            String explanation
    ) {}

    public record PersonalizedAlert(
            String title,
            String explanation,
            String severity
    ) {}
}
