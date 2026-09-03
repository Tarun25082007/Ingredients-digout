package com.digout.services;

import com.digout.dto.WhoAssessmentDTO;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

@Service
public class GeminiService {

    private final String geminiApiKey;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final GroqService groqService;

    private static final String GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions?key=";
    private static final String PROMPT = "Extract every ingredient from this image. Extract total quantity and serving size if visible. IF the image does not clearly show the ingredients, use your internal knowledge base to identify this product and assume standard globally popular ingredients. IF THIS IS A REGIONAL PRODUCT (e.g. Campa Orange), identify the most popular global equivalent (e.g. Fanta Orange), use THAT product's ingredients instead, and set 'globalEquivalent'. Evaluate against WHO guidelines and the provided USER HEALTH PROFILE (if any). RULES: 1. Statuses can be GREEN (safe/healthy), YELLOW (moderate/caution), RED (general health risk / avoid), PURPLE (HIGHLY NOT RECOMMENDED / strictly contraindicated for user's medical conditions, pregnancy, or extreme calorie mismatch), BLACK (unknown). 2. For pregnancy, strictly flag caffeine >200mg, raw/unpasteurized items, saccharin, high nitrates as PURPLE. For ulcers/GERD, flag chili/capsaicin/high-acid as PURPLE or RED. For diabetes, flag high sugar/high glycemic index as PURPLE or RED. 3. Suggest a safe, specific 'recommendedServingAdvice' (or '0 - Strictly Not Recommended' if PURPLE). 4. DO NOT output reasoning or <think> tags. Output a raw JSON object exactly matching this structure, with no extra text: { \"productName\": \"String\", \"globalEquivalent\": \"String\", \"servingSize\": \"String (leave null if unknown)\", \"quantity\": \"String (leave null if unknown)\", \"ingredientsFound\": [ { \"name\": \"String (ingredient name + exact % or amount if present)\", \"explanation\": \"String (health impact)\", \"status\": \"PURPLE or RED or YELLOW or GREEN or BLACK\" } ], \"whoFlags\": [ { \"name\": \"String\", \"status\": \"PURPLE or RED or YELLOW or GREEN or BLACK\", \"explanation\": \"String\" } ], \"overallIndicator\": \"PURPLE or RED or YELLOW or GREEN\", \"personalizedAlerts\": [ { \"title\": \"String (e.g. Pregnancy Safety Alert, Ulcer Hazard Alert, Calorie Deficit Alert)\", \"explanation\": \"String\", \"severity\": \"PURPLE or RED or YELLOW or GREEN\" } ], \"recommendedServingAdvice\": \"String (e.g. Max 100ml / 1 portion, or 0 - Strictly Avoid)\" }.";
    private static final String TEXT_PROMPT = "The user is asking for the health assessment of a product named '%s'. We have retrieved the following exact ingredients from the database: '%s'. Evaluate these EXACT ingredients against WHO guidelines and the provided USER HEALTH PROFILE (if any). RULES: 1. Statuses can be GREEN (safe), YELLOW (caution), RED (high health risk), PURPLE (HIGHLY NOT RECOMMENDED / strictly contraindicated for user's medical condition, pregnancy, or severe calorie mismatch), BLACK (unknown). 2. For pregnancy, flag high caffeine, unpasteurized items, saccharin, and harmful additives as PURPLE. For ulcers/GERD, flag chili/spices as PURPLE/RED. For diabetes, flag sucrose/high sugar as PURPLE/RED. 3. Formulate a tailored 'recommendedServingAdvice' based on user calorie goal and health profile. 4. DO NOT output reasoning or <think> tags. Output a raw JSON object exactly matching this structure: { \"productName\": \"String\", \"globalEquivalent\": \"String\", \"servingSize\": \"String (leave null if unknown)\", \"quantity\": \"String (leave null if unknown)\", \"ingredientsFound\": [ { \"name\": \"String (ingredient name + EXACT %% or amount if present)\", \"explanation\": \"String\", \"status\": \"PURPLE or RED or YELLOW or GREEN or BLACK\" } ], \"whoFlags\": [ { \"name\": \"String\", \"status\": \"PURPLE or RED or YELLOW or GREEN or BLACK\", \"explanation\": \"String\" } ], \"overallIndicator\": \"PURPLE or RED or YELLOW or GREEN\", \"personalizedAlerts\": [ { \"title\": \"String\", \"explanation\": \"String\", \"severity\": \"PURPLE or RED or YELLOW or GREEN\" } ], \"recommendedServingAdvice\": \"String\" }.";

