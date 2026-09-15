package com.digout.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
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

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record IngredientDetail(
            String name,
            String explanation,
            String status,
            String dailyLimit,
            String productAmount
    ) {
        public IngredientDetail(String name, String explanation, String status) {
            this(name, explanation, status, null, null);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record WhoFlag(
            String name,
            String status,
            String explanation,
            String dailyLimit,
            String productAmount
    ) {
        public WhoFlag(String name, String status, String explanation) {
            this(name, status, explanation, null, null);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PersonalizedAlert(
            String title,
            String explanation,
            String severity
    ) {}
}
