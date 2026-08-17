package com.digout.dto;

import java.util.List;

public record WhoAssessmentDTO(
        String productName,
        List<IngredientDetail> ingredientsFound,
        List<WhoFlag> whoFlags,
        String overallIndicator,
        String globalEquivalent
) {
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
}