    private static final String[] GEMINI_MODELS = {
            "gemini-1.5-flash",
            "gemini-1.5-pro",
            "gemini-1.0-pro",
            "gemini-pro"
    };

    public GeminiService(@Value("${gemini.api.key}") String geminiApiKey, RestTemplate restTemplate, ObjectMapper objectMapper, GroqService groqService) {
        this.geminiApiKey = geminiApiKey;
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
        this.groqService = groqService;
    }

    private ResponseEntity<String> executeWithModelFallback(HttpHeaders headers, java.util.function.Function<String, java.util.Map<String, Object>> payloadBuilder) {
        Exception lastException = null;
        for (String model : GEMINI_MODELS) {
            try {
                java.util.Map<String, Object> payload = payloadBuilder.apply(model);
                HttpEntity<java.util.Map<String, Object>> request = new HttpEntity<>(payload, headers);
                return restTemplate.postForEntity(GEMINI_API_URL + geminiApiKey, request, String.class);
            } catch (org.springframework.web.client.HttpClientErrorException e) {
                String responseBody = e.getResponseBodyAsString();
                if (responseBody.contains("not found") || responseBody.contains("invalid model") || responseBody.contains("decommissioned")) {
                    System.err.println("Gemini model '" + model + "' is unavailable. Upgrading to next model...");
                    lastException = e;
                    continue;
                }
                throw e; // Other 4xx errors
            } catch (Exception e) {
                throw new RuntimeException("Gemini API error: " + e.getMessage(), e);
            }
        }
        throw new RuntimeException("All fallback Gemini models failed.", lastException);
    }

    @Async
    public CompletableFuture<WhoAssessmentDTO> analyzeIngredients(String base64Image, String mimeType, String foodCategory, String userProfileSummary) {
        int maxRetries = 3;
        for (int i = 0; i < maxRetries; i++) {
            try {
                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);

                String currentPrompt = PROMPT;
                if ("fresh".equals(foodCategory)) {
                    currentPrompt += " Note: This is a fresh or prepared food item (like a local dish, fruit, etc). State its place of origin in the explanation if applicable.";
                }
                if (userProfileSummary != null && !userProfileSummary.isBlank()) {
                    currentPrompt += " [ACTIVE USER HEALTH PROFILE: " + userProfileSummary + "]. Tailor the evaluation, flags, PURPLE status, and recommended serving to this profile.";
                }

                final String finalPrompt = currentPrompt;
                ResponseEntity<String> response = executeWithModelFallback(headers, model -> Map.of(
                        "model", model,
                        "store", false,
                        "input", List.of(
                                Map.of(
                                        "type", "text",
                                        "text", finalPrompt
                                ),
                                Map.of(
                                        "type", "image",
                                        "mime_type", mimeType,
                                        "data", base64Image
                                )
                        )
                ));

                // Parse the response
                JsonNode root = objectMapper.readTree(response.getBody());
                JsonNode steps = root.path("steps");
                String jsonText = "";
                
                for (JsonNode step : steps) {
                    if ("model_output".equals(step.path("type").asText()) && step.has("content")) {
                        JsonNode contentArray = step.path("content");
                        if (contentArray.isArray() && contentArray.size() > 0) {
                            JsonNode firstContent = contentArray.get(0);
                            if (firstContent.has("text")) {
                                jsonText = firstContent.path("text").asText();
                                break;
                            }
                        }
                    } else if (step.has("modelOutput") && step.path("modelOutput").has("text")) {
                        // Fallback for mock responses or older schema
                        jsonText = step.path("modelOutput").path("text").asText();
                        break;
                    }
                }

                if (jsonText == null || jsonText.trim().isEmpty()) {
                    throw new RuntimeException("No model_output found in response: " + response.getBody());
                }

                jsonText = extractJson(jsonText);
                return CompletableFuture.completedFuture(objectMapper.readValue(jsonText, WhoAssessmentDTO.class));
            } catch (Exception e) {
                if (e.getMessage() != null && (e.getMessage().contains("503") || e.getMessage().toLowerCase().contains("timed out") || e.getMessage().toLowerCase().contains("timeout")) && i < maxRetries - 1) {
                    try {
                        System.out.println("Gemini Overload or Timeout! Retrying in 2s... (Attempt " + (i+1) + "/" + maxRetries + ")");
                        Thread.sleep(2000); // wait 2 seconds before retrying
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                    continue;
                } else if (e.getMessage() != null && e.getMessage().contains("429")) {
                     System.out.println("Gemini Rate Limit reached! Falling back to GroqService...");
                     return groqService.analyzeIngredients(base64Image, mimeType, foodCategory, userProfileSummary);
                }
                
                System.out.println("Gemini failed, falling back to GroqService: " + e.getMessage());
                return groqService.analyzeIngredients(base64Image, mimeType, foodCategory, userProfileSummary);
            }
        }
        System.out.println("Gemini exhausted retries, falling back to GroqService...");
        return groqService.analyzeIngredients(base64Image, mimeType, foodCategory, userProfileSummary);
    }

