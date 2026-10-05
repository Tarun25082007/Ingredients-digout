package com.digout.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record WhoAssessmentDTO(
        Boolean isFood,
        String productName,
        List<IngredientDetail> ingredientsFound,
        List<WhoFlag> whoFlags,
        String overallIndicator,
        String globalEquivalent,
        String servingSize,
        String quantity,
        String dataSourceRegion,
        List<PersonalizedAlert> personalizedAlerts,
        String recommendedServingAdvice,
        Integer healthScore
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
        this(true, productName, ingredientsFound, whoFlags, overallIndicator, globalEquivalent, servingSize, quantity, dataSourceRegion, null, null, null);
    }

    public WhoAssessmentDTO(
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
        this(true, productName, ingredientsFound, whoFlags, overallIndicator, globalEquivalent, servingSize, quantity, dataSourceRegion, personalizedAlerts, recommendedServingAdvice, null);
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
    @com.fasterxml.jackson.databind.annotation.JsonDeserialize(using = PersonalizedAlertDeserializer.class)
    public record PersonalizedAlert(
            String title,
            String explanation,
            String severity
    ) {}

    public static class PersonalizedAlertDeserializer extends com.fasterxml.jackson.databind.JsonDeserializer<PersonalizedAlert> {
        @Override
        public PersonalizedAlert deserialize(com.fasterxml.jackson.core.JsonParser p, com.fasterxml.jackson.databind.DeserializationContext ctxt) throws java.io.IOException {
            if (p.currentToken() == com.fasterxml.jackson.core.JsonToken.VALUE_STRING) {
                String text = p.getText();
                if (text != null && text.contains(":")) {
                    String[] parts = text.split(":", 2);
                    return new PersonalizedAlert(parts[0].trim(), parts[1].trim(), "YELLOW");
                }
                return new PersonalizedAlert("Health Alert", text != null ? text.trim() : "", "YELLOW");
            }
            com.fasterxml.jackson.databind.JsonNode node = p.getCodec().readTree(p);
            if (node == null || node.isNull()) {
                return null;
            }
            if (node.isTextual()) {
                String text = node.asText();
                if (text.contains(":")) {
                    String[] parts = text.split(":", 2);
                    return new PersonalizedAlert(parts[0].trim(), parts[1].trim(), "YELLOW");
                }
                return new PersonalizedAlert("Health Alert", text, "YELLOW");
            }
            String title = node.has("title") ? node.get("title").asText() : "Health Alert";
            String explanation = node.has("explanation") ? node.get("explanation").asText() : "";
            String severity = node.has("severity") ? node.get("severity").asText() : "YELLOW";
            return new PersonalizedAlert(title, explanation, severity);
        }
    }
}
