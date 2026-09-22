package com.digout.dto;

public record OpenFoodFactsDTO(
        String productName,
        String ingredientsText,
        String servingSize,
        String quantity,
        java.util.List<String> countriesTags
) {}