    @Async
    public CompletableFuture<WhoAssessmentDTO> analyzeIngredientsByName(String productName, String ingredientsText, String servingSize, String quantity, String foodCategory, String userProfileSummary) {
        int maxRetries = 3;
        for (int i = 0; i < maxRetries; i++) {
            try {
                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.APPLICATION_JSON);

                String formattedPrompt;
                if (ingredientsText == null || ingredientsText.isBlank()) {
                    formattedPrompt = "The user is asking for the health assessment of a product named '" + productName + "'. We DO NOT have database ingredients for this, so you MUST use your internal knowledge base to identify this product and assume its standard ingredients. ";
                    if ("fresh".equals(foodCategory)) {
                        formattedPrompt += "This is a fresh or prepared food (like a local dish, fruit, or homemade meal). If it is a local/regional dish, please state its place of origin in the explanation. ";
                    } else {
                        formattedPrompt += "If this is a regional packaged product, identify the most popular global equivalent and use THAT product's ingredients instead, setting 'globalEquivalent'. ";
                    }
                    formattedPrompt += "Evaluate the ingredients against WHO guidelines and the provided USER HEALTH PROFILE. RULES: 1. Statuses: GREEN (safe), YELLOW (moderate), RED (avoid), PURPLE (HIGHLY NOT RECOMMENDED / strictly contraindicated for user conditions/pregnancy/calorie goal), BLACK (unknown). 2. For pregnancy, flag caffeine >200mg, raw/unpasteurized items, saccharin as PURPLE. For ulcers, flag chili/spices as PURPLE or RED. For diabetes, flag sugar as PURPLE or RED. 3. Suggest a safe 'recommendedServingAdvice' (or '0 - Strictly Avoid' if PURPLE). 4. DO NOT output reasoning or <think> tags. Output a raw JSON object exactly matching: { \"productName\": \"String\", \"globalEquivalent\": \"String\", \"servingSize\": \"String (leave null if unknown)\", \"quantity\": \"String (leave null if unknown)\", \"ingredientsFound\": [ { \"name\": \"String (ingredient name ONLY, no estimated amounts)\", \"explanation\": \"String\", \"status\": \"PURPLE or RED or YELLOW or GREEN or BLACK\" } ], \"whoFlags\": [ { \"name\": \"String\", \"status\": \"PURPLE or RED or YELLOW or GREEN or BLACK\", \"explanation\": \"String\" } ], \"overallIndicator\": \"PURPLE or RED or YELLOW or GREEN\", \"personalizedAlerts\": [ { \"title\": \"String\", \"explanation\": \"String\", \"severity\": \"PURPLE or RED or YELLOW or GREEN\" } ], \"recommendedServingAdvice\": \"String\" }.";
                } else {
                    formattedPrompt = String.format(TEXT_PROMPT, productName, ingredientsText);
                    if ("fresh".equals(foodCategory)) {
                        formattedPrompt += " Note: This is a fresh or prepared food. If it's a local dish, mention its place of origin in the explanation.";
                    }
                }
                if (userProfileSummary != null && !userProfileSummary.isBlank()) {
                    formattedPrompt += " [ACTIVE USER HEALTH PROFILE: " + userProfileSummary + "]. Tailor the evaluation, flags, PURPLE status, and recommended serving to this profile.";
                }
                
                final String finalFormattedPrompt = formattedPrompt;
                ResponseEntity<String> response = executeWithModelFallback(headers, model -> Map.of(
                        "model", model,
                        "store", false,
                        "input", List.of(
                                Map.of(
                                        "type", "text",
                                        "text", finalFormattedPrompt
                                )
                        )
                ));

                // Parse the response
                JsonNode root = objectMapper.readTree(response.getBody());
                JsonNode steps = root.path("steps");
                String jsonText = "";

                for (JsonNode step : steps) {
                    if ("model_output".equals(step.path("type").asText()) && step.has("content")) {
                        JsonNode contentArray = step.path("content");
                        if (contentArray.isArray() && contentArray.size() > 0) {
                            JsonNode firstContent = contentArray.get(0);
                            if (firstContent.has("text")) {
                                jsonText = firstContent.path("text").asText();
                                break;
                            }
                        }
                    } else if (step.has("modelOutput") && step.path("modelOutput").has("text")) {
                        jsonText = step.path("modelOutput").path("text").asText();
                        break;
                    }
                }

                if (jsonText == null || jsonText.trim().isEmpty()) {
                    throw new RuntimeException("No model_output found in response: " + response.getBody());
                }

                jsonText = extractJson(jsonText);
                WhoAssessmentDTO parsed = objectMapper.readValue(jsonText, WhoAssessmentDTO.class);
                WhoAssessmentDTO augmented = new WhoAssessmentDTO(
                    parsed.productName(),
                    parsed.ingredientsFound(),
                    parsed.whoFlags(),
                    parsed.overallIndicator(),
                    parsed.globalEquivalent(),
                    servingSize != null ? servingSize : parsed.servingSize(),
                    quantity != null ? quantity : parsed.quantity(),
                    null,
                    parsed.personalizedAlerts(),
                    parsed.recommendedServingAdvice()
                );
                return CompletableFuture.completedFuture(augmented);
            } catch (Exception e) {
                if (e.getMessage() != null && (e.getMessage().contains("503") || e.getMessage().toLowerCase().contains("timed out") || e.getMessage().toLowerCase().contains("timeout")) && i < maxRetries - 1) {
                    try {
                        System.out.println("Gemini Overload or Timeout! Retrying in 2s... (Attempt " + (i+1) + "/" + maxRetries + ")");
                        Thread.sleep(2000);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                    continue;
                } else if (e.getMessage() != null && e.getMessage().contains("429")) {
                     System.out.println("Gemini Rate Limit reached! Falling back to GroqService for name analysis...");
                     return groqService.analyzeIngredientsByName(productName, ingredientsText, servingSize, quantity, foodCategory, userProfileSummary);
                }
                System.out.println("Gemini failed for name analysis, falling back to GroqService: " + e.getMessage());
                return groqService.analyzeIngredientsByName(productName, ingredientsText, servingSize, quantity, foodCategory, userProfileSummary);
            }
        }
        System.out.println("Gemini exhausted retries for name analysis, falling back to GroqService...");
        return groqService.analyzeIngredientsByName(productName, ingredientsText, servingSize, quantity, foodCategory, userProfileSummary);
    }

