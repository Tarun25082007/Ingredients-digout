package com.digout.dto;

import java.util.List;

public record WhoAssessmentDTO(
        String productName,
        List<String> ingredientsFound,
        List<WhoFlag> whoFlags,
        String overallIndicator
) {
    public record WhoFlag(
            String name,
            String status,
            String explanation
    ) {}
}