    private String extractJson(String rawText) {
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("\\{.*\\}", java.util.regex.Pattern.DOTALL).matcher(rawText);
        if (matcher.find()) {
            return matcher.group();
        }
        return rawText;
    }

    public com.digout.dto.OpenFoodFactsDTO getIngredientsDatabaseFallback(String productName) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            String dbPrompt = "You are a product ingredient database. The user is searching for '" + productName.replace("'", "") + "'. Output a JSON object containing 'product_name' and 'ingredients_text' (a comma separated string of typical ingredients for the global/popular version of this product) based on your knowledge. Output RAW JSON ONLY.";
            
            ResponseEntity<String> response = executeWithModelFallback(headers, model -> Map.of(
                    "model", model,
                    "store", false,
                    "input", List.of(
                            Map.of("type", "text", "text", dbPrompt)
                    )
            ));

            JsonNode root = objectMapper.readTree(response.getBody());
            JsonNode steps = root.path("steps");
            String jsonText = "";

            for (JsonNode step : steps) {
                if (("model_output".equals(step.path("type").asText()) || step.has("modelOutput")) && (step.has("content") || step.path("modelOutput").has("text"))) {
                    if (step.has("content")) {
                         jsonText = step.path("content").get(0).path("text").asText();
                    } else {
                         jsonText = step.path("modelOutput").path("text").asText();
                    }
                    break;
                }
            }
            jsonText = extractJson(jsonText);
            JsonNode parsedJson = objectMapper.readTree(jsonText);
            return new com.digout.dto.OpenFoodFactsDTO(
                parsedJson.path("product_name").asText(productName),
                parsedJson.path("ingredients_text").asText(""),
                null,
                null
            );
        } catch (Exception e) {
            throw new RuntimeException("Fallback database AI failed: " + e.getMessage(), e);
        }
    }
}
